// COSGRAL W1: input checks for sidebar folder requests from the renderer.

import {
  type CreateSidebarFolderInput,
  type DeleteSidebarFolderInput,
  type DuplicateSidebarFolderInput,
  isSidebarItemKind,
  type MoveSidebarFolderInput,
  type MoveSidebarItemInput,
  SIDEBAR_LIMITS,
  type UpdateSidebarFolderInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isNumber, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseCreateSidebarFolder(value: unknown): CreateSidebarFolderInput {
  if (!isObject(value)) throw new Error("Folder details are required.");
  return { name: folderName(value.name), parentId: optionalFolderId(value.parentId, "parentId") };
}

export function parseUpdateSidebarFolder(value: unknown): UpdateSidebarFolderInput {
  if (!isObject(value)) throw new Error("Folder details are required.");
  const input: UpdateSidebarFolderInput = { folderId: requireString(value.folderId, "folderId") };
  if (value.name !== undefined) input.name = folderName(value.name);
  if (value.collapsed !== undefined) {
    if (!isBoolean(value.collapsed)) throw new Error("collapsed must be true or false.");
    input.collapsed = value.collapsed;
  }
  return input;
}

export function parseMoveSidebarFolder(value: unknown): MoveSidebarFolderInput {
  if (!isObject(value)) throw new Error("Folder details are required.");
  return {
    folderId: requireString(value.folderId, "folderId"),
    parentId: optionalFolderId(value.parentId, "parentId"),
    position: position(value.position),
  };
}

export function parseSidebarFolderId(value: unknown): DuplicateSidebarFolderInput & DeleteSidebarFolderInput {
  if (!isObject(value)) throw new Error("Folder details are required.");
  return { folderId: requireString(value.folderId, "folderId") };
}

export function parseMoveSidebarItem(value: unknown): MoveSidebarItemInput {
  if (!isObject(value)) throw new Error("Item details are required.");
  if (!isSidebarItemKind(value.itemKind)) throw new Error("itemKind must be agent or channel.");
  return {
    itemKind: value.itemKind,
    itemId: requireString(value.itemId, "itemId"),
    folderId: optionalFolderId(value.folderId, "folderId"),
    position: position(value.position),
  };
}

function folderName(value: unknown): string {
  // Allow surrounding spaces; the store trims and checks the length again.
  if (!isString(value)) throw new Error("name is required.");
  return requireString(value, "name", SIDEBAR_LIMITS.folderName * 4);
}

function optionalFolderId(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : requireString(value, field);
}

function position(value: unknown): number {
  if (!isNumber(value) || !Number.isInteger(value) || value < 0) throw new Error("position must be 0 or more.");
  return value;
}
