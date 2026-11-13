// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryService } from "./memory-service";
import { MemoryStore } from "./memory-store";
import type { OpenBotDatabase } from "./openbot-database";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];

afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openService(): Promise<{ service: MemoryService; store: MemoryStore; database: OpenBotDatabase }> {
  const directory = await mkdtemp(join(tmpdir(), "cosgral-memory-service-"));
  roots.push(directory);
  const database = testDatabase(directory);
  await database.initialize();
  const store = new MemoryStore(database);
  const service = new MemoryService(store);
  return { service, store, database };
}

describe("MemoryService", () => {
  it("handles remember tool call and emits event", async () => {
    const { service, store } = await openService();
    const events: unknown[] = [];
    service.on("agent-memory-changed", (event) => events.push(event));

    const result = await service.handleToolCall("bot-1", "remember", {
      text: "Label: Preferred format is markdown tables",
      inclusion: "essential",
    });

    expect(result.success).toBe(true);
    expect(result.text).toContain("Preferred format is markdown tables");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "agent-memory-changed",
      botId: "bot-1",
      action: "saved",
      memory: expect.objectContaining({
        text: "Label: Preferred format is markdown tables",
        inclusion: "essential",
      }),
    });

    const memories = store.listAgentMemories("bot-1");
    expect(memories).toHaveLength(1);
  });

  it("handles updating a memory with memoryId", async () => {
    const { service, store } = await openService();
    const initial = store.saveAgentMemory({
      botId: "bot-1",
      text: "Original note",
    });

    const result = await service.handleToolCall("bot-1", "remember", {
      memoryId: initial.id,
      text: "Updated note",
      inclusion: "essential",
    });

    expect(result.success).toBe(true);
    const updated = store.getAgentMemory("bot-1", initial.id);
    expect(updated?.text).toBe("Updated note");
    expect(updated?.inclusion).toBe("essential");
  });

  it("returns clear message when storage limit is reached", async () => {
    const { service, store } = await openService();
    // Fill up to custom limit
    for (let i = 0; i < 5; i++) {
      store.saveAgentMemory({ botId: "bot-1", text: `Memory ${i}` });
    }

    const result = await service.handleToolCall(
      "bot-1",
      "remember",
      { text: "One too many" },
      5, // limit
    );

    expect(result.success).toBe(false);
    expect(result.text).toMatch(/storage limit.*reached/i);
  });

  it("searches memories", async () => {
    const { service, store } = await openService();
    store.saveAgentMemory({ botId: "bot-1", text: "React 19 migration notes" });
    store.saveAgentMemory({ botId: "bot-1", text: "Electron packaging instructions" });

    const result = await service.handleToolCall("bot-1", "search_memories", {
      query: "React migration",
    });

    expect(result.success).toBe(true);
    expect(result.text).toContain("React 19 migration notes");
    expect(result.text).not.toContain("Electron packaging");
  });

  it("forgets a memory and emits deleted event", async () => {
    const { service, store } = await openService();
    const mem = store.saveAgentMemory({ botId: "bot-1", text: "Temporary fact" });

    const events: unknown[] = [];
    service.on("agent-memory-changed", (event) => events.push(event));

    const result = await service.handleToolCall("bot-1", "forget_memory", {
      memoryId: mem.id,
    });

    expect(result.success).toBe(true);
    expect(store.listAgentMemories("bot-1")).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "agent-memory-changed",
      botId: "bot-1",
      action: "deleted",
      memory: expect.objectContaining({ id: mem.id }),
    });
  });

  it("prevents an agent from updating or deleting another agent's memories", async () => {
    const { service, store } = await openService();
    const memA = store.saveAgentMemory({ botId: "bot-A", text: "Agent A secret" });

    // Agent B tries to update Agent A's memory
    const updateResult = await service.handleToolCall("bot-B", "remember", {
      memoryId: memA.id,
      text: "Tampered",
    });
    expect(updateResult.success).toBe(false);

    // Agent B tries to forget Agent A's memory
    const forgetResult = await service.handleToolCall("bot-B", "forget_memory", {
      memoryId: memA.id,
    });
    expect(forgetResult.success).toBe(false);

    expect(store.getAgentMemory("bot-A", memA.id)?.text).toBe("Agent A secret");
  });

  it("handles channel memory tools", async () => {
    const { service, store } = await openService();
    const events: unknown[] = [];
    service.on("channel-memory-changed", (event) => events.push(event));

    const result = await service.handleChannelToolCall("chan-1", "channel_remember", {
      text: "Team rule: TDD before completion",
    });

    expect(result.success).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "channel-memory-changed",
      channelId: "chan-1",
      action: "saved",
    });

    const memories = store.listChannelMemories("chan-1");
    expect(memories).toHaveLength(1);

    // Delete
    const deleteResult = await service.handleChannelToolCall("chan-1", "channel_forget_memory", {
      memoryId: memories[0].id,
    });
    expect(deleteResult.success).toBe(true);
    expect(store.listChannelMemories("chan-1")).toHaveLength(0);
  });
});
