// @vitest-environment node
// COSGRAL W8-KK1: the client spaces on disk: separate folders, the registry, the safety of delete, the restart.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { isSpaceList, MAIN_SPACE_ID, SPACE_ISOLATED_PARTS, SPACE_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SpaceStore, spacesRootFor } from "./space-store";

let appData: string;
let baseUserData: string;
let baseHome: string;
let counter = 0;

beforeEach(() => {
  appData = mkdtempSync(join(tmpdir(), "cosgral-spaces-"));
  baseUserData = join(appData, "COSGRAL Workspace");
  baseHome = join(appData, "home");
  counter = 0;
});
afterEach(() => rmSync(appData, { recursive: true, force: true }));

const open = () =>
  new SpaceStore({
    baseUserData,
    baseHome,
    makeId: () => {
      counter += 1;
      return `space-${String(counter).padStart(4, "0")}`;
    },
  });

describe("space store (W8-KK1)", () => {
  it("starts on the main space and touches nothing on disk: the main data stays where it is", () => {
    const store = open();
    expect(isSpaceList(store.list())).toBe(true);
    expect(store.list()).toMatchObject({ runningId: "main", selectedId: "main", problem: null });
    expect(store.runningPaths()).toEqual({ id: "main", userData: resolve(baseUserData), home: resolve(baseHome) });
    expect(existsSync(baseUserData)).toBe(false);
    expect(existsSync(store.root)).toBe(false);
  });

  it("the spaces folder is a sibling of the data folder, not inside it", () => {
    expect(spacesRootFor(baseUserData)).toBe(join(appData, "COSGRAL Workspace Spaces"));
    expect(basename(spacesRootFor(join(appData, "COSGRAL Workspace Dev")))).toBe("COSGRAL Workspace Dev Spaces");
  });

  it("creates a space with its own data and home folders, saved in the registry, without switching", () => {
    const store = open();
    const list = store.create("  Client A ");
    expect(list.spaces.map((space) => space.name)).toEqual(["Main", "Client A"]);
    expect(list).toMatchObject({ runningId: "main", selectedId: "main" });
    const id = list.spaces[1]?.id ?? "";
    expect(existsSync(join(store.root, id, "data"))).toBe(true);
    expect(existsSync(join(store.root, id, "home"))).toBe(true);
    expect(JSON.parse(readFileSync(join(store.root, "spaces.json"), "utf8"))).toMatchObject({
      version: 1,
      selectedId: "main",
    });
    expect(existsSync(baseUserData)).toBe(false);
  });

  it("names are unique and tidy; there is a limit of client spaces", () => {
    const store = open();
    store.create("Client A");
    expect(() => store.create("client a")).toThrow(/already has this name/);
    expect(() => store.create("Main")).toThrow(/already has this name/);
    expect(() => store.create("   ")).toThrow(/needs a name/);
    for (let index = 1; index < SPACE_LIMITS.maxSpaces; index += 1) store.create(`Client ${index}`);
    expect(() => store.create("One too many")).toThrow(/too many/);
  });

  it("two spaces never share a folder, and none lies inside the main data or inside another space", () => {
    const store = open();
    const [first, second] = [store.create("A").spaces[1]?.id ?? "", store.create("B").spaces[2]?.id ?? ""];
    const folders = [first, second].flatMap((id) => [join(store.root, id, "data"), join(store.root, id, "home")]);
    folders.push(resolve(baseUserData), resolve(baseHome));
    for (const one of folders) {
      for (const other of folders) {
        if (one === other) continue;
        expect(relative(one, other).startsWith("..") || relative(one, other) === "").toBe(true);
        expect(relative(other, one).startsWith("..")).toBe(true);
      }
    }
  });

  it("a switch is kept for the next start: this run stays where it is, the next run uses the space's folders", () => {
    const first = open();
    const id = first.create("Client A").spaces[1]?.id ?? "";
    const chosen = first.select(id);
    expect(chosen).toMatchObject({ runningId: "main", selectedId: id });
    expect(first.runningPaths().id).toBe("main");
    const restarted = open();
    expect(restarted.list()).toMatchObject({ runningId: id, selectedId: id });
    const paths = restarted.runningPaths();
    expect(paths).toEqual({ id, userData: join(restarted.root, id, "data"), home: join(restarted.root, id, "home") });
    expect(isSpaceList(restarted.list())).toBe(true);
  });

  it("rename, archive and restore are kept after a restart; the main space is protected", () => {
    const first = open();
    const id = first.create("Client A").spaces[1]?.id ?? "";
    first.rename(id, "Client B");
    first.archive(id);
    expect(() => first.rename("main", "Mine")).toThrow(/main space/);
    expect(() => first.archive("main")).toThrow(/main space/);
    expect(() => first.delete("main")).toThrow(/main space/);
    const second = open();
    expect(second.list().spaces[1]).toMatchObject({ name: "Client B" });
    expect(second.list().spaces[1]?.archivedAt).not.toBeNull();
    second.restore(id);
    expect(open().list().spaces[1]?.archivedAt).toBeNull();
  });

  it("an archived space cannot be chosen; the running and the chosen space cannot be archived or deleted", () => {
    const store = open();
    const id = store.create("Client A").spaces[1]?.id ?? "";
    store.archive(id);
    expect(() => store.select(id)).toThrow(/archived/);
    store.restore(id);
    store.select(id);
    expect(() => store.archive(id)).toThrow(/runs on/);
    expect(() => store.delete(id)).toThrow(/runs on/);
    store.select("main");
    expect(() => store.delete(id)).not.toThrow();
  });

  it("delete removes only that space's own folder; main data and the other space stay", () => {
    const store = open();
    mkdirSync(baseUserData, { recursive: true });
    writeFileSync(join(baseUserData, "openbot.db"), "main data");
    const first = store.create("A").spaces[1]?.id ?? "";
    const second = store.create("B").spaces[2]?.id ?? "";
    writeFileSync(join(store.root, first, "data", "openbot.db"), "client a");
    writeFileSync(join(store.root, second, "data", "openbot.db"), "client b");
    const list = store.delete(first);
    expect(list.spaces.map((space) => space.name)).toEqual(["Main", "B"]);
    expect(existsSync(join(store.root, first))).toBe(false);
    expect(readFileSync(join(store.root, second, "data", "openbot.db"), "utf8")).toBe("client b");
    expect(readFileSync(join(baseUserData, "openbot.db"), "utf8")).toBe("main data");
    expect(readdirSync(store.root).sort()).toEqual([second, "spaces.json"].sort());
  });

  it("delete refuses a space folder that is a link and removes nothing behind it", () => {
    const store = open();
    const id = store.create("A").spaces[1]?.id ?? "";
    const elsewhere = join(appData, "elsewhere");
    mkdirSync(elsewhere, { recursive: true });
    writeFileSync(join(elsewhere, "keep.txt"), "keep");
    rmSync(join(store.root, id), { recursive: true, force: true });
    try {
      symlinkSync(elsewhere, join(store.root, id), "junction");
    } catch {
      return; // links cannot be made here: nothing to test
    }
    expect(() => store.delete(id)).toThrow(/not a plain folder/);
    expect(readFileSync(join(elsewhere, "keep.txt"), "utf8")).toBe("keep");
  });

  it("an id that is not a space id never reaches the file system", () => {
    const store = open();
    store.create("A");
    for (const bad of ["../main", "..", "a/b", "", "COSGRAL"]) {
      expect(() => store.delete(bad)).toThrow(/does not exist|main space/);
      expect(() => store.describe(bad)).toThrow(/does not exist/);
      expect(() => store.select(bad)).toThrow(/does not exist/);
    }
    expect(existsSync(store.root)).toBe(true);
  });

  it("a chosen space that was archived or removed by hand: the program runs on main and says so", () => {
    const first = open();
    const id = first.create("A").spaces[1]?.id ?? "";
    first.select(id);
    rmSync(join(first.root, id), { recursive: true, force: true });
    const second = open();
    expect(second.list()).toMatchObject({ runningId: "main" });
    expect(second.list().problem).toMatch(/not available/);
    expect(second.runningPaths().id).toBe("main");
    expect(isSpaceList(second.list())).toBe(true);
  });

  it("a damaged list is kept aside, the program runs on main, the folders are untouched, and a new list is made", () => {
    const first = open();
    const id = first.create("A").spaces[1]?.id ?? "";
    writeFileSync(join(first.root, "spaces.json"), "{ not json");
    const second = open();
    expect(second.list()).toMatchObject({ runningId: "main" });
    expect(second.list().problem).toMatch(/could not be read/);
    expect(existsSync(join(second.root, id, "data"))).toBe(true);
    expect(readdirSync(second.root).some((name) => name.startsWith("spaces.json.damaged-"))).toBe(true);
    second.create("B");
    expect(second.list().problem).toBeNull();
    expect(
      open()
        .list()
        .spaces.map((space) => space.name),
    ).toEqual(["Main", "B"]);
  });

  it("describe: what is separate, whether the space has data, and its size", () => {
    const store = open();
    const id = store.create("A").spaces[1]?.id ?? "";
    expect(store.describe(id)).toMatchObject({
      separateFolder: true,
      hasData: false,
      sizeBytes: 0,
      running: false,
      archived: false,
    });
    expect(store.describe(id).isolated).toEqual([...SPACE_ISOLATED_PARTS]);
    writeFileSync(join(store.root, id, "data", "openbot.db"), "12345");
    writeFileSync(join(store.root, id, "home", "note.txt"), "abc");
    expect(store.describe(id)).toMatchObject({ hasData: true, sizeBytes: 8 });
    expect(store.describe("main")).toMatchObject({ main: true, hasData: true, sizeBytes: null, running: true });
  });

  it("the real ids are random and safe folder names", () => {
    const store = new SpaceStore({ baseUserData, baseHome });
    const a = store.create("A").spaces[1]?.id ?? "";
    const b = store.create("B").spaces[2]?.id ?? "";
    expect(a).toMatch(/^[a-z0-9]{12}$/);
    expect(a).not.toBe(b);
    expect(a).not.toBe(MAIN_SPACE_ID);
  });
});
