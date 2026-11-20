import type { ConversationMessage } from "@openbot/contracts/ipc";
import { expect, it } from "vitest";
import {
  botMessagesEqual,
  botProfilesEqual,
  cleanPreview,
  formatTime,
  readStateForMessages,
  retainThinkingMessages,
  withoutBot,
} from "./bot-mapping";
import type { BotMessage, BotProfile } from "./data";

const profile = (overrides: Partial<BotProfile> = {}): BotProfile => ({
  id: "a",
  name: "Alice",
  role: "Assistant",
  description: "",
  notifications: false,
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  threadId: null,
  avatarSeed: "a",
  avatarHue: null,
  avatarUrl: null,
  time: "10:00",
  preview: "Hi",
  ...overrides,
});

const message = (overrides: Partial<BotMessage> = {}): BotMessage => ({
  id: "m1",
  author: "bot",
  body: "Hello",
  time: "10:00",
  ...overrides,
});

const stored = (id: string, author: ConversationMessage["author"], itemType?: string): ConversationMessage => ({
  id,
  author,
  text: id,
  createdAt: "2026-11-20T10:00:00.000Z",
  status: "completed",
  itemType,
});

it("drops one agent from a record without touching the original", () => {
  const original = { a: 1, b: 2 };
  expect(withoutBot(original, "a")).toEqual({ b: 2 });
  expect(original).toEqual({ a: 1, b: 2 });
});

it("falls back to 'now' for a time that is not a date", () => {
  expect(formatTime("not a date")).toBe("now");
  expect(formatTime("2026-11-20T10:05:00.000Z")).toMatch(/\d{1,2}[:.]\d{2}/);
});

it("cleans the preview and says so when there are no messages", () => {
  expect(cleanPreview("  inbox at zero:   all   done ")).toBe("all done");
  expect(cleanPreview("")).toBe("No messages yet");
  expect(cleanPreview("inbox at zero")).toBe("No messages yet");
});

it("compares agents by what the sidebar shows, ignoring the avatar url", () => {
  expect(botProfilesEqual(profile(), profile({ avatarUrl: "x" }))).toBe(true);
  expect(botProfilesEqual(profile(), profile({ preview: "Bye" }))).toBe(false);
  expect(botProfilesEqual(profile(), profile({ hidden: true }))).toBe(false);
});

it("compares messages by content, including attachments and items", () => {
  expect(botMessagesEqual(message(), message())).toBe(true);
  expect(botMessagesEqual(message(), message({ body: "Hi" }))).toBe(false);
  expect(botMessagesEqual(message({ items: ["a"] }), message({ items: ["b"] }))).toBe(false);
  expect(botMessagesEqual(message({ pinned: true }), message())).toBe(false);
});

it("counts unread messages after the read point, skipping your own and commentary", () => {
  const messages = [
    stored("1", "user"),
    stored("2", "assistant"),
    stored("3", "user"),
    stored("4", "assistant", "commentary"),
    stored("5", "assistant"),
  ];
  const state = readStateForMessages({ unreadCount: 0, firstUnreadMessageId: null, throughMessageId: "1" }, messages);
  expect(state.unreadCount).toBe(2);
  expect(state.firstUnreadMessageId).toBe("2");
  const none = readStateForMessages({ unreadCount: 3, firstUnreadMessageId: "x", throughMessageId: "5" }, messages);
  expect(none).toMatchObject({ unreadCount: 0, firstUnreadMessageId: null });
});

it("keeps a finished thinking message in its turn when the next snapshot lacks it", () => {
  const thinking = message({ id: "t", kind: "thinking", turnId: "turn", streaming: true });
  const answer = message({ id: "answer", turnId: "turn" });
  const result = retainThinkingMessages([thinking], [message({ id: "q", author: "you", turnId: "turn" }), answer]);
  expect(result.map((item) => item.id)).toEqual(["q", "t", "answer"]);
  expect(result[1]?.streaming).toBe(false);
  const already = retainThinkingMessages([thinking], [thinking, answer]);
  expect(already.map((item) => item.id)).toEqual(["t", "answer"]);
  const otherTurn = retainThinkingMessages([thinking], [message({ id: "z", turnId: "other" })]);
  expect(otherTurn.map((item) => item.id)).toEqual(["z"]);
});
