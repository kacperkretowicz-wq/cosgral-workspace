import {
  SIDEBAR_LIMITS,
  type SidebarFolder,
  type SidebarItemPlacement,
  type SidebarLayout,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  agentMoveTargets,
  buildSidebarRows,
  canCreateSubfolder,
  folderDepth,
  folderMoveTargets,
  type SidebarRow,
} from "./sidebar-tree";

const AT = "2026-11-12T10:00:00.000Z";

function folder(id: string, parentId: string | null, position = 0, extra: Partial<SidebarFolder> = {}): SidebarFolder {
  return { id, name: id.toUpperCase(), parentId, position, collapsed: false, createdAt: AT, updatedAt: AT, ...extra };
}

function place(itemId: string, folderId: string | null, position = 0): SidebarItemPlacement {
  return { itemKind: "agent", itemId, folderId, position };
}

const bots = [
  { id: "chief", name: "Chief" },
  { id: "research", name: "Research" },
  { id: "sales", name: "Sales" },
];

function describeRows(rows: SidebarRow[]): string[] {
  return rows.map((row) =>
    row.type === "folder" ? `${row.depth}:folder:${row.folder.id}` : `${row.depth}:agent:${row.bot.id}`,
  );
}

describe("buildSidebarRows", () => {
  it("is the usual flat list when there are no folders", () => {
    expect(describeRows(buildSidebarRows({ folders: [], placements: [] }, bots))).toEqual([
      "0:agent:chief",
      "0:agent:research",
      "0:agent:sales",
    ]);
  });

  it("puts folders before agents at every level and nests agents under their folder", () => {
    const layout: SidebarLayout = {
      folders: [folder("work", null, 0), folder("deep", "work", 0), folder("home", null, 1)],
      placements: [place("research", "work", 0), place("sales", "deep", 0)],
    };
    expect(describeRows(buildSidebarRows(layout, bots))).toEqual([
      "1:folder:work",
      "2:folder:deep",
      "3:agent:sales",
      "2:agent:research",
      "1:folder:home",
      "0:agent:chief",
    ]);
  });

  it("orders folders and agents by position, not by list order", () => {
    const layout: SidebarLayout = {
      folders: [folder("b", null, 1), folder("a", null, 0)],
      placements: [place("sales", null, 0), place("chief", null, 1)],
    };
    expect(describeRows(buildSidebarRows(layout, bots))).toEqual([
      "1:folder:a",
      "1:folder:b",
      "0:agent:sales",
      "0:agent:chief",
      "0:agent:research",
    ]);
  });

  it("hides the contents of a collapsed folder but still counts its agents", () => {
    const layout: SidebarLayout = {
      folders: [folder("work", null, 0, { collapsed: true }), folder("deep", "work", 0)],
      placements: [place("research", "work"), place("sales", "deep")],
    };
    const rows = buildSidebarRows(layout, bots);
    expect(describeRows(rows)).toEqual(["1:folder:work", "0:agent:chief"]);
    expect(rows[0]?.type === "folder" ? rows[0].agentCount : -1).toBe(2);
    expect(rows[0]?.type === "folder" ? rows[0].expanded : null).toBe(false);
  });

  it("puts an agent whose folder is gone, or that is unknown to the layout, at the top level", () => {
    const layout: SidebarLayout = { folders: [], placements: [place("chief", "deleted-folder"), place("gone", null)] };
    expect(describeRows(buildSidebarRows(layout, bots))).toEqual([
      "0:agent:chief",
      "0:agent:research",
      "0:agent:sales",
    ]);
  });

  it("with a search, keeps only folders that hold a match, opened", () => {
    const layout: SidebarLayout = {
      folders: [folder("work", null, 0, { collapsed: true }), folder("home", null, 1)],
      placements: [place("research", "work"), place("sales", "home")],
    };
    const rows = buildSidebarRows(
      layout,
      bots.filter((bot) => bot.id === "research"),
      { searching: true },
    );
    expect(describeRows(rows)).toEqual(["1:folder:work", "2:agent:research"]);
  });

  it("counts the agents of each folder, subfolders included", () => {
    const layout: SidebarLayout = {
      folders: [folder("work", null), folder("empty", null, 1)],
      placements: [place("research", "work"), place("sales", "work", 1)],
    };
    const counts = buildSidebarRows(layout, bots).flatMap((row) =>
      row.type === "folder" ? [[row.folder.id, row.agentCount]] : [],
    );
    expect(counts).toEqual([
      ["work", 2],
      ["empty", 0],
    ]);
  });
});

describe("folder depth rules", () => {
  const chain: SidebarLayout = {
    folders: [folder("l1", null), folder("l2", "l1"), folder("l3", "l2"), folder("l4", "l3"), folder("l5", "l4")],
    placements: [],
  };

  it("counts a top-level folder as level 1", () => {
    expect(folderDepth(chain, "l1")).toBe(1);
    expect(folderDepth(chain, "l5")).toBe(SIDEBAR_LIMITS.folderDepth);
    expect(folderDepth(chain, null)).toBe(0);
  });

  it("allows a subfolder up to the fifth level and not below", () => {
    expect(canCreateSubfolder(chain, "l4")).toBe(true);
    expect(canCreateSubfolder(chain, "l5")).toBe(false);
  });
});

describe("move targets", () => {
  const layout: SidebarLayout = {
    folders: [folder("a", null, 0), folder("a1", "a", 0), folder("a2", "a1", 0), folder("b", null, 1)],
    placements: [place("research", "a1")],
  };

  it("lists the top level and every folder for an agent, with the current place marked", () => {
    const targets = agentMoveTargets(layout, "research");
    expect(targets.map((target) => [target.folderId, target.depth, target.current])).toEqual([
      [null, 0, false],
      ["a", 1, false],
      ["a1", 2, true],
      ["a2", 3, false],
      ["b", 1, false],
    ]);
  });

  it("marks an agent without a placement as being at the top level", () => {
    const [top] = agentMoveTargets(layout, "chief");
    expect(top?.current).toBe(true);
  });

  it("does not offer a folder itself or its subfolders as a place to move it", () => {
    const ids = folderMoveTargets(layout, "a").map((target) => target.folderId);
    expect(ids).toEqual([null, "b"]);
  });

  it("marks places that would nest too deep as unavailable", () => {
    const deep: SidebarLayout = {
      folders: [
        folder("l1", null),
        folder("l2", "l1"),
        folder("l3", "l2"),
        folder("l4", "l3"),
        folder("l5", "l4"),
        folder("x", null, 1),
        folder("x1", "x"),
      ],
      placements: [],
    };
    const targets = folderMoveTargets(deep, "x");
    expect(targets.find((target) => target.folderId === "l4")?.disabled).toBe(true);
    expect(targets.find((target) => target.folderId === "l3")?.disabled).toBe(false);
    expect(targets.find((target) => target.folderId === null)?.disabled).toBe(false);
  });
});
