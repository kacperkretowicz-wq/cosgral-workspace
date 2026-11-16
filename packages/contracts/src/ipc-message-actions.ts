// COSGRAL W6-BE3: actions on a message (spec-w6.md 1E, W29-W35; decisions Q12-Q14).
//
// Which of the actions need the program (this file) and which are only the window:
// - COPY is the window's alone (the text of the message goes to the clipboard).
// - BRANCH from a message is `threads.branch` (W6-BE1).
// - RETRY (Q12): a new answer is ADDED, marked as a regeneration; the old answer is never deleted or replaced.
// - EDIT and send again (Q13): the person's own message gets new text and goes to the agent again. Everything the
//   conversation said after that message is removed from the thread AND from what the model sees; when there is
//   anything after it, the call must say `confirm: true` (the window asks first).
// - DELETE (Q: both the person's and the agent's messages, after confirmation): the message leaves the conversation and
//   the context the model sees. Never a whole thread under the cover of "delete one".
// - PIN: a mark that survives a restart; a list of the pins of a thread.
//
// FIFO (W35): copy and pin work at any time. Retry, edit and delete change history, so they are refused while a turn
// runs in the thread or a message of the thread is still starting or waiting in its queue (use the queue to change those).
// They work on the thread that is shown; another thread must be selected first.
//
// All of it is about THIS computer only.

import type { QueuedMessageReceipt } from "./ipc-conversation";
import { type DynamicRecord, isBoolean, isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const MESSAGE_ACTION_LIMITS = {
  /** Pinned messages in one thread. */
  pinsPerThread: 50,
  /** Characters of an edited message (the same limit as a sent message is in the program). */
  editedText: 100_000,
} as const;

export const MESSAGE_ACTIONS = ["retry", "edit", "delete", "pin"] as const;
export type MessageAction = (typeof MESSAGE_ACTIONS)[number];

export interface MessageActionTarget {
  botId: string;
  /** Left out or null: the thread the window shows. Another thread than the shown one is refused. */
  threadId?: string | null;
  /** The id of the message in the conversation (`ConversationMessage.id`). */
  messageId: string;
}

export type RetryMessageInput = MessageActionTarget;

export interface EditMessageInput extends MessageActionTarget {
  text: string;
  /** Needed when the conversation has messages after this one: they are removed. */
  confirm?: boolean;
}

export interface DeleteMessageInput extends MessageActionTarget {
  /** Must be true: the window asks the person first; a call without it is refused. */
  confirm: true;
}

export interface PinMessageInput extends MessageActionTarget {
  pinned: boolean;
}

export interface ListPinsInput {
  botId: string;
  threadId?: string | null;
}

export interface MessagePin {
  messageId: string;
  pinnedAt: string;
}

/** What retry, edit and delete did. */
export interface MessageActionResult {
  /** The messages that left the conversation (edit: the edited one and everything after it; delete: the one). */
  removedMessageIds: string[];
  /** Retry and edit: the message that was queued for the agent. Delete: null. */
  receipt: QueuedMessageReceipt | null;
}

/** `window.openbot.messageActions` (this computer only). */
export interface MessageActionsDesktopApi {
  /** A new answer, added and marked `regeneration`. The old answer stays. */
  retry: (input: RetryMessageInput) => Promise<MessageActionResult>;
  edit: (input: EditMessageInput) => Promise<MessageActionResult>;
  delete: (input: DeleteMessageInput) => Promise<MessageActionResult>;
  /** Pins or unpins; answers the pins of the thread, newest first. */
  pin: (input: PinMessageInput) => Promise<MessagePin[]>;
  listPins: (input: ListPinsInput) => Promise<MessagePin[]>;
}

/** Event `message-pins-changed`: the pins of one thread changed. */
export interface MessagePinsChanged {
  botId: string;
  threadId: string;
  pins: MessagePin[];
}

// --- rules shared by the engine, the mock and the window ---

export interface MessageActionSubject {
  author: "user" | "assistant" | "agent" | "system";
  source?: "user" | "assistant" | "agent" | "system";
  itemType?: string;
  status?: "streaming" | "completed" | "failed" | "interrupted";
  /** A message of the person or of another agent sent through the queue. */
  delivery?: { status: "queued" | "starting" | "running" | "completed" | "failed" | "interrupted" | "cancelled" };
}

/** Why an action cannot be done on this message (a row of the conversation that is not a message, a message still in the queue...), or null. */
export function messageActionProblem(action: MessageAction, message: MessageActionSubject) {
  if (message.author === "system" || message.itemType === "agent-exchange" || message.itemType === "commentary") {
    return "This row is not a message.";
  }
  if (action === "pin") return null;
  if (message.status === "streaming") return "Wait until the answer has finished.";
  const delivery = message.delivery?.status;
  if (delivery === "queued" || delivery === "starting" || delivery === "running") {
    return "This message is still in the queue. Change it from the queue.";
  }
  if (action === "edit" && !(message.author === "user" && (message.source ?? "user") === "user")) {
    return "Only your own messages can be edited.";
  }
  if (action === "retry" && message.author === "agent") {
    return "Only your messages and the agent's answers can be asked again.";
  }
  return null;
}

/** Why history cannot be changed now (retry, edit, delete), or null: a turn runs in the thread, or messages wait in its queue. */
export function threadBusyProblem(input: { turnRunning: boolean; busyMessages: number }): string | null {
  return input.turnRunning || input.busyMessages > 0
    ? "This thread is busy. Stop the agent or wait for it to finish before changing the history."
    : null;
}

/** Editing needs confirmation when the conversation has messages after the edited one (they are removed). */
export function editNeedsConfirmation(laterMessages: number): boolean {
  return laterMessages > 0;
}

/** The message the agent is asked again for a retry: the person's message that began the answer. */
export function retrySourceIndex(
  messages: ReadonlyArray<{ id: string; author: string; turnId?: string; source?: string }>,
  messageId: string,
): number {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0) return -1;
  const target = messages[index];
  if (target?.author === "user") return index;
  for (let before = index - 1; before >= 0; before -= 1) {
    const candidate = messages[before];
    if (candidate?.author === "user" && (candidate.source ?? "user") === "user") return before;
  }
  return -1;
}

