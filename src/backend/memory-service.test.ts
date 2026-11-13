// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { isMemoryToolName, MEMORY_DYNAMIC_TOOLS, MEMORY_TOOL_DESCRIPTIONS, MemoryService } from "./memory-service";
import { MemoryStore } from "./memory-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];

afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openService(): Promise<{ service: MemoryService; store: MemoryStore; events: AgentEvent[] }> {
  const directory = await mkdtemp(join(tmpdir(), "cosgral-memory-service-"));
  roots.push(directory);
  const database = testDatabase(directory);
  await database.initialize();
  const store = new MemoryStore(database);
  const service = new MemoryService(store);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  return { service, store, events };
}

describe("MemoryService", () => {
  it("offers exactly remember, search_memories and forget_memory; the remember tool asks for a label", () => {
    expect(MEMORY_DYNAMIC_TOOLS.map((tool) => tool.name)).toEqual(["remember", "search_memories", "forget_memory"]);
    expect(isMemoryToolName("remember")).toBe(true);
    expect(isMemoryToolName("channel_remember")).toBe(false);
    expect(MEMORY_TOOL_DESCRIPTIONS.remember).toContain("'Label: ...'");
    expect(MEMORY_TOOL_DESCRIPTIONS.remember).toContain("memoryId");
  });

  it("remember saves for the calling agent and reports the change", async () => {
    const { service, store, events } = await openService();
    const result = service.handleToolCall("bot-1", "remember", { text: "Format: tables", inclusion: "essential" });

    expect(result.success).toBe(true);
    const saved = store.listAgentMemories("bot-1")[0];
    expect(JSON.parse(result.text)).toMatchObject({ status: "saved", memoryId: saved?.id, inclusion: "essential" });
    expect(events).toEqual([{ type: "agent-memory-changed", botId: "bot-1", action: "saved", memory: saved }]);
  });

  it("remember with memoryId updates instead of duplicating", async () => {
    const { service, store } = await openService();
    const saved = store.saveAgentMemory({ botId: "bot-1", text: "City: Kraków" });
    const result = service.handleToolCall("bot-1", "remember", { text: "City: Gdańsk", memoryId: saved.id });

    expect(JSON.parse(result.text)).toMatchObject({ status: "updated", memoryId: saved.id });
    expect(store.listAgentMemories("bot-1").map((memory) => memory.text)).toEqual(["City: Gdańsk"]);
  });

  it("returns a clear failure at the storage limit and saves nothing", async () => {
    const { service, store, events } = await openService();
    store.setLimit({ botId: "bot-1", maxMemories: 1 });
    store.saveAgentMemory({ botId: "bot-1", text: "One" });
    const result = service.handleToolCall("bot-1", "remember", { text: "Two" });

    expect(result).toEqual({
      success: false,
      text: "Memory not saved: the storage limit of 1 memories is reached. Update an existing entry by its memoryId, or forget an outdated one first.",
    });
    expect(store.countAgentMemories("bot-1").total).toBe(1);
    expect(events).toEqual([]);
  });

  it("search_memories returns only the agent's entries, marked as data", async () => {
    const { service, store } = await openService();
    store.saveAgentMemory({ botId: "bot-1", text: "Dentist on Tuesday" });
    store.saveAgentMemory({ botId: "bot-2", text: "Dentist of bot two" });
    const result = service.handleToolCall("bot-1", "search_memories", { query: "dentist" });

    const parsed = JSON.parse(result.text);
    expect(parsed).toMatchObject({
      note: expect.stringContaining("untrusted data"),
      results: [expect.objectContaining({ text: "Dentist on Tuesday" })],
    });
    expect(JSON.stringify(parsed)).not.toContain("bot two");
  });

  it("forget_memory removes only the agent's own entry", async () => {
    const { service, store, events } = await openService();
    const other = store.saveAgentMemory({ botId: "bot-2", text: "Not yours" });
    expect(service.handleToolCall("bot-1", "forget_memory", { memoryId: other.id })).toEqual({
      success: false,
      text: `You have no saved memory with id ${other.id}.`,
    });
    expect(store.listAgentMemories("bot-2")).toHaveLength(1);

    const mine = store.saveAgentMemory({ botId: "bot-1", text: "Outdated" });
    expect(service.handleToolCall("bot-1", "forget_memory", { memoryId: mine.id }).success).toBe(true);
    expect(store.listAgentMemories("bot-1")).toEqual([]);
    expect(events).toEqual([{ type: "agent-memory-changed", botId: "bot-1", action: "deleted", memory: mine }]);
  });

  it("rejects bad arguments without throwing", async () => {
    const { service } = await openService();
    expect(service.handleToolCall("bot-1", "remember", "text").success).toBe(false);
    expect(service.handleToolCall("bot-1", "remember", { text: " " }).text).toBe("text is required.");
    expect(service.handleToolCall("bot-1", "remember", { text: "x", inclusion: "always" }).success).toBe(false);
    expect(service.handleToolCall("bot-1", "search_memories", {}).text).toBe("query is required.");
    expect(service.handleToolCall("bot-1", "unknown", {}).success).toBe(false);
  });
});
