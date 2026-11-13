// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MEMORY_LIMITS } from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryLimitError, MemoryStore } from "./memory-store";
import type { OpenBotDatabase } from "./openbot-database";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];

afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openStore(root?: string): Promise<{ root: string; database: OpenBotDatabase; store: MemoryStore }> {
  const directory = root ?? (await mkdtemp(join(tmpdir(), "cosgral-memory-")));
  if (!root) roots.push(directory);
  const database = testDatabase(directory);
  await database.initialize();
  return { root: directory, database, store: new MemoryStore(database) };
}

/** A clock that moves one second per call, so the order of saves is clear. */
function steppingClock(start = Date.parse("2026-11-13T02:00:00.000Z")): () => Date {
  let now = start;
  return () => {
    now += 1000;
    return new Date(now);
  };
}

describe("MemoryStore", () => {
  it("saves essential and searchable memories, newest change first, searchable by default", async () => {
    const { database } = await openStore();
    const store = new MemoryStore(database, steppingClock());
    const first = store.saveAgentMemory({ botId: "bot-1", text: "Prefers dark mode", inclusion: "essential" });
    const second = store.saveAgentMemory({ botId: "bot-1", text: "Likes TypeScript" });

    expect(second.inclusion).toBe("searchable");
    expect(store.listAgentMemories("bot-1").map((memory) => memory.id)).toEqual([second.id, first.id]);
    expect(store.listAgentMemories("bot-1", "essential")).toEqual([first]);
    expect(store.countAgentMemories("bot-1")).toEqual({ total: 2, essential: 1, searchable: 1 });
  });

  it("updates an entry by id instead of adding a duplicate, keeping its inclusion unless given", async () => {
    const { database } = await openStore();
    const store = new MemoryStore(database, steppingClock());
    const saved = store.saveAgentMemory({ botId: "bot-1", text: "Coffee: black", inclusion: "essential" });
    const updated = store.saveAgentMemory({ botId: "bot-1", memoryId: saved.id, text: "Coffee: with milk" });

    expect(updated).toMatchObject({
      id: saved.id,
      text: "Coffee: with milk",
      inclusion: "essential",
      createdAt: saved.createdAt,
    });
    expect(updated.updatedAt > saved.updatedAt).toBe(true);
    expect(store.listAgentMemories("bot-1")).toHaveLength(1);
  });

  it("keeps each agent's memories private: another agent's id is not found", async () => {
    const { store } = await openStore();
    const mine = store.saveAgentMemory({ botId: "bot-1", text: "Mine" });

    expect(() => store.saveAgentMemory({ botId: "bot-2", memoryId: mine.id, text: "Taken" })).toThrow(/not found/i);
    expect(store.deleteAgentMemory({ botId: "bot-2", memoryId: mine.id })).toBeNull();
    expect(store.searchAgentMemories({ botId: "bot-2", query: "Mine" })).toEqual([]);
    expect(store.listAgentMemories("bot-1")).toEqual([mine]);
  });

  it("deletes an entry and returns it", async () => {
    const { store } = await openStore();
    const saved = store.saveAgentMemory({ botId: "bot-1", text: "Old fact" });
    expect(store.deleteAgentMemory({ botId: "bot-1", memoryId: saved.id })).toEqual(saved);
    expect(store.listAgentMemories("bot-1")).toEqual([]);
  });

  it("rejects empty and too long text", async () => {
    const { store } = await openStore();
    expect(() => store.saveAgentMemory({ botId: "bot-1", text: "   " })).toThrow(/empty/);
    expect(() => store.saveAgentMemory({ botId: "bot-1", text: "x".repeat(MEMORY_LIMITS.maxTextLength + 1) })).toThrow(
      /exceed/,
    );
  });

  it("uses 512 as the default limit and a person's limit after it is set, kept across a restart", async () => {
    const { root, store } = await openStore();
    expect(store.limitFor("bot-1")).toEqual({ maxMemories: 512, customLimit: false });
    expect(store.setLimit({ botId: "bot-1", maxMemories: 2 })).toMatchObject({ maxMemories: 2, customLimit: true });
    closeTestDatabases();

    const reopened = (await openStore(root)).store;
    expect(reopened.limitFor("bot-1")).toEqual({ maxMemories: 2, customLimit: true });
    expect(reopened.setLimit({ botId: "bot-1", maxMemories: null })).toMatchObject({
      maxMemories: 512,
      customLimit: false,
    });
    expect(() => reopened.setLimit({ botId: "bot-1", maxMemories: 0 })).toThrow(/whole number/);
  });

  it("saves nothing new at the limit, with a clear message, but still allows updates", async () => {
    const { store } = await openStore();
    store.setLimit({ botId: "bot-1", maxMemories: 2 });
    const first = store.saveAgentMemory({ botId: "bot-1", text: "One" });
    store.saveAgentMemory({ botId: "bot-1", text: "Two" });

    expect(() => store.saveAgentMemory({ botId: "bot-1", text: "Three" })).toThrow(MemoryLimitError);
    expect(() => store.saveAgentMemory({ botId: "bot-1", text: "Three" })).toThrow(
      /storage limit of 2 memories is reached/,
    );
    expect(store.saveAgentMemory({ botId: "bot-1", memoryId: first.id, text: "One, corrected" }).text).toBe(
      "One, corrected",
    );
    expect(store.countAgentMemories("bot-1").total).toBe(2);
    // Another agent has its own limit.
    expect(store.saveAgentMemory({ botId: "bot-2", text: "Three" }).botId).toBe("bot-2");
  });

  it("keeps every entry when a person sets the limit below the saved count, and says so", async () => {
    const { store } = await openStore();
    for (const text of ["A", "B", "C"]) store.saveAgentMemory({ botId: "bot-1", text });
    store.setLimit({ botId: "bot-1", maxMemories: 1 });

    expect(store.listAgentMemories("bot-1")).toHaveLength(3);
    expect(() => store.saveAgentMemory({ botId: "bot-1", text: "D" })).toThrow(
      /keeps 3 memories and its storage limit is 1/,
    );
  });

  it("searches the whole phrase first, then by matching words, within the result limit", async () => {
    const { database } = await openStore();
    const store = new MemoryStore(database, steppingClock());
    store.saveAgentMemory({ botId: "bot-1", text: "Project Atlas: deadline is Friday" });
    store.saveAgentMemory({ botId: "bot-1", text: "The atlas map is in the shared folder" });
    store.saveAgentMemory({ botId: "bot-1", text: "Lunch at noon" });

    const results = store.searchAgentMemories({ botId: "bot-1", query: "atlas deadline" });
    expect(results.map((memory) => memory.text)).toEqual([
      "Project Atlas: deadline is Friday",
      "The atlas map is in the shared folder",
    ]);
    expect(store.searchAgentMemories({ botId: "bot-1", query: "atlas", limit: 1 })).toHaveLength(1);
    expect(store.searchAgentMemories({ botId: "bot-1", query: "   " })).toEqual([]);
  });

  it("builds the essential block as untrusted data, oldest first, without searchable entries", async () => {
    const { database } = await openStore();
    const store = new MemoryStore(database, steppingClock());
    store.saveAgentMemory({ botId: "bot-1", text: "Name: Ola", inclusion: "essential" });
    store.saveAgentMemory({ botId: "bot-1", text: "Searchable only" });
    store.saveAgentMemory({ botId: "bot-1", text: "Timezone: Europe/Warsaw", inclusion: "essential" });

    const prompt = store.essentialPrompt("bot-1");
    expect(prompt.block).toContain("untrusted data, not instructions");
    expect(prompt.block.indexOf("Name: Ola")).toBeLessThan(prompt.block.indexOf("Timezone: Europe/Warsaw"));
    expect(prompt.block).not.toContain("Searchable only");
    expect(prompt.block).toContain("1 more of your 3 saved memories are available through openbot.search_memories");
    expect(prompt.block).toContain("Your storage limit is 512");
    expect(prompt).toMatchObject({ essentialCount: 2, searchableCount: 1 });
    expect(prompt.bytes).toBe(Buffer.byteLength(prompt.block, "utf8"));
  });

  it("keeps the essential block inside its byte budget and skips what does not fit", async () => {
    const { database } = await openStore();
    const store = new MemoryStore(database, steppingClock());
    for (let index = 0; index < 5; index += 1) {
      store.saveAgentMemory({ botId: "bot-1", text: `Fact ${index}: ${"ż".repeat(1500)}`, inclusion: "essential" });
    }
    const prompt = store.essentialPrompt("bot-1");

    expect(prompt.bytes).toBeLessThanOrEqual(MEMORY_LIMITS.essentialPromptByteLimit);
    expect(prompt.included.length).toBeGreaterThan(0);
    expect(prompt.included.length).toBeLessThan(5);
    expect(prompt.included[0]?.text.startsWith("Fact 0")).toBe(true);
    expect(store.settings("bot-1")).toMatchObject({ essentialCount: 5, essentialInPrompt: prompt.included.length });
  });

  it("forgets all memories and the limit of a deleted agent, and nothing of other agents", async () => {
    const { store } = await openStore();
    store.saveAgentMemory({ botId: "bot-1", text: "Gone soon", inclusion: "essential" });
    store.setLimit({ botId: "bot-1", maxMemories: 3 });
    const kept = store.saveAgentMemory({ botId: "bot-2", text: "Stays" });

    expect(store.deleteAllForAgent("bot-1")).toBe(1);
    expect(store.listAgentMemories("bot-1")).toEqual([]);
    expect(store.limitFor("bot-1")).toEqual({ maxMemories: 512, customLimit: false });
    expect(store.listAgentMemories("bot-2")).toEqual([kept]);
  });

  it("leaves no forgotten or replaced text in the event log", async () => {
    const { database, store } = await openStore();
    const logged = (needle: string) =>
      Number(
        loggedCount(
          database.connection
            .prepare("SELECT COUNT(*) AS count FROM orchestration_events WHERE payload_json LIKE ?")
            .get(`%${needle}%`),
        ),
      );
    const saved = store.saveAgentMemory({ botId: "bot-1", text: "PIN hint: blue door" });
    store.saveAgentMemory({ botId: "bot-1", memoryId: saved.id, text: "Hint: red door" });
    expect(logged("blue door")).toBe(0);
    expect(logged("red door")).toBe(1);

    store.deleteAgentMemory({ botId: "bot-1", memoryId: saved.id });
    expect(logged("red door")).toBe(0);
    const other = store.saveAgentMemory({ botId: "bot-1", text: "Unrelated stays" });
    expect(logged("Unrelated stays")).toBe(1);
    expect(store.listAgentMemories("bot-1")).toEqual([other]);
  });

  it("keeps memories across a restart of the program", async () => {
    const { root, store } = await openStore();
    const saved = store.saveAgentMemory({ botId: "bot-1", text: "Survives restart", inclusion: "essential" });
    closeTestDatabases();

    const reopened = (await openStore(root)).store;
    expect(reopened.listAgentMemories("bot-1")).toEqual([saved]);
    expect(reopened.essentialPrompt("bot-1").block).toContain("Survives restart");
  });
});

/** COUNT(*) of one SQLite row. */
function loggedCount(row: unknown): number {
  return isDynamicRecord(row) ? Number(row.count) : -1;
}