// --- guards and parsers ---

export function isMessagePin(value: unknown): value is MessagePin {
  return isDynamicRecord(value) && isString(value.messageId) && isString(value.pinnedAt);
}

export function isMessagePinList(value: unknown): value is MessagePin[] {
  return Array.isArray(value) && value.every(isMessagePin);
}

export function isMessagePinsChanged(value: unknown): value is MessagePinsChanged & { type: "message-pins-changed" } {
  return (
    isDynamicRecord(value) &&
    value.type === "message-pins-changed" &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isMessagePinList(value.pins)
  );
}

export function isMessageActionResult(value: unknown): value is MessageActionResult {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.removedMessageIds) &&
    value.removedMessageIds.every(isString) &&
    (value.receipt === null ||
      (isDynamicRecord(value.receipt) && isString(value.receipt.messageId) && Array.isArray(value.receipt.deliveries)))
  );
}

function record(value: unknown): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  return value;
}

function id(value: unknown, what: string): string {
  if (!isString(value) || value.length === 0 || value.length > 200) throw new Error(`Choose ${what}.`);
  return value;
}

function target(input: DynamicRecord): MessageActionTarget {
  const threadId = input.threadId;
  if (threadId !== undefined && threadId !== null && (!isString(threadId) || threadId.length === 0))
    throw new Error("Choose a thread.");
  return {
    botId: id(input.botId, "an agent"),
    threadId: threadId ?? null,
    messageId: id(input.messageId, "a message"),
  };
}

export function parseRetryMessageInput(value: unknown): RetryMessageInput {
  return target(record(value));
}

export function parseEditMessageInput(value: unknown): EditMessageInput {
  const input = record(value);
  if (!isString(input.text) || input.text.trim().length === 0) throw new Error("The message cannot be empty.");
  if (input.text.length > MESSAGE_ACTION_LIMITS.editedText) throw new Error("The message is too long.");
  if (input.confirm !== undefined && !isBoolean(input.confirm)) throw new Error("confirm must be true or false.");
  return { ...target(input), text: input.text, confirm: input.confirm === true };
}

export function parseDeleteMessageInput(value: unknown): DeleteMessageInput {
  const input = record(value);
  if (input.confirm !== true) throw new Error("Deleting a message needs confirmation.");
  return { ...target(input), confirm: true };
}

export function parsePinMessageInput(value: unknown): PinMessageInput {
  const input = record(value);
  if (!isBoolean(input.pinned)) throw new Error("pinned must be true or false.");
  return { ...target(input), pinned: input.pinned };
}

export function parseListPinsInput(value: unknown): ListPinsInput {
  const input = record(value);
  const threadId = input.threadId;
  if (threadId !== undefined && threadId !== null && (!isString(threadId) || threadId.length === 0))
    throw new Error("Choose a thread.");
  return { botId: id(input.botId, "an agent"), threadId: threadId ?? null };
}

export function isMessageAction(value: unknown): value is MessageAction {
  return isOneOf(MESSAGE_ACTIONS, value);
}
