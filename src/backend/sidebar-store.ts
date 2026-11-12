// COSGRAL W1: user folders in the sidebar.
// Each change validates the whole layout in memory, then writes it with one command
// (an event in the log plus both projections), so positions stay 0..n-1 per parent.

import { randomUUID } from "node:crypto";
import {
  type CreateSidebarFolderInput,
  type DeleteSidebarFolderInput,
  type DuplicateSidebarFolderInput,
  type MoveSidebarFolderInput,
  type MoveSidebarItemInput,
  SIDEBAR_LIMITS,
  type SidebarFolder,
  type SidebarFolderChange,
  type SidebarItemKind,
  type SidebarItemPlacement,
  type SidebarLayout,
  type UpdateSidebarFolderInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

const COPY_SUFFIX = " copy";

export class SidebarStore {
  readonly #database: OpenBotDatabase;
  readonly #now: () => Date;

  constructor(database: OpenBotDatabase, now: () => Date = () => new Date()) {
    this.#database = database;
    this.#now = now;
  }

  layout(): SidebarLayout {
    const db = this.#database.connection;
    const folders = rows(
      db
        .prepare(
          `SELECT folder_id, name, parent_id, position, collapsed, created_at, updated_at
           FROM projection_sidebar_folders
           ORDER BY parent_id IS NOT NULL, parent_id, position`,
        )
        .all(),
    ).map(folderFromRow);
    const placements = rows(
      db
        .prepare(
          `SELECT item_kind, item_id, folder_id, position
           FROM projection_sidebar_placements
           ORDER BY folder_id IS NOT NULL, folder_id, position`,
        )
        .all(),
    ).map(placementFromRow);
    return { folders, placements };
  }

  createFolder(input: CreateSidebarFolderInput): SidebarFolderChange {
    const layout = this.layout();
    const name = folderName(input.name);
    requireFolder(layout, input.parentId);
    if (depth(layout, input.parentId) + 1 > SIDEBAR_LIMITS.folderDepth) throw tooDeep();
    if (layout.folders.length >= SIDEBAR_LIMITS.folders) throw tooMany();
    const at = this.#isoNow();
    const folder: SidebarFolder = {
      id: randomUUID(),
      name,
      parentId: input.parentId,
      position: childFolders(layout, input.parentId).length,
      collapsed: false,
      createdAt: at,
      updatedAt: at,
    };
    const next = { ...layout, folders: [...layout.folders, folder] };
    return { folder, layout: this.#save(next, "folder-created", { folder }) };
  }

  updateFolder(input: UpdateSidebarFolderInput): SidebarLayout {
    const layout = this.layout();
    const folder = requireExistingFolder(layout, input.folderId);
    const name = input.name === undefined ? folder.name : folderName(input.name);
    const collapsed = input.collapsed ?? folder.collapsed;
    if (name === folder.name && collapsed === folder.collapsed) return layout;
    const updated = { ...folder, name, collapsed, updatedAt: this.#isoNow() };
    const next = { ...layout, folders: layout.folders.map((item) => (item.id === folder.id ? updated : item)) };
    return this.#save(next, "folder-updated", { folderId: folder.id, name, collapsed });
  }

  moveFolder(input: MoveSidebarFolderInput): SidebarLayout {
    const layout = this.layout();
    const folder = requireExistingFolder(layout, input.folderId);
    requireFolder(layout, input.parentId);
    if (input.parentId !== null && subtree(layout, folder.id).has(input.parentId)) {
      throw new Error("A folder cannot move into itself or its subfolders.");
    }
    if (depth(layout, input.parentId) + height(layout, folder.id) > SIDEBAR_LIMITS.folderDepth) throw tooDeep();
    const moved = { ...folder, parentId: input.parentId, updatedAt: this.#isoNow() };
    const siblings = childFolders(layout, input.parentId).filter((item) => item.id !== folder.id);
    siblings.splice(clampPosition(input.position, siblings.length), 0, moved);
    const rest = layout.folders.filter((item) => item.id !== folder.id && item.parentId !== input.parentId);
    const next = { ...layout, folders: [...rest, ...siblings] };
    return this.#save(next, "folder-moved", {
      folderId: folder.id,
      parentId: input.parentId,
      position: input.position,
    });
  }

  duplicateFolder(input: DuplicateSidebarFolderInput): SidebarFolderChange {
    const layout = this.layout();
    const original = requireExistingFolder(layout, input.folderId);
    const copied = [...subtree(layout, original.id)];
    if (layout.folders.length + copied.length > SIDEBAR_LIMITS.folders) throw tooMany();
    const at = this.#isoNow();
    const ids = new Map(copied.map((id) => [id, randomUUID()]));
    const copies = layout.folders
      .filter((folder) => ids.has(folder.id))
      .map((folder): SidebarFolder => {
        const isRoot = folder.id === original.id;
        return {
          ...folder,
          id: ids.get(folder.id) ?? randomUUID(),
          name: isRoot ? copyName(folder.name) : folder.name,
          parentId: isRoot ? folder.parentId : (ids.get(folder.parentId ?? "") ?? null),
          createdAt: at,
          updatedAt: at,
        };
      });
    const root = copies.find((folder) => folder.id === ids.get(original.id));
    if (!root) throw new Error("This folder could not be copied.");
    const siblings = childFolders(layout, original.parentId);
    siblings.splice(siblings.findIndex((folder) => folder.id === original.id) + 1, 0, root);
    const others = layout.folders.filter((folder) => folder.parentId !== original.parentId);
    const next = { ...layout, folders: [...others, ...siblings, ...copies.filter((folder) => folder !== root)] };
    const saved = this.#save(next, "folder-duplicated", { folderId: original.id, copyId: root.id });
    return { folder: requireExistingFolder(saved, root.id), layout: saved };
  }

  deleteFolder(input: DeleteSidebarFolderInput): SidebarLayout {
    const layout = this.layout();
    const folder = requireExistingFolder(layout, input.folderId);
    const parentId = folder.parentId;
    const siblings = childFolders(layout, parentId).flatMap((item) =>
      item.id === folder.id
        ? childFolders(layout, folder.id).map((child) => ({ ...child, parentId, updatedAt: this.#isoNow() }))
        : [item],
    );
    const folders = [
      ...layout.folders.filter(
        (item) => item.id !== folder.id && item.parentId !== parentId && item.parentId !== folder.id,
      ),
      ...siblings,
    ];
    const items = [...childItems(layout, parentId), ...childItems(layout, folder.id)].map((item) => ({
      ...item,
      folderId: parentId,
    }));
    const placements = [
      ...layout.placements.filter((item) => item.folderId !== parentId && item.folderId !== folder.id),
      ...items,
    ];
    return this.#save({ folders, placements }, "folder-deleted", { folderId: folder.id });
  }

  moveItem(input: MoveSidebarItemInput): SidebarLayout {
    const layout = this.layout();
    requireFolder(layout, input.folderId);
    const placement: SidebarItemPlacement = {
      itemKind: input.itemKind,
      itemId: input.itemId,
      folderId: input.folderId,
      position: 0,
    };
    const siblings = childItems(layout, input.folderId).filter((item) => !sameItem(item, placement));
    siblings.splice(clampPosition(input.position, siblings.length), 0, placement);
    const rest = layout.placements.filter((item) => !sameItem(item, placement) && item.folderId !== input.folderId);
    return this.#save({ ...layout, placements: [...rest, ...siblings] }, "item-moved", { ...input });
  }

  /** Drops placements of agents or channels that no longer exist. Returns whether anything changed. */
  pruneItems(itemKind: SidebarItemKind, knownIds: readonly string[]): boolean {
    const layout = this.layout();
    const known = new Set(knownIds);
    const placements = layout.placements.filter((item) => item.itemKind !== itemKind || known.has(item.itemId));
    if (placements.length === layout.placements.length) return false;
    this.#save({ ...layout, placements }, "items-pruned", { itemKind });
    return true;
  }

  #save(layout: SidebarLayout, change: string, detail: DynamicRecord): SidebarLayout {
    const normalized = normalize(layout);
    const occurredAt = this.#isoNow();
    this.#database.dispatch(
      `sidebar:${change}:${randomUUID()}`,
      [
        {
          aggregateType: "sidebar",
          aggregateId: "sidebar",
          eventType: `sidebar.${change}`,
          payload: { ...detail },
          occurredAt,
        },
      ],
      (db, sequences) => {
        const sequence = sequences.at(-1) ?? 0;
        db.exec("DELETE FROM projection_sidebar_placements");
        db.exec("DELETE FROM projection_sidebar_folders");
        const insertFolder = db.prepare(
          `INSERT INTO projection_sidebar_folders (
             folder_id, name, parent_id, position, collapsed, created_at, updated_at, last_event_sequence
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const folder of normalized.folders) {
          insertFolder.run(
            folder.id,
            folder.name,
            folder.parentId,
            folder.position,
            folder.collapsed ? 1 : 0,
            folder.createdAt,
            folder.updatedAt,
            sequence,
          );
        }
        const insertPlacement = db.prepare(
          `INSERT INTO projection_sidebar_placements (
             item_kind, item_id, folder_id, position, last_event_sequence
           ) VALUES (?, ?, ?, ?, ?)`,
        );
        for (const item of normalized.placements) {
          insertPlacement.run(item.itemKind, item.itemId, item.folderId, item.position, sequence);
        }
        return null;
      },
    );
    return this.layout();
  }

  #isoNow(): string {
    return this.#now().toISOString();
  }
}

/** Positions 0..n-1 among the folders of one parent and among the items of one folder, keeping their order. */
function normalize(layout: SidebarLayout): SidebarLayout {
  const folderGroups = groupBy(layout.folders, (folder) => folder.parentId);
  const itemGroups = groupBy(layout.placements, (item) => item.folderId);
  return {
    folders: [...folderGroups.values()].flatMap((group) => group.map((folder, position) => ({ ...folder, position }))),
    placements: [...itemGroups.values()].flatMap((group) => group.map((item, position) => ({ ...item, position }))),
  };
}

/** Groups in first-seen order; each group keeps the order it had in the list (callers put siblings in order). */
function groupBy<T>(items: readonly T[], key: (item: T) => string | null): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const group = groups.get(key(item)) ?? [];
    group.push(item);
    groups.set(key(item), group);
  }
  return groups;
}

function childFolders(layout: SidebarLayout, parentId: string | null): SidebarFolder[] {
  return layout.folders.filter((folder) => folder.parentId === parentId).sort((a, b) => a.position - b.position);
}

function childItems(layout: SidebarLayout, folderId: string | null): SidebarItemPlacement[] {
  return layout.placements.filter((item) => item.folderId === folderId).sort((a, b) => a.position - b.position);
}

/** Level of a folder: 1 at the top; 0 for the top level itself (null). */
function depth(layout: SidebarLayout, folderId: string | null): number {
  const chain = new Set<string>();
  let current = folderId;
  while (current !== null && !chain.has(current)) {
    chain.add(current);
    current = layout.folders.find((folder) => folder.id === current)?.parentId ?? null;
  }
  return chain.size;
}

/** Levels in a folder's subtree: 1 for a folder without subfolders. */
function height(layout: SidebarLayout, folderId: string): number {
  const children = layout.folders.filter((folder) => folder.parentId === folderId);
  return 1 + Math.max(0, ...children.map((child) => height(layout, child.id)));
}

/** The folder and all its subfolders. */
function subtree(layout: SidebarLayout, folderId: string): Set<string> {
  const ids = new Set([folderId]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of layout.folders) {
      if (folder.parentId !== null && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        added = true;
      }
    }
  }
  return ids;
}

function requireFolder(layout: SidebarLayout, folderId: string | null): void {
  if (folderId !== null) requireExistingFolder(layout, folderId);
}

function requireExistingFolder(layout: SidebarLayout, folderId: string): SidebarFolder {
  const folder = layout.folders.find((candidate) => candidate.id === folderId);
  if (!folder) throw new Error("This folder no longer exists.");
  return folder;
}

function folderName(value: string): string {
  const name = value.trim();
  if (!name || name.length > SIDEBAR_LIMITS.folderName || /\p{Cc}/u.test(name)) {
    throw new Error(`A folder name has 1–${SIDEBAR_LIMITS.folderName} characters.`);
  }
  return name;
}

function copyName(name: string): string {
  return `${name.slice(0, SIDEBAR_LIMITS.folderName - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
}

function clampPosition(position: number, length: number): number {
  if (!Number.isFinite(position)) return length;
  return Math.min(Math.max(Math.trunc(position), 0), length);
}

function sameItem(a: Pick<SidebarItemPlacement, "itemKind" | "itemId">, b: SidebarItemPlacement): boolean {
  return a.itemKind === b.itemKind && a.itemId === b.itemId;
}

function tooDeep(): Error {
  return new Error(`Folders nest at most ${SIDEBAR_LIMITS.folderDepth} levels.`);
}

function tooMany(): Error {
  return new Error(`There can be at most ${SIDEBAR_LIMITS.folders} folders.`);
}

function rows(value: unknown): DynamicRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid SQLite result set.");
  return value.map((row) => {
    if (!isDynamicRecord(row)) throw new Error("Invalid sidebar row.");
    return row;
  });
}

function folderFromRow(row: DynamicRecord): SidebarFolder {
  const { folder_id, name, parent_id, position, collapsed, created_at, updated_at } = row;
  if (
    !isString(folder_id) ||
    !isString(name) ||
    (parent_id !== null && !isString(parent_id)) ||
    !isNumber(position) ||
    !isNumber(collapsed) ||
    !isString(created_at) ||
    !isString(updated_at)
  ) {
    throw new Error("Invalid sidebar folder row.");
  }
  return {
    id: folder_id,
    name,
    parentId: parent_id,
    position,
    collapsed: collapsed === 1,
    createdAt: created_at,
    updatedAt: updated_at,
  };
}

function placementFromRow(row: DynamicRecord): SidebarItemPlacement {
  const { item_kind, item_id, folder_id, position } = row;
  if (
    (item_kind !== "agent" && item_kind !== "channel") ||
    !isString(item_id) ||
    (folder_id !== null && !isString(folder_id)) ||
    !isNumber(position)
  ) {
    throw new Error("Invalid sidebar placement row.");
  }
  return { itemKind: item_kind, itemId: item_id, folderId: folder_id, position };
}
