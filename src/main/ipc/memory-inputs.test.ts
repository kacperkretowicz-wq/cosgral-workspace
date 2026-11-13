import { describe, expect, it } from "vitest";
import {
  parseAgentMemoryBotId,
  parseDeleteAgentMemory,
  parseDeleteChannelMemory,
  parseListAgentMemories,
  parseSaveAgentMemory,
  parseSaveChannelMemory,
  parseSearchAgentMemories,
  parseSetAgentMemoryLimit,
} from "./memory-inputs";

describe("memory IPC input parsing", () => {
  it("parses agent memory inputs", () => {
    expect(parseListAgentMemories({ botId: "b1", inclusion: "essential" })).toEqual({
      botId: "b1",
      inclusion: "essential",
    });
    expect(parseListAgentMemories({ botId: "b1" })).toEqual({ botId: "b1", inclusion: undefined });
    expect(parseSaveAgentMemory({ botId: "b1", text: "Fact", inclusion: "searchable", memoryId: "m1" })).toEqual({
      botId: "b1",
      text: "Fact",
      inclusion: "searchable",
      memoryId: "m1",
    });
    expect(parseSaveAgentMemory({ botId: "b1", text: "Fact", memoryId: null })).toEqual({
      botId: "b1",
      text: "Fact",
      inclusion: undefined,
      memoryId: undefined,
    });
    expect(parseDeleteAgentMemory({ botId: "b1", memoryId: "m1" })).toEqual({ botId: "b1", memoryId: "m1" });
    expect(parseSearchAgentMemories({ botId: "b1", query: "q", limit: 5 })).toEqual({
      botId: "b1",
      query: "q",
      limit: 5,
    });
    expect(parseAgentMemoryBotId("b1")).toBe("b1");
  });

  it("rejects bad agent memory inputs", () => {
    expect(() => parseSaveAgentMemory(null)).toThrow();
    expect(() => parseSaveAgentMemory({ botId: "b1", text: "x", inclusion: "always" })).toThrow(
      /essential or searchable/,
    );
    expect(() => parseDeleteAgentMemory({ botId: "b1" })).toThrow();
    expect(() => parseAgentMemoryBotId(5)).toThrow();
  });

  it("parses the storage limit: a whole number from 1 to 10000, or null for the default", () => {
    expect(parseSetAgentMemoryLimit({ botId: "b1", maxMemories: 64 })).toEqual({ botId: "b1", maxMemories: 64 });
    expect(parseSetAgentMemoryLimit({ botId: "b1", maxMemories: null })).toEqual({ botId: "b1", maxMemories: null });
    for (const bad of [0, 1.5, 10_001, "64", undefined]) {
      expect(() => parseSetAgentMemoryLimit({ botId: "b1", maxMemories: bad })).toThrow(/whole number/);
    }
  });

  it("parses the person's channel memory inputs", () => {
    expect(parseSaveChannelMemory({ channelId: "c1", text: "Note" })).toEqual({
      channelId: "c1",
      text: "Note",
      memoryId: undefined,
    });
    expect(parseSaveChannelMemory({ channelId: "c1", text: "Note", memoryId: "m1" })).toMatchObject({ memoryId: "m1" });
    expect(parseDeleteChannelMemory({ channelId: "c1", memoryId: "m1" })).toEqual({ channelId: "c1", memoryId: "m1" });
    expect(() => parseDeleteChannelMemory({ channelId: "c1" })).toThrow();
  });
});
