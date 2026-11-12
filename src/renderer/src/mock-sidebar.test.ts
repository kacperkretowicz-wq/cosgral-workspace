import { describe, expect, it } from "vitest";
import { createMockSidebar } from "../stories/mock-sidebar";

function names(sidebar: ReturnType<typeof createMockSidebar>, parentId: string | null): string[] {
  return sidebar
    .layout()
    .folders.filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map((folder) => folder.name);
}

describe("mock sidebar store (same rules as the backend)", () => {
  it("creates folders at the end of their siblings and nests up to five levels", () => {
    const sidebar = createMockSidebar();
    const first = sidebar.createFolder({ name: "  Work  ", parentId: null }).folder;
    sidebar.createFolder({ name: "Home", parentId: null });
    expect(names(sidebar, null)).toEqual(["Work", "Home"]);
    let parent = first.id;
    for (let level = 2; level <= 5; level += 1) {
      parent = sidebar.createFolder({ name: `L${level}`, parentId: parent }).folder.id;
    }
    expect(() => sidebar.createFolder({ name: "L6", parentId: parent })).toThrow("Folders nest at most 5 levels.");
  });

  it("rejects an empty or too long name", () => {
    const sidebar = createMockSidebar();
    expect(() => sidebar.createFolder({ name: "   ", parentId: null })).toThrow("A folder name has 1–80 characters.");
    expect(() => sidebar.createFolder({ name: "x".repeat(81), parentId: null })).toThrow(
      "A folder name has 1–80 characters.",
    );
  });

  it("renames and collapses", () => {
    const sidebar = createMockSidebar();
    const { folder } = sidebar.createFolder({ name: "Work", parentId: null });
    const layout = sidebar.updateFolder({ folderId: folder.id, name: "Projects", collapsed: true });
    expect(layout.folders[0]).toMatchObject({ name: "Projects", collapsed: true });
  });

  it("duplicates a folder with its subfolders but without agents, right after the original", () => {
    const sidebar = createMockSidebar();
    const work = sidebar.createFolder({ name: "Work", parentId: null }).folder;
    sidebar.createFolder({ name: "Later", parentId: null });
    sidebar.createFolder({ name: "Deep", parentId: work.id });
    sidebar.moveItem({ itemKind: "agent", itemId: "research", folderId: work.id, position: 0 });
    const { folder, layout } = sidebar.duplicateFolder(work.id);
    expect(folder.name).toBe("Work copy");
    expect(names(sidebar, null)).toEqual(["Work", "Work copy", "Later"]);
    expect(names(sidebar, folder.id)).toEqual(["Deep"]);
    expect(layout.placements.filter((item) => item.folderId === folder.id)).toEqual([]);
    expect(layout.placements.filter((item) => item.folderId === work.id)).toHaveLength(1);
  });

  it("deletes only the folder: subfolders and agents move up to its parent", () => {
    const sidebar = createMockSidebar();
    const outer = sidebar.createFolder({ name: "Outer", parentId: null }).folder;
    const inner = sidebar.createFolder({ name: "Inner", parentId: outer.id }).folder;
    sidebar.createFolder({ name: "Leaf", parentId: inner.id });
    sidebar.moveItem({ itemKind: "agent", itemId: "chief", folderId: inner.id, position: 0 });
    const layout = sidebar.deleteFolder(inner.id);
    expect(layout.folders.map((folder) => folder.name).sort()).toEqual(["Leaf", "Outer"]);
    const leaf = layout.folders.find((folder) => folder.name === "Leaf");
    expect(leaf?.parentId).toBe(outer.id);
    expect(layout.placements).toEqual([{ itemKind: "agent", itemId: "chief", folderId: outer.id, position: 0 }]);
  });

  it("moves a folder, but not into itself or its subfolders", () => {
    const sidebar = createMockSidebar();
    const a = sidebar.createFolder({ name: "A", parentId: null }).folder;
    const b = sidebar.createFolder({ name: "B", parentId: a.id }).folder;
    expect(() => sidebar.moveFolder({ folderId: a.id, parentId: b.id, position: 0 })).toThrow(
      "A folder cannot move into itself or its subfolders.",
    );
    const layout = sidebar.moveFolder({ folderId: b.id, parentId: null, position: 0 });
    expect(layout.folders.find((folder) => folder.id === b.id)).toMatchObject({ parentId: null, position: 0 });
  });

  it("moves an agent between folders and to the top level, with a position past the end meaning last", () => {
    const sidebar = createMockSidebar();
    const a = sidebar.createFolder({ name: "A", parentId: null }).folder;
    sidebar.moveItem({ itemKind: "agent", itemId: "chief", folderId: a.id, position: 0 });
    sidebar.moveItem({ itemKind: "agent", itemId: "research", folderId: a.id, position: 99 });
    expect(sidebar.layout().placements.map((item) => [item.itemId, item.position])).toEqual([
      ["chief", 0],
      ["research", 1],
    ]);
    const layout = sidebar.moveItem({ itemKind: "agent", itemId: "chief", folderId: null, position: 0 });
    expect(layout.placements.find((item) => item.itemId === "chief")?.folderId).toBeNull();
    expect(() => sidebar.moveItem({ itemKind: "agent", itemId: "chief", folderId: "nope", position: 0 })).toThrow(
      "This folder no longer exists.",
    );
  });
});
