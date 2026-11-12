// COSGRAL W1: the sidebar folder tree as a flat list of rows.
//
// The backend saves a `SidebarLayout` (folders with a parent and a position, plus where each agent
// sits). The sidebar draws it as one flat list so every row can sit at its own indent:
// at each level folders come first, then agents. Everything here is pure.

import { SIDEBAR_LIMITS, type SidebarFolder, type SidebarLayout } from "@openbot/contracts/ipc";

export interface SidebarFolderRow {
  type: "folder";
  folder: SidebarFolder;
  /** 1 for a top-level folder. */
  depth: number;
  expanded: boolean;
  /** Agents in this folder and all its subfolders (only those shown, so a search narrows it). */
  agentCount: number;
}

export interface SidebarAgentRow<T> {
  type: "agent";
  bot: T;
  /** 0 at the top level, otherwise one more than its folder. */
  depth: number;
}

export type SidebarRow<T extends { id: string } = { id: string }> = SidebarFolderRow | SidebarAgentRow<T>;

function byPosition<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.position - right.position);
}

function childFolders(layout: SidebarLayout, parentId: string | null): SidebarFolder[] {
  return byPosition(layout.folders.filter((folder) => folder.parentId === parentId));
}

/**
 * Rows to draw, top to bottom. With `searching`, only folders that hold a shown agent remain and they are
 * drawn open. `bots` is the (already filtered) agent list in its usual order.
 */
export function buildSidebarRows<T extends { id: string }>(
  layout: SidebarLayout,
  bots: readonly T[],
  options: { searching?: boolean } = {},
): SidebarRow<T>[] {
  const searching = options.searching === true;
  const folderIds = new Set(layout.folders.map((folder) => folder.id));
  const botById = new Map(bots.map((bot) => [bot.id, bot]));
  const placement = new Map(
    layout.placements.filter((item) => item.itemKind === "agent").map((item) => [item.itemId, item]),
  );

  // Agents by folder (null = top level). Placed agents keep their saved order; the rest follow in the usual order.
  const agentsIn = new Map<string | null, T[]>();
  const placed: Array<{ bot: T; folderId: string | null; position: number }> = [];
  const loose: T[] = [];
  for (const bot of bots) {
    const saved = placement.get(bot.id);
    if (!saved) loose.push(bot);
    else
      placed.push({
        bot,
        folderId: saved.folderId && folderIds.has(saved.folderId) ? saved.folderId : null,
        position: saved.position,
      });
  }
  for (const item of byPosition(placed)) {
    agentsIn.set(item.folderId, [...(agentsIn.get(item.folderId) ?? []), item.bot]);
  }
  agentsIn.set(null, [...(agentsIn.get(null) ?? []), ...loose]);

  const countCache = new Map<string, number>();
  const countAgents = (folderId: string): number => {
    const cached = countCache.get(folderId);
    if (cached !== undefined) return cached;
    const total =
      (agentsIn.get(folderId)?.length ?? 0) +
      childFolders(layout, folderId).reduce((sum, child) => sum + countAgents(child.id), 0);
    countCache.set(folderId, total);
    return total;
  };

  const rows: SidebarRow<T>[] = [];
  const visit = (parentId: string | null, level: number): void => {
    for (const folder of childFolders(layout, parentId)) {
      const agentCount = countAgents(folder.id);
      if (searching && agentCount === 0) continue;
      const expanded = searching || !folder.collapsed;
      rows.push({ type: "folder", folder, depth: level, expanded, agentCount });
      if (expanded) visit(folder.id, level + 1);
    }
    for (const bot of agentsIn.get(parentId) ?? []) {
      // `botById` keeps this honest: only agents that exist are drawn.
      if (botById.has(bot.id)) rows.push({ type: "agent", bot, depth: parentId === null ? 0 : level });
    }
  };
  visit(null, 1);
  return rows;
}

/** Level of a folder: 1 at the top, 0 for the top level itself. */
export function folderDepth(layout: SidebarLayout, folderId: string | null) {
  let level = 0;
  let current = folderId;
  const seen = new Set<string>();
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    level += 1;
    current = layout.folders.find((folder) => folder.id === current)?.parentId ?? null;
  }
  return level;
}

/** Levels in a folder's subtree: 1 for a folder without subfolders. */
function folderHeight(layout: SidebarLayout, folderId: string): number {
  const children = layout.folders.filter((folder) => folder.parentId === folderId);
  return 1 + Math.max(0, ...children.map((child) => folderHeight(layout, child.id)));
}

function subtreeIds(layout: SidebarLayout, folderId: string): Set<string> {
  const ids = new Set([folderId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const folder of layout.folders) {
      if (folder.parentId !== null && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function canCreateSubfolder(layout: SidebarLayout, parentId: string | null): boolean {
  return folderDepth(layout, parentId) + 1 <= SIDEBAR_LIMITS.folderDepth;
}

export interface MoveTarget {
  /** null is the top level. */
  folderId: string | null;
  label: string;
  /** 0 for the top level, 1 for a top-level folder. */
  depth: number;
  /** The item or folder is there already. */
  current: boolean;
  /** Not allowed: the folder would nest deeper than the limit. */
  disabled: boolean;
}

/** The top level and every folder, in tree order. */
function allTargets(
  layout: SidebarLayout,
  skip: ReadonlySet<string>,
): Array<{ folderId: string | null; label: string; depth: number }> {
  const targets: Array<{ folderId: string | null; label: string; depth: number }> = [
    { folderId: null, label: "Top level", depth: 0 },
  ];
  const visit = (parentId: string | null, level: number): void => {
    for (const folder of childFolders(layout, parentId)) {
      if (skip.has(folder.id)) continue;
      targets.push({ folderId: folder.id, label: folder.name, depth: level });
      visit(folder.id, level + 1);
    }
  };
  visit(null, 1);
  return targets;
}

export function agentMoveTargets(layout: SidebarLayout, botId: string): MoveTarget[] {
  const saved = layout.placements.find((item) => item.itemKind === "agent" && item.itemId === botId);
  const currentId =
    saved?.folderId && layout.folders.some((folder) => folder.id === saved.folderId) ? saved.folderId : null;
  return allTargets(layout, new Set()).map((target) => ({
    ...target,
    current: target.folderId === currentId,
    disabled: false,
  }));
}

/** Where a folder can go: not into itself or its subfolders, and not so deep that its own subfolders pass the limit. */
export function folderMoveTargets(layout: SidebarLayout, folderId: string): MoveTarget[] {
  const parentId = layout.folders.find((folder) => folder.id === folderId)?.parentId ?? null;
  const height = folderHeight(layout, folderId);
  return allTargets(layout, subtreeIds(layout, folderId)).map((target) => ({
    ...target,
    current: target.folderId === parentId,
    disabled: folderDepth(layout, target.folderId) + height > SIDEBAR_LIMITS.folderDepth,
  }));
}
