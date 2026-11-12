// COSGRAL W1: user folders in the sidebar.
//
// Folders nest up to `SIDEBAR_LIMITS.folderDepth` levels. Each agent or channel sits in one
// folder or at the top level. The layout is saved in the local database and survives a restart.
// Every change returns the new layout and also emits `sidebar-layout-changed` to all windows.
// Calls are scoped to the selected server like agent calls; remote servers have no folders yet.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const SIDEBAR_LIMITS = {
  folderName: 80,
  /** A top-level folder is level 1. */
  folderDepth: 5,
  folders: 200,
} as const;

export const SIDEBAR_ITEM_KINDS = ["agent", "channel"] as const;
export type SidebarItemKind = (typeof SIDEBAR_ITEM_KINDS)[number];

export interface SidebarFolder {
  id: string;
  name: string;
  /** null for a top-level folder. */
  parentId: string | null;
  /** Order among sibling folders, from 0. */
  position: number;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Where one agent or channel sits. Items without a placement are at the top level, in their usual order. */
export interface SidebarItemPlacement {
  itemKind: SidebarItemKind;
  /** `BotSummary.id` or `WorkspaceChannel.id`. */
  itemId: string;
  /** null for the top level. */
  folderId: string | null;
  /** Order among sibling items, from 0. Sibling folders come before sibling items. */
  position: number;
}

export interface SidebarLayout {
  folders: SidebarFolder[];
  placements: SidebarItemPlacement[];
}

export interface CreateSidebarFolderInput {
  name: string;
  parentId: string | null;
}

/** Rename and/or collapse a folder. */
export interface UpdateSidebarFolderInput {
  folderId: string;
  name?: string;
  collapsed?: boolean;
}

/** `position` past the end puts the folder last. A folder cannot move into itself or its subfolders. */
export interface MoveSidebarFolderInput {
  folderId: string;
  parentId: string | null;
  position: number;
}

/** Copies the folder and its subfolders ("<name> copy"), without agents and channels: each item stays in one place. */
export interface DuplicateSidebarFolderInput {
  folderId: string;
}

/** Deletes the folder only: its subfolders, agents and channels move up to its parent. */
export interface DeleteSidebarFolderInput {
  folderId: string;
}

/** `position` past the end puts the item last. */
export interface MoveSidebarItemInput {
  itemKind: SidebarItemKind;
  itemId: string;
  folderId: string | null;
  position: number;
}

export interface SidebarFolderChange {
  /** The new (or copied) folder. */
  folder: SidebarFolder;
  layout: SidebarLayout;
}

export function emptySidebarLayout(): SidebarLayout {
  return { folders: [], placements: [] };
}

export function isSidebarItemKind(value: unknown): value is SidebarItemKind {
  return isOneOf(SIDEBAR_ITEM_KINDS, value);
}

export function isSidebarFolder(value: unknown): value is SidebarFolder {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    (value.parentId === null || isString(value.parentId)) &&
    isNumber(value.position) &&
    isBoolean(value.collapsed) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isSidebarItemPlacement(value: unknown): value is SidebarItemPlacement {
  return (
    isDynamicRecord(value) &&
    isSidebarItemKind(value.itemKind) &&
    isString(value.itemId) &&
    (value.folderId === null || isString(value.folderId)) &&
    isNumber(value.position)
  );
}

export function isSidebarLayout(value: unknown): value is SidebarLayout {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.folders) &&
    value.folders.every(isSidebarFolder) &&
    Array.isArray(value.placements) &&
    value.placements.every(isSidebarItemPlacement)
  );
}
