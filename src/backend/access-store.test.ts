// @vitest-environment node
// COSGRAL W8-BE1: the access of the agents, kept on disk (spec-w8.md 1A, W8-06: it comes back after a restart).
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultAgentAccess } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessStore } from "./access-store";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cosgral-access-"));
  file = join(dir, "access.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("AccessStore", () => {
  it("an agent that was never changed has the defaults: its working folder only", () => {
    const store = new AccessStore({ filePath: file });
    expect(store.get("a")).toEqual(defaultAgentAccess("a"));
    expect(existsSync(file)).toBe(false);
  });

  it("keeps the level, folders and times after a restart", async () => {
    const first = new AccessStore({ filePath: file });
    first.put({
      botId: "a",
      level: "ask-first",
      additionalFolders: ["D:\\work"],
      excludedFolders: ["D:\\work\\private"],
      raisedAt: "2026-11-16T10:00:00.000Z",
      updatedAt: "2026-11-16T10:00:00.000Z",
    });
    const second = new AccessStore({ filePath: file });
    expect(second.get("a")).toMatchObject({ level: "ask-first", additionalFolders: ["D:\\work"] });
    expect(second.list()).toHaveLength(1);
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(1);
  });

  it("an agent's access is gone with the agent", () => {
    const store = new AccessStore({ filePath: file });
    store.put({ ...defaultAgentAccess("a"), level: "full" });
    store.remove("a");
    expect(store.get("a").level).toBe("working-folder");
    expect(new AccessStore({ filePath: file }).list()).toEqual([]);
  });

  it("a damaged file is put aside and every agent starts at the least access (never at full)", async () => {
    await writeFile(file, "{ not json", "utf8");
    const store = new AccessStore({ filePath: file });
    expect(store.get("a").level).toBe("working-folder");
    const names = await readdir(dir);
    expect(names.some((name) => name.startsWith("access.json.damaged-"))).toBe(true);
  });

  it("a record that is not valid is skipped, the others are kept", async () => {
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        agents: [
          { botId: "a", level: "root" },
          { ...defaultAgentAccess("b"), level: "full" },
        ],
      }),
      "utf8",
    );
    const store = new AccessStore({ filePath: file });
    expect(store.get("a").level).toBe("working-folder");
    expect(store.get("b").level).toBe("full");
  });

  it("keeps a copy: changing what get returned changes nothing", () => {
    const store = new AccessStore({ filePath: file });
    const got = store.get("a");
    got.level = "full";
    got.additionalFolders.push("D:\\x");
    expect(store.get("a")).toEqual(defaultAgentAccess("a"));
  });
});
