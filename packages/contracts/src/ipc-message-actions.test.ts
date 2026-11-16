import { describe, expect, it } from "vitest";
import {
  editNeedsConfirmation,
  IPC_CHANNELS,
  isMessageAction,
  isMessageActionResult,
  isMessagePinList,
  isMessagePinsChanged,
  MESSAGE_ACTION_LIMITS,
  messageActionProblem,
  parseDeleteMessageInput,
  parseEditMessageInput,
  parseListPinsInput,
  parsePinMessageInput,
  parseRetryMessageInput,
  retrySourceIndex,
  threadBusyProblem,
} from "./ipc";
import { isAgentEvent } from "./ipc-conversation";

describe("message actions contract (W29-W35)", () => {
  it("does not treat rows that are not messages as messages", () => {
    expect(messageActionProblem("pin", { author: "system" })).toMatch(/not a message/);
    expect(messageActionProblem("retry", { author: "assistant", itemType: "agent-exchange" })).toMatch(/not a message/);
    expect(messageActionProblem("delete", { author: "assistant", itemType: "commentary" })).toMatch(/not a message/);
  });

  it("allows pin at any time, even for a streaming answer", () => {
    expect(messageActionProblem("pin", { author: "assistant", status: "streaming" })).toBeNull();
    expect(messageActionProblem("pin", { author: "user", delivery: { status: "queued" } })).toBeNull();
  });

  it("refuses retry, edit and delete for a streaming answer and for a message still in the queue (W35)", () => {
    for (const action of ["retry", "edit", "delete"] as const) {
      expect(messageActionProblem(action, { author: "assistant", status: "streaming" })).toMatch(/finished/);
      for (const status of ["queued", "starting", "running"] as const) {
        expect(messageActionProblem(action, { author: "user", delivery: { status } })).toMatch(/queue/);
      }
    }
    expect(messageActionProblem("delete", { author: "user", delivery: { status: "completed" } })).toBeNull();
  });

  it("lets only the person's own message be edited (Q13)", () => {
    expect(messageActionProblem("edit", { author: "user" })).toBeNull();
    expect(messageActionProblem("edit", { author: "user", source: "user" })).toBeNull();
    expect(messageActionProblem("edit", { author: "assistant" })).toMatch(/own messages/);
    expect(messageActionProblem("edit", { author: "user", source: "agent" })).toMatch(/own messages/);
  });

  it("lets retry work on the person's message and on an answer, not on another agent's message (Q12)", () => {
    expect(messageActionProblem("retry", { author: "user" })).toBeNull();
    expect(messageActionProblem("retry", { author: "assistant" })).toBeNull();
    expect(messageActionProblem("retry", { author: "agent" })).toMatch(/asked again/);
  });

  it("says when a thread is busy", () => {
    expect(threadBusyProblem({ turnRunning: false, busyMessages: 0 })).toBeNull();
    expect(threadBusyProblem({ turnRunning: true, busyMessages: 0 })).toMatch(/busy/);
    expect(threadBusyProblem({ turnRunning: false, busyMessages: 2 })).toMatch(/busy/);
  });

  it("asks for confirmation only when something follows the edited message (Q13)", () => {
    expect(editNeedsConfirmation(0)).toBe(false);
    expect(editNeedsConfirmation(1)).toBe(true);
  });

  it("finds the message to ask again: the person's own message that began the answer", () => {
    const messages = [
      { id: "u1", author: "user" },
      { id: "a1", author: "assistant" },
      { id: "x1", author: "user", source: "agent" },
      { id: "a2", author: "assistant" },
      { id: "u2", author: "user", source: "user" },
      { id: "a3", author: "assistant" },
    ];
    expect(retrySourceIndex(messages, "u1")).toBe(0);
    expect(retrySourceIndex(messages, "a1")).toBe(0);
    expect(retrySourceIndex(messages, "a2")).toBe(0);
    expect(retrySourceIndex(messages, "a3")).toBe(4);
    expect(retrySourceIndex(messages, "missing")).toBe(-1);
    expect(retrySourceIndex([{ id: "a", author: "assistant" }], "a")).toBe(-1);
  });

  it("parses the inputs and refuses wrong ones", () => {
    expect(parseRetryMessageInput({ botId: "b", messageId: "m" })).toEqual({
      botId: "b",
      threadId: null,
      messageId: "m",
    });
    expect(() => parseRetryMessageInput({ botId: "b" })).toThrow(/message/);
    expect(() => parseRetryMessageInput({ botId: "b", threadId: "", messageId: "m" })).toThrow(/thread/);
    expect(parseEditMessageInput({ botId: "b", messageId: "m", text: "hi" }).confirm).toBe(false);
    expect(parseEditMessageInput({ botId: "b", messageId: "m", text: "hi", confirm: true }).confirm).toBe(true);
    expect(() => parseEditMessageInput({ botId: "b", messageId: "m", text: "  " })).toThrow(/empty/);
    expect(() =>
      parseEditMessageInput({ botId: "b", messageId: "m", text: "x".repeat(MESSAGE_ACTION_LIMITS.editedText + 1) }),
    ).toThrow(/too long/);
    expect(() => parseEditMessageInput({ botId: "b", messageId: "m", text: "hi", confirm: "yes" })).toThrow(/confirm/);
    expect(() => parseDeleteMessageInput({ botId: "b", messageId: "m" })).toThrow(/confirmation/);
    expect(() => parseDeleteMessageInput({ botId: "b", messageId: "m", confirm: "true" })).toThrow(/confirmation/);
    expect(parseDeleteMessageInput({ botId: "b", messageId: "m", confirm: true }).confirm).toBe(true);
    expect(parsePinMessageInput({ botId: "b", messageId: "m", pinned: true }).pinned).toBe(true);
    expect(() => parsePinMessageInput({ botId: "b", messageId: "m" })).toThrow(/pinned/);
    expect(parseListPinsInput({ botId: "b" })).toEqual({ botId: "b", threadId: null });
    expect(() => parseListPinsInput({ botId: "" })).toThrow();
  });

  it("recognises the results, the pins and the events", () => {
    const pins = [{ messageId: "m", pinnedAt: "2026-11-16T12:00:00.000Z" }];
    expect(isMessageActionResult({ removedMessageIds: [], receipt: null })).toBe(true);
    expect(isMessageActionResult({ removedMessageIds: ["a"], receipt: { messageId: "m", deliveries: [] } })).toBe(true);
    expect(isMessageActionResult({ removedMessageIds: [1], receipt: null })).toBe(false);
    expect(isMessageActionResult({ removedMessageIds: [] })).toBe(false);
    expect(isMessagePinList(pins)).toBe(true);
    expect(isMessagePinList([{ messageId: "m" }])).toBe(false);
    const event = { type: "message-pins-changed", botId: "b", threadId: "t", pins };
    expect(isMessagePinsChanged(event)).toBe(true);
    expect(isAgentEvent(event)).toBe(true);
    expect(isAgentEvent({ ...event, pins: [{}] })).toBe(false);
    expect(isMessageAction("pin")).toBe(true);
    expect(isMessageAction("copy")).toBe(false);
  });

  it("has channels for the actions", () => {
    expect(IPC_CHANNELS.messageActionsRetry).toBe("message-actions:retry");
    expect(IPC_CHANNELS.messageActionsEdit).toBe("message-actions:edit");
    expect(IPC_CHANNELS.messageActionsDelete).toBe("message-actions:delete");
    expect(IPC_CHANNELS.messageActionsPin).toBe("message-actions:pin");
    expect(IPC_CHANNELS.messageActionsListPins).toBe("message-actions:list-pins");
  });
});
