import { describe, expect, it } from "vitest";
import {
  type AgentMemory,
  CHANNEL_MEMORY_LIMITS,
  type ChannelMemory,
  isAgentEvent,
  isAgentMemory,
  isChannelMemory,
  isMemoryInclusion,
  MEMORY_LIMITS,
} from "./ipc";

describe("memory IPC contract", () => {
  const sampleAgentMemory: AgentMemory = {
    id: "mem-1",
    botId: "bot-1",
    text: "User prefers concise answers",
    inclusion: "essential",
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
  };

  const sampleChannelMemory: ChannelMemory = {
    id: "cmem-1",
    channelId: "chan-1",
    text: "Channel objective: COSGRAL Workspace",
    createdAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
  };

  it("validates memory inclusion modes", () => {
    expect(isMemoryInclusion("essential")).toBe(true);
    expect(isMemoryInclusion("searchable")).toBe(true);
    expect(isMemoryInclusion("other")).toBe(false);
    expect(isMemoryInclusion(null)).toBe(false);
  });

  it("validates AgentMemory records", () => {
    expect(isAgentMemory(sampleAgentMemory)).toBe(true);
    expect(isAgentMemory({ ...sampleAgentMemory, inclusion: "invalid" })).toBe(false);
    expect(isAgentMemory({ ...sampleAgentMemory, id: 123 })).toBe(false);
    expect(isAgentMemory(null)).toBe(false);
  });

  it("validates ChannelMemory records", () => {
    expect(isChannelMemory(sampleChannelMemory)).toBe(true);
    expect(isChannelMemory({ ...sampleChannelMemory, channelId: 123 })).toBe(false);
    expect(isChannelMemory(null)).toBe(false);
  });

  it("validates memory limits", () => {
    expect(MEMORY_LIMITS.defaultMaxMemoriesPerBot).toBe(512);
    expect(MEMORY_LIMITS.essentialPromptByteLimit).toBe(8192);
    expect(CHANNEL_MEMORY_LIMITS.maxTextLength).toBe(500);
  });

  it("accepts agent-memory-changed events", () => {
    expect(
      isAgentEvent({
        type: "agent-memory-changed",
        botId: "bot-1",
        action: "saved",
        memory: sampleAgentMemory,
      }),
    ).toBe(true);
    expect(
      isAgentEvent({
        type: "agent-memory-changed",
        botId: "bot-1",
        action: "deleted",
        memory: sampleAgentMemory,
      }),
    ).toBe(true);
    expect(
      isAgentEvent({
        type: "agent-memory-changed",
        botId: "bot-1",
        action: "unknown",
        memory: sampleAgentMemory,
      }),
    ).toBe(false);
  });

  it("accepts channel-memory-changed events", () => {
    expect(
      isAgentEvent({
        type: "channel-memory-changed",
        channelId: "chan-1",
        action: "saved",
        memory: sampleChannelMemory,
      }),
    ).toBe(true);
    expect(
      isAgentEvent({
        type: "channel-memory-changed",
        channelId: "chan-1",
        action: "deleted",
        memory: sampleChannelMemory,
      }),
    ).toBe(true);
    expect(
      isAgentEvent({
        type: "channel-memory-changed",
        channelId: "chan-1",
        action: "saved",
        memory: { id: "bad" },
      }),
    ).toBe(false);
  });
});
