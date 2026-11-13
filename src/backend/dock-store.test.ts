import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOCK_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DockStore } from "./dock-store";

describe("DockStore", () => {
  let dir: string;
  let file: string;
  const bots = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
  const open = () =>
    new DockStore({ filePath: file, botExists: (id) => bots.has(id), now: () => new Date("2026-11-13T10:00:00Z") });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dock-store-"));
    file = join(dir, "dock.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("starts hidden, medium, with no pins and the island on", () => {
    expect(open().settings()).toEqual({
      visible: false,
      size: "medium",
      pins: [],
      openBotId: null,
      islandEnabled: true,
      bounds: null,
    });
  });

  it("pins at the end or at an index, and pinning again moves the agent", () => {
    const store = open();
    store.pin({ botId: "a" });
    store.pin({ botId: "b" });
    store.pin({ botId: "c", index: 0 });
    expect(store.settings().pins.map((pin) => pin.botId)).toEqual(["c", "a", "b"]);
    store.pin({ botId: "c", index: 99 });
    expect(store.settings().pins.map((pin) => pin.botId)).toEqual(["a", "b", "c"]);
    expect(store.settings().pins[0]).toEqual({ botId: "a", hidden: false, pinnedAt: "2026-11-13T10:00:00.000Z" });
  });

  it("refuses unknown agents and more pins than the limit", () => {
    const store = open();
    expect(() => store.pin({ botId: "nobody" })).toThrow("This agent does not exist.");
    for (const botId of [..."abcdefgh"].slice(0, DOCK_LIMITS.pins)) store.pin({ botId });
    expect(() => store.pin({ botId: "i" })).toThrow(`The dock holds at most ${DOCK_LIMITS.pins} agents.`);
  });

  it("unpins, and the open chat of an unpinned agent closes", () => {
    const store = open();
    store.pin({ botId: "a" });
    store.openChat({ botId: "a" });
    store.unpin({ botId: "a" });
    expect(store.settings().pins).toEqual([]);
    expect(store.settings().openBotId).toBeNull();
  });

  it("reorders only with every pinned agent once", () => {
    const store = open();
    for (const botId of ["a", "b", "c"]) store.pin({ botId });
    store.reorder({ botIds: ["c", "a", "b"] });
    expect(store.settings().pins.map((pin) => pin.botId)).toEqual(["c", "a", "b"]);
    expect(() => store.reorder({ botIds: ["a", "b"] })).toThrow("List every pinned agent once.");
    expect(() => store.reorder({ botIds: ["a", "a", "b"] })).toThrow("List every pinned agent once.");
  });

  it("hides a pin without losing its place; a hidden chat closes", () => {
    const store = open();
    for (const botId of ["a", "b"]) store.pin({ botId });
    store.openChat({ botId: "a" });
    store.setPinHidden({ botId: "a", hidden: true });
    expect(store.settings().pins.map((pin) => [pin.botId, pin.hidden])).toEqual([
      ["a", true],
      ["b", false],
    ]);
    expect(store.settings().openBotId).toBeNull();
    expect(() => store.openChat({ botId: "a" })).toThrow("Show this agent in the dock first.");
  });

  it("opens only pinned chats", () => {
    const store = open();
    expect(() => store.openChat({ botId: "a" })).toThrow("Pin this agent to the dock first.");
    store.pin({ botId: "a" });
    store.openChat({ botId: "a" });
    expect(store.settings().openBotId).toBe("a");
    store.openChat({ botId: null });
    expect(store.settings().openBotId).toBeNull();
  });

  it("keeps size, visibility, island, bounds and pins after a restart", () => {
    const store = open();
    store.pin({ botId: "b" });
    store.setSize({ size: "large" });
    store.setVisible({ visible: true });
    store.setIslandEnabled({ enabled: false });
    store.setBounds({ x: 10, y: 20, height: 500 });
    const again = open().settings();
    expect(again.size).toBe("large");
    expect(again.visible).toBe(true);
    expect(again.islandEnabled).toBe(false);
    expect(again.bounds).toEqual({ x: 10, y: 20, height: 500 });
    expect(again.pins.map((pin) => pin.botId)).toEqual(["b"]);
  });

  it("drops pins of deleted agents", () => {
    const store = open();
    for (const botId of ["a", "b"]) store.pin({ botId });
    store.openChat({ botId: "b" });
    expect(store.forgetMissingBots(new Set(["a"]))).toBe(true);
    expect(store.settings().pins.map((pin) => pin.botId)).toEqual(["a"]);
    expect(store.settings().openBotId).toBeNull();
    expect(store.forgetMissingBots(new Set(["a"]))).toBe(false);
  });

  it("starts from defaults when the file is broken, and keeps the valid parts", () => {
    writeFileSync(file, "{not json");
    expect(open().settings().pins).toEqual([]);
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        visible: "yes",
        size: "huge",
        pins: [{ botId: "a", hidden: false, pinnedAt: "x" }, { botId: 3 }],
      }),
    );
    const settings = open().settings();
    expect(settings.visible).toBe(false);
    expect(settings.size).toBe("medium");
    expect(settings.pins.map((pin) => pin.botId)).toEqual(["a"]);
  });

  it("writes a versioned file", () => {
    open().setSize({ size: "small" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ version: 1, size: "small" });
  });
});
