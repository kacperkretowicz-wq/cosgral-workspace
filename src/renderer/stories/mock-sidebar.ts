// Story and test double of the backend sidebar store (src/backend/sidebar-store.ts):
// the same rules and error messages, kept in memory. The real store stays the source of truth.

import {
  type CreateSidebarFolderInput,
  type MoveSidebarFolderInput,
  type MoveSidebarItemInput,
  SIDEBAR_LIMITS,
  type SidebarFolder,
  type SidebarFolderChange,
  type SidebarItemPlacement,
  type SidebarLayout,
  type UpdateSidebarFolderInput,
} from "@openbot/contracts/ipc";

export interface MockSidebar {
  layout: () => SidebarLayout;
  createFolder: (input: CreateSidebarFolderInput) => SidebarFolderChange;
  updateFolder: (input: UpdateSidebarFolderInput) => SidebarLayout;
  moveFolder: (input: MoveSidebarFolderInput) => SidebarLayout;
  duplicateFolder: (folderId: string) => SidebarFolderChange;
  deleteFolder: (folderId: string) => SidebarLayout;
  moveItem: (input: MoveSidebarItemInput) => SidebarLayout;
}

export function createMockSidebar(initial: SidebarLayout = { folders: [], placements: [] }): MockSidebar {
  let state: SidebarLayout = structuredClone(initial);
  let counter = 0;
  const now = () => new Date().toISOString();

  const childFolders = (layout: SidebarLayout, parentId: string | null) =>
    layout.folders.filter((folder) => folder.parentId === parentId).sort((a, b) => a.position - b.position);
  const childItems = (layout: SidebarLayout, folderId: string | null) =>
    layout.placements.filter((item) => item.folderId === folderId).sort((a, b) => a.position - b.position);
  const find = (layout: SidebarLayout, folderId: string): SidebarFolder => {
    const folder = layout.folders.find((candidate) => candidate.id === folderId);
    if (!folder) throw new Error("This folder no longer exists.");
    return folder;
  };
  const requireFolder = (layout: SidebarLayout, folderId: string | null) => {
    if (folderId !== null) find(layout, folderId);
  };
  const depth = (layout: SidebarLayout, folderId: string | null) => {
    let level = 0;
    let current = folderId;
    while (current !== null && level <= SIDEBAR_LIMITS.folderDepth + 1) {
      level += 1;
      current = layout.folders.find((folder) => folder.id === current)?.parentId ?? null;
    }
    return level;
  };
  const height = (layout: SidebarLayout, folderId: string): number =>
    1 +
    Math.max(0, ...layout.folders.filter((folder) => folder.parentId === folderId).map((c) => height(layout, c.id)));
  const subtree = (layout: SidebarLayout, folderId: string): Set<string> => {
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
  };
  const clamp = (position: number, length: number) =>
    Number.isFinite(position) ? Math.min(Math.max(Math.trunc(position), 0), length) : length;
  const name = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > SIDEBAR_LIMITS.folderName) {
      throw new Error(`A folder name has 1–${SIDEBAR_LIMITS.folderName} characters.`);
    }
    return trimmed;
  };
  const normalize = (layout: SidebarLayout): SidebarLayout => {
    const folderCounts = new Map<string | null, number>();
    const itemCounts = new Map<string | null, number>();
    return {
      folders: layout.folders.map((folder) => {
        const position = folderCounts.get(folder.parentId) ?? 0;
        folderCounts.set(folder.parentId, position + 1);
        return { ...folder, position };
      }),
      placements: layout.placements.map((item) => {
        const position = itemCounts.get(item.folderId) ?? 0;
        itemCounts.set(item.folderId, position + 1);
        return { ...item, position };
      }),
    };
  };
  /** Positions follow the order of the list, like the real store (siblings keep the order they have in the list). */
  const save = (layout: SidebarLayout): SidebarLayout => {
    state = normalize(layout);
    return structuredClone(state);
  };
  state = normalize({
    folders: [...state.folders].sort((a, b) => a.position - b.position),
    placements: [...state.placements].sort((a, b) => a.position - b.position),
  });

  return {
    layout: () => structuredClone(state),
    createFolder(input) {
      requireFolder(state, input.parentId);
      if (depth(state, input.parentId) + 1 > SIDEBAR_LIMITS.folderDepth) {
        throw new Error(`Folders nest at most ${SIDEBAR_LIMITS.folderDepth} levels.`);
      }
      counter += 1;
      const folder: SidebarFolder = {
        id: `mock-folder-${counter}`,
        name: name(input.name),
        parentId: input.parentId,
        position: childFolders(state, input.parentId).length,
        collapsed: false,
        createdAt: now(),
        updatedAt: now(),
      };
      const layout = save({ ...state, folders: [...state.folders, folder] });
      return { folder: find(layout, folder.id), layout };
    },
    updateFolder(input) {
      const folder = find(state, input.folderId);
      const updated = {
        ...folder,
        name: input.name === undefined ? folder.name : name(input.name),
        collapsed: input.collapsed ?? folder.collapsed,
        updatedAt: now(),
      };
      return save({ ...state, folders: state.folders.map((item) => (item.id === folder.id ? updated : item)) });
    },
    moveFolder(input) {
      const folder = find(state, input.folderId);
      requireFolder(state, input.parentId);
      if (input.parentId !== null && subtree(state, folder.id).has(input.parentId)) {
        throw new Error("A folder cannot move into itself or its subfolders.");
      }
      if (depth(state, input.parentId) + height(state, folder.id) > SIDEBAR_LIMITS.folderDepth) {
        throw new Error(`Folders nest at most ${SIDEBAR_LIMITS.folderDepth} levels.`);
      }
      const siblings = childFolders(state, input.parentId).filter((item) => item.id !== folder.id);
      siblings.splice(clamp(input.position, siblings.length), 0, { ...folder, parentId: input.parentId });
      const rest = state.folders.filter((item) => item.id !== folder.id && item.parentId !== input.parentId);
      return save({ ...state, folders: [...rest, ...siblings] });
    },
    duplicateFolder(folderId) {
      const original = find(state, folderId);
      const copied = subtree(state, original.id);
      if (state.folders.length + copied.size > SIDEBAR_LIMITS.folders) {
        throw new Error(`There can be at most ${SIDEBAR_LIMITS.folders} folders.`);
      }
      const ids = new Map([...copied].map((id) => [id, `mock-folder-${++counter}`]));
      const copies = state.folders
        .filter((folder) => ids.has(folder.id))
        .map(
          (folder): SidebarFolder => ({
            ...folder,
            id: ids.get(folder.id) ?? folder.id,
            name: folder.id === original.id ? `${folder.name} copy`.slice(0, SIDEBAR_LIMITS.folderName) : folder.name,
            parentId: folder.id === original.id ? folder.parentId : (ids.get(folder.parentId ?? "") ?? null),
            createdAt: now(),
            updatedAt: now(),
          }),
        );
      const root = copies.find((folder) => folder.id === ids.get(original.id));
      if (!root) throw new Error("This folder could not be copied.");
      const siblings = childFolders(state, original.parentId);
      siblings.splice(siblings.findIndex((folder) => folder.id === original.id) + 1, 0, root);
      const others = state.folders.filter((folder) => folder.parentId !== original.parentId);
      const layout = save({
        ...state,
        folders: [...others, ...siblings, ...copies.filter((folder) => folder !== root)],
      });
      return { folder: find(layout, root.id), layout };
    },
    deleteFolder(folderId) {
      const folder = find(state, folderId);
      const parentId = folder.parentId;
      const siblings = childFolders(state, parentId).flatMap((item) =>
        item.id === folder.id ? childFolders(state, folder.id).map((child) => ({ ...child, parentId })) : [item],
      );
      const folders = [
        ...state.folders.filter(
          (item) => item.id !== folder.id && item.parentId !== parentId && item.parentId !== folder.id,
        ),
        ...siblings,
      ];
      const moved = [...childItems(state, parentId), ...childItems(state, folder.id)].map((item) => ({
        ...item,
        folderId: parentId,
      }));
      const placements = [
        ...state.placements.filter((item) => item.folderId !== parentId && item.folderId !== folder.id),
        ...moved,
      ];
      return save({ folders, placements });
    },
    moveItem(input) {
      requireFolder(state, input.folderId);
      const placement: SidebarItemPlacement = { ...input, position: 0 };
      const same = (item: SidebarItemPlacement) => item.itemKind === input.itemKind && item.itemId === input.itemId;
      const siblings = childItems(state, input.folderId).filter((item) => !same(item));
      siblings.splice(clamp(input.position, siblings.length), 0, placement);
      const rest = state.placements.filter((item) => !same(item) && item.folderId !== input.folderId);
      return save({ ...state, placements: [...rest, ...siblings] });
    },
  };
}
