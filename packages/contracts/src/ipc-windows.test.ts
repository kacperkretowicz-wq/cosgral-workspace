import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc-conversation";
import {
  CONVERSATION_WINDOW_LIMITS,
  conversationWindowHash,
  conversationWindowId,
  conversationWindowTitle,
  isConversationWindowInfo,
  isConversationWindowList,
  isOpenConversationResult,
  parseConversationWindowHash,
  parseConversationWindowInput,
  parseOpenConversationInput,
} from "./ipc-windows";

const info = {
  id: "bot-1:thread-1",
  botId: "bot-1",
  threadId: "thread-1",
  title: "Agent / Notes",
  live: true,
  focused: false,
};

describe("conversation window contract (W6-KK3)", () => {
  it("the id of a window is its (agent, thread) pair, and a guard insists on it", () => {
    expect(conversationWindowId("bot-1", "thread-1")).toBe("bot-1:thread-1");
    expect(isConversationWindowInfo(info)).toBe(true);
    expect(isConversationWindowInfo({ ...info, id: "other" })).toBe(false);
    expect(isConversationWindowInfo({ ...info, threadId: "" })).toBe(false);
    expect(isConversationWindowInfo({ ...info, live: "yes" })).toBe(false);
    expect(isConversationWindowList([info, info])).toBe(true);
    expect(isConversationWindowList([info, { nope: 1 }])).toBe(false);
    expect(isOpenConversationResult({ window: info, created: false })).toBe(true);
    expect(isOpenConversationResult({ window: info })).toBe(false);
  });

  it("the route round-trips, also for ids with odd characters, and a damaged route is refused", () => {
    for (const [botId, threadId] of [
      ["bot-1", "thread-1"],
      ["a/b", "c d"],
      ["zażółć", "x#y?z%"],
    ] as const) {
      const hash = conversationWindowHash(botId, threadId);
      expect(hash.startsWith("#conversation/")).toBe(true);
      expect(hash.split("/")).toHaveLength(3);
      expect(parseConversationWindowHash(hash)).toEqual({ botId, threadId });
    }
    for (const bad of [
      "",
      "#dock",
      "#conversation",
      "#conversation/a",
      "#conversation//b",
      "#conversation/a/b/c",
      "#conversation/%E0%A4%A/x",
    ]) {
      expect(parseConversationWindowHash(bad)).toBeNull();
    }
  });

  it("the title is short and readable", () => {
    expect(conversationWindowTitle("Chief", "Plan")).toBe("Chief / Plan");
    expect(conversationWindowTitle("Chief", null)).toBe("Chief");
    const long = conversationWindowTitle("A".repeat(200), "B");
    expect(long.length).toBe(CONVERSATION_WINDOW_LIMITS.title);
    expect(long.endsWith("…")).toBe(true);
  });

  it("requests: an agent is needed, the thread is optional only when opening", () => {
    expect(parseOpenConversationInput({ botId: "a" })).toEqual({ botId: "a", threadId: null });
    expect(parseOpenConversationInput({ botId: "a", threadId: null })).toEqual({ botId: "a", threadId: null });
    expect(parseOpenConversationInput({ botId: "a", threadId: "t" })).toEqual({ botId: "a", threadId: "t" });
    expect(() => parseOpenConversationInput({ botId: "" })).toThrow(/needs an agent/);
    expect(() => parseOpenConversationInput({ botId: "a", threadId: 5 })).toThrow(/needs a thread/);
    expect(() => parseOpenConversationInput(null)).toThrow(/malformed/);
    expect(parseConversationWindowInput({ botId: "a", threadId: "t" })).toEqual({ botId: "a", threadId: "t" });
    expect(() => parseConversationWindowInput({ botId: "a" })).toThrow(/needs a thread/);
    expect(() => parseConversationWindowInput({ botId: "a".repeat(201), threadId: "t" })).toThrow(/needs an agent/);
  });

  it("the event is part of the agent event union", () => {
    expect(isAgentEvent({ type: "conversation-windows-changed", windows: [info] })).toBe(true);
    expect(isAgentEvent({ type: "conversation-windows-changed", windows: [{ ...info, id: "x" }] })).toBe(false);
    expect(isAgentEvent({ type: "conversation-windows-changed" })).toBe(false);
  });
});
