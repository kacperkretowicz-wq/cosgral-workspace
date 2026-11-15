// @vitest-environment node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSafeWipeRoot, requestDataWipe, runPendingDataWipe, wipeMarkerPath, wipeRoots } from "./data-wipe";

// W4-BE5: "Delete my data" removes only the COSGRAL data folders. The guard refuses every other folder, and the
// removal never follows a link or junction out of them.

let base: string;
let home: string;
let appData: string;
let userData: string;
let agents: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "cosgral-wipe-"));
  home = join(base, "home");
  appData = join(home, "AppData", "Roaming");
  userData = join(appData, "COSGRAL Workspace Dev");
  agents = join(home, "COSGRAL Workspace");
  for (const folder of [userData, agents, join(appData, "OpenBot"), join(home, ".codex"), join(base, "outside")])
    mkdirSync(folder, { recursive: true });
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

const paths = () => ({ userData, home, appData });

describe("the wipe guard", () => {
  it("allows exactly the program's data folder and the agents' folder", () => {
    expect(wipeRoots(paths())).toEqual([userData, agents]);
  });

  it("refuses the home folder, AppData, the OpenBot folder and anything outside", () => {
    const options = { home, appData };
    for (const bad of [
      home,
      appData,
      join(appData, "OpenBot"),
      join(appData, "OpenBot", "COSGRAL Workspace"),
      join(base, "outside"),
      join(base, "COSGRAL Workspace"),
      join(userData, "..", "..", ".."),
      join(home, ".codex"),
      join(home, "Documents", "COSGRAL Workspace"),
      "COSGRAL Workspace",
    ])
      expect(() => assertSafeWipeRoot(bad, options), bad).toThrow();
  });

  it("refuses a data folder that is itself a junction to somewhere else", () => {
    rmSync(agents, { recursive: true, force: true });
    symlinkSync(join(base, "outside"), agents, "junction");
    expect(() => assertSafeWipeRoot(agents, { home, appData })).toThrow(/link/);
  });
});

describe("the pending wipe at start", () => {
  it("does nothing without a request", () => {
    writeFileSync(join(userData, "openbot.db"), "data");
    expect(runPendingDataWipe(paths())).toBeNull();
    expect(existsSync(join(userData, "openbot.db"))).toBe(true);
  });

  it("removes the data folders, keeps everything else and never follows a junction", () => {
    writeFileSync(join(userData, "openbot.db"), "data");
    mkdirSync(join(userData, "Partitions", "agent", "Cache"), { recursive: true });
    writeFileSync(join(userData, "Partitions", "agent", "Cache", "f"), "cache");
    mkdirSync(join(agents, "Shared"), { recursive: true });
    writeFileSync(join(agents, "Shared", "notes.md"), "shared");
    // Escape attempts: a junction and a link inside the data folders that point at the person's other data.
    writeFileSync(join(base, "outside", "sentinel.txt"), "keep me");
    writeFileSync(join(appData, "OpenBot", "sentinel.txt"), "keep me");
    writeFileSync(join(home, ".codex", "sentinel.txt"), "keep me");
    symlinkSync(join(base, "outside"), join(userData, "escape"), "junction");
    symlinkSync(join(appData, "OpenBot"), join(agents, "Shared", "openbot-link"), "junction");

    requestDataWipe(userData);
    expect(existsSync(wipeMarkerPath(userData))).toBe(true);
    const outcome = runPendingDataWipe(paths());

    expect(outcome?.failures).toEqual([]);
    expect(existsSync(join(userData, "openbot.db"))).toBe(false);
    expect(existsSync(join(userData, "Partitions"))).toBe(false);
    expect(existsSync(join(agents, "Shared", "notes.md"))).toBe(false);
    expect(readFileSync(join(base, "outside", "sentinel.txt"), "utf8")).toBe("keep me");
    expect(readFileSync(join(appData, "OpenBot", "sentinel.txt"), "utf8")).toBe("keep me");
    expect(readFileSync(join(home, ".codex", "sentinel.txt"), "utf8")).toBe("keep me");
    expect(existsSync(wipeMarkerPath(userData))).toBe(false);
  });

  it("keeps the marker outside the folder it removes", () => {
    expect(wipeMarkerPath(userData).startsWith(`${userData}\\`)).toBe(false);
    expect(wipeMarkerPath(userData).startsWith(`${userData}/`)).toBe(false);
  });
});
