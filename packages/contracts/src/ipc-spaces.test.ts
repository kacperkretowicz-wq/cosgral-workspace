import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc-conversation";
import {
  isSpaceDescription,
  isSpaceId,
  isSpaceList,
  isSpacesChanged,
  MAIN_SPACE_ID,
  normalizeSpaceName,
  parseConfirmedSpaceInput,
  parseCreateSpaceInput,
  parseRenameSpaceInput,
  parseSpaceInput,
  SPACE_ISOLATED_PARTS,
  type SpaceList,
  type SpaceSummary,
  spaceNameProblem,
} from "./ipc-spaces";

const summary = (id: string, name: string, extra: Partial<SpaceSummary> = {}): SpaceSummary => ({
  id,
  name,
  main: id === MAIN_SPACE_ID,
  createdAt: "2026-11-16T12:00:00.000Z",
  archivedAt: null,
  running: id === MAIN_SPACE_ID,
  selected: id === MAIN_SPACE_ID,
  ...extra,
});

const list: SpaceList = {
  runningId: "main",
  selectedId: "main",
  problem: null,
  spaces: [summary("main", "Main"), summary("client-0001", "Client A")],
};

describe("client spaces contract (W8-KK1)", () => {
  it("ids: main or a short safe folder name, nothing that could climb out of a folder", () => {
    expect(isSpaceId("main")).toBe(true);
    expect(isSpaceId("a1b2c3d4e5")).toBe(true);
    for (const bad of [
      "",
      "..",
      "../x",
      "a/b",
      "a\\b",
      "ABCDEF123",
      "-abcdef",
      "short",
      "a".repeat(41),
      "a b c d e f",
      5,
      null,
    ]) {
      expect(isSpaceId(bad)).toBe(false);
    }
  });

  it("names: tidy, one line, unique, not 'Main', not empty or long", () => {
    expect(normalizeSpaceName("  Client \t A\n ")).toBe("Client A");
    expect(normalizeSpaceName("Bad\u0000name\u007f")).toBe("Bad name");
    expect(spaceNameProblem("Client A", [])).toBeNull();
    expect(spaceNameProblem("   ", [])).toMatch(/needs a name/);
    expect(spaceNameProblem("x".repeat(61), [])).toMatch(/at most 60/);
    expect(spaceNameProblem("client a", ["Client A"])).toMatch(/already has this name/);
    expect(spaceNameProblem("MAIN", [])).toMatch(/already has this name/);
  });

  it("the list guard wants exactly one running and one selected space, and consistent ids", () => {
    expect(isSpaceList(list)).toBe(true);
    expect(isSpaceList({ ...list, runningId: "client-0001" })).toBe(false);
    expect(
      isSpaceList({ ...list, spaces: [summary("main", "Main", { running: false }), summary("client-0001", "A")] }),
    ).toBe(false);
    expect(isSpaceList({ ...list, spaces: [summary("main", "Main"), summary("main", "Again")] })).toBe(false);
    expect(isSpaceList({ ...list, problem: 5 })).toBe(false);
    const switching: SpaceList = {
      ...list,
      selectedId: "client-0001",
      spaces: [summary("main", "Main", { selected: false }), summary("client-0001", "Client A", { selected: true })],
    };
    expect(isSpaceList(switching)).toBe(true);
    expect(
      isSpaceList({ ...list, spaces: [summary("main", "Main", { main: false }), summary("client-0001", "A")] }),
    ).toBe(false);
  });

  it("the description promises every isolated part and a separate folder", () => {
    const description = {
      id: "client-0001",
      name: "Client A",
      main: false,
      archived: false,
      running: false,
      separateFolder: true,
      isolated: [...SPACE_ISOLATED_PARTS],
      hasData: false,
      sizeBytes: 0,
    };
    expect(isSpaceDescription(description)).toBe(true);
    expect(isSpaceDescription({ ...description, isolated: ["agents", "everything"] })).toBe(false);
    expect(isSpaceDescription({ ...description, sizeBytes: -1 })).toBe(false);
    expect(SPACE_ISOLATED_PARTS).toEqual(["agents", "files", "vault", "browser", "mcp", "memory"]);
  });

  it("requests are parsed first: an id is needed, delete and switch need a real true", () => {
    expect(parseSpaceInput({ id: "client-0001" })).toEqual({ id: "client-0001" });
    expect(() => parseSpaceInput({ id: "../main" })).toThrow(/space id/);
    expect(() => parseSpaceInput(null)).toThrow(/malformed/);
    expect(parseCreateSpaceInput({ name: "A" })).toEqual({ name: "A" });
    expect(() => parseCreateSpaceInput({})).toThrow(/needs a name/);
    expect(parseRenameSpaceInput({ id: "client-0001", name: "B" })).toEqual({ id: "client-0001", name: "B" });
    expect(parseConfirmedSpaceInput({ id: "client-0001", confirm: true }, "delete")).toEqual({
      id: "client-0001",
      confirm: true,
    });
    for (const confirm of [false, "true", 1, undefined]) {
      expect(() => parseConfirmedSpaceInput({ id: "client-0001", confirm }, "delete")).toThrow(
        /removes the space's data for good/,
      );
      expect(() => parseConfirmedSpaceInput({ id: "client-0001", confirm }, "switch")).toThrow(/program restarts/);
    }
  });

  it("the event is part of the agent event union", () => {
    expect(isSpacesChanged({ type: "spaces-changed", ...list })).toBe(true);
    expect(isAgentEvent({ type: "spaces-changed", ...list })).toBe(true);
    expect(isAgentEvent({ type: "spaces-changed", ...list, runningId: "nope" })).toBe(false);
  });
});
