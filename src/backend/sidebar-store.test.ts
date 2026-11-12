// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SIDEBAR_LIMITS, type SidebarLayout } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenBotDatabase } from "./openbot-database";
import { SidebarStore } from "./sidebar-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];

afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openStore(root?: string): Promise<{ root: string; database: OpenBotDatabase; sidebar: SidebarStore }> {
  const directory = root ?? (await mkdtemp(join(tmpdir(), "cosgral-sidebar-")));
  if (!root) roots.push(directory);
  const database = testDatabase(directory);
  await database.initialize();
  return { root: directory, database, sidebar: new SidebarStore(database) };
}

function names(layout: SidebarLayout, parentId: string | null): string[] {
  return layout.folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map((folder) => folder.name);
}

function folderId(layout: SidebarLayout, name: string): string {
  const folder = layout.folders.find((candidate) => candidate.name === name);
  if (!folder) throw new Error(`No folder ${name}.`);
  return folder.id;
}

describe("SidebarStore", () => {
  it("keeps nested folders and placed agents after a restart", async () => {
    const { root, database, sidebar } = await openStore();
    const sales = sidebar.createFolder({ name: "  Sales  ", parentId: null }).folder;
    const leads = sidebar.createFolder({ name: "Leads", parentId: sales.id }).folder;
    sidebar.moveItem({ itemKind: "agent", itemId: "chief", folderId: leads.id, position: 0 });
    const before = sidebar.updateFolder({ folderId: sales.id, collapsed: true });
    database.close();

    const reopened = await openStore(root);
    const after = reopened.sidebar.layout();

    expect(after).toEqual(before);
    expect(after.folders).toEqual([
      expect.objectContaining({ name: "Sales", parentId: null, position: 0, collapsed: true }),
      expect.objectContaining({ name: "Leads", parentId: sales.id, position: 0, collapsed: false }),
    ]);
    expect(after.placements).toEqual([{ itemKind: "agent", itemId: "chief", folderId: leads.id, position: 0 }]);
  });

  it("orders siblings and moves a folder with its subfolders, never into itself", async () => {
    const { sidebar } = await openStore();
    for (const name of ["A", "B", "C"]) sidebar.createFolder({ name, parentId: null });
    let layout = sidebar.moveFolder({ folderId: folderId(sidebar.layout(), "C"), parentId: null, position: 0 });
    expect(names(layout, null)).toEqual(["C", "A", "B"]);

    const a = folderId(layout, "A");
    const a1 = sidebar.createFolder({ name: "A1", parentId: a }).folder.id;
    expect(() => sidebar.moveFolder({ folderId: a, parentId: a1, position: 0 })).toThrow(
      "A folder cannot move into itself or its subfolders.",
    );
    expect(() => sidebar.moveFolder({ folderId: a, parentId: a, position: 0 })).toThrow(
      "A folder cannot move into itself or its subfolders.",
    );

    layout = sidebar.moveFolder({ folderId: a, parentId: folderId(layout, "B"), position: 99 });
    expect(names(layout, null)).toEqual(["C", "B"]);
    expect(names(layout, folderId(layout, "B"))).toEqual(["A"]);
    expect(names(layout, a)).toEqual(["A1"]);
  });

  it("limits folder names, nesting depth and unknown targets", async () => {
    const { sidebar } = await openStore();
    expect(() => sidebar.createFolder({ name: "   ", parentId: null })).toThrow("A folder name has 1–80 characters.");
    expect(() => sidebar.createFolder({ name: "x".repeat(SIDEBAR_LIMITS.folderName + 1), parentId: null })).toThrow(
      "A folder name has 1–80 characters.",
    );
    expect(() => sidebar.createFolder({ name: "Lost", parentId: "missing" })).toThrow("This folder no longer exists.");
    expect(() => sidebar.moveItem({ itemKind: "agent", itemId: "chief", folderId: "missing", position: 0 })).toThrow(
      "This folder no longer exists.",
    );

    let parentId: string | null = null;
    for (let level = 1; level <= SIDEBAR_LIMITS.folderDepth; level += 1) {
      parentId = sidebar.createFolder({ name: `Level ${level}`, parentId }).folder.id;
    }
    expect(() => sidebar.createFolder({ name: "Too deep", parentId })).toThrow("Folders nest at most 5 levels.");

    const top = sidebar.createFolder({ name: "Top", parentId: null }).folder.id;
    sidebar.createFolder({ name: "Child", parentId: top });
    const level4 = folderId(sidebar.layout(), "Level 4");
    expect(() => sidebar.moveFolder({ folderId: top, parentId: level4, position: 0 })).toThrow(
      "Folders nest at most 5 levels.",
    );
  });

  it("renames, duplicates without items and deletes a folder by moving its content up", async () => {
    const { sidebar } = await openStore();
    const sales = sidebar.createFolder({ name: "Sales", parentId: null }).folder.id;
    sidebar.createFolder({ name: "Later", parentId: null });
    const leads = sidebar.createFolder({ name: "Leads", parentId: sales }).folder.id;
    sidebar.moveItem({ itemKind: "agent", itemId: "chief", folderId: sales, position: 0 });
    sidebar.moveItem({ itemKind: "agent", itemId: "writer", folderId: leads, position: 0 });
    sidebar.moveItem({ itemKind: "agent", itemId: "scout", folderId: null, position: 0 });

    sidebar.updateFolder({ folderId: sales, name: "Sales EU" });
    const copy = sidebar.duplicateFolder({ folderId: sales });

    expect(copy.folder).toMatchObject({ name: "Sales EU copy", parentId: null, position: 1 });
    expect(names(copy.layout, null)).toEqual(["Sales EU", "Sales EU copy", "Later"]);
    expect(names(copy.layout, copy.folder.id)).toEqual(["Leads"]);
    expect(copy.layout.placements.filter((placement) => placement.folderId === copy.folder.id)).toEqual([]);

    const layout = sidebar.deleteFolder({ folderId: sales });

    expect(names(layout, null)).toEqual(["Leads", "Sales EU copy", "Later"]);
    expect(layout.placements).toEqual([
      { itemKind: "agent", itemId: "scout", folderId: null, position: 0 },
      { itemKind: "agent", itemId: "chief", folderId: null, position: 1 },
      { itemKind: "agent", itemId: "writer", folderId: leads, position: 0 },
    ]);
  });

  it("drops the placements of agents that no longer exist", async () => {
    const { sidebar } = await openStore();
    const team = sidebar.createFolder({ name: "Team", parentId: null }).folder.id;
    sidebar.moveItem({ itemKind: "agent", itemId: "chief", folderId: team, position: 0 });
    sidebar.moveItem({ itemKind: "agent", itemId: "ghost", folderId: team, position: 0 });

    expect(sidebar.pruneItems("agent", ["chief"])).toBe(true);
    expect(sidebar.layout().placements).toEqual([{ itemKind: "agent", itemId: "chief", folderId: team, position: 0 }]);
    expect(sidebar.pruneItems("agent", ["chief"])).toBe(false);
  });
});
