// COSGRAL W6-KK3: the separate conversation window (spec-w6.md 1F, W36-W38; decisions Q16, Q17).
//
// "Open in a separate window" (the row menu of an agent) opens the FULL conversation of one thread in its own window:
// history, the message box, the decision card and the "Needs you" cards of that thread. It is not the dock (the dock
// is the small chats; Q17) and it is not a second copy of the data: the window is the same program, the same preload
// and the same trust, reading the same engine. There is at most one window per (agent, thread): opening it again
// brings the existing window to the front instead of making a duplicate. Closing a window never touches the thread
// or a running turn (W38); windows are not brought back after a restart (Q16).
//
// `live`: until the engine can read a thread that is not the one the agent shows in the main window, a window can
// only follow the agent's ACTIVE thread. When the person switches the agent to another thread in the main window,
// the window of the old thread says so (`live: false`) instead of showing the other thread's messages (no mixing of
// threads between windows); it is live again when that thread is active again.
//
// Everything here is about THIS computer only (a phone or a remote server may not call it).

import { type DynamicRecord, isBoolean, isDynamicRecord, isString } from "./runtime-values";

export const CONVERSATION_WINDOW_LIMITS = {
  /** Windows open at once (the dock and the main window are not counted). */
  maxOpen: 8,
  /** Characters of a window title. */
  title: 120,
} as const;

/** The route a conversation window loads: `#conversation/<agent>/<thread>`. */
export const CONVERSATION_WINDOW_HASH = "#conversation";

export interface ConversationWindowInfo {
  /** `<botId>:<threadId>`: the same pair always gives the same id. */
  id: string;
  botId: string;
  /** The public thread id of the conversation (the one threads and cards carry). */
  threadId: string;
  /** "<agent> / <thread title>", kept in step with renames. */
  title: string;
  /** The thread is the one the engine keeps live now; false: the agent shows another thread in the main window. */
  live: boolean;
  /** This window has the focus. */
  focused: boolean;
}

export interface OpenConversationInput {
  botId: string;
  /** Left out or null: the thread the agent shows in the main window now. */
  threadId?: string | null;
}

export interface OpenConversationResult {
  window: ConversationWindowInfo;
  /** false: the window of that thread was already open and was brought to the front. */
  created: boolean;
}

export interface ConversationWindowInput {
  botId: string;
  threadId: string;
}

export interface WindowsDesktopApi {
  /** Opens the conversation of a thread in its own window, or brings the existing one to the front. */
  openConversation: (input: OpenConversationInput) => Promise<OpenConversationResult>;
  /** The conversation windows that are open, oldest first. */
  listOpen: () => Promise<ConversationWindowInfo[]>;
  /** Closes the window of a thread. Nothing happens to the thread or its turn. A window that is not open is not an error. */
  close: (input: ConversationWindowInput) => Promise<void>;
  /** Which (agent, thread) this very window shows; null in the main window and in the dock. */
  current: () => Promise<ConversationWindowInfo | null>;
}

/** Event `conversation-windows-changed`: the whole list of open conversation windows. */
export interface ConversationWindowsChanged {
  windows: ConversationWindowInfo[];
}

// --- rules shared by the engine, the window and the mock ---

export function conversationWindowId(botId: string, threadId: string): string {
  return `${botId}:${threadId}`;
}

export function conversationWindowHash(botId: string, threadId: string): string {
  return `${CONVERSATION_WINDOW_HASH}/${encodeURIComponent(botId)}/${encodeURIComponent(threadId)}`;
}

/** The (agent, thread) a `#conversation/...` route names; null for any other route or a damaged one. */
export function parseConversationWindowHash(hash: string): ConversationWindowInput | null {
  const match = /^#conversation\/([^/]+)\/([^/]+)$/.exec(hash);
  if (!match?.[1] || !match[2]) return null;
  try {
    const botId = decodeURIComponent(match[1]);
    const threadId = decodeURIComponent(match[2]);
    return botId && threadId ? { botId, threadId } : null;
  } catch {
    return null;
  }
}

export function conversationWindowTitle(agentName: string, threadTitle: string | null): string {
  const text = threadTitle ? `${agentName} / ${threadTitle}` : agentName;
  return text.length > CONVERSATION_WINDOW_LIMITS.title
    ? `${text.slice(0, CONVERSATION_WINDOW_LIMITS.title - 1)}…`
    : text;
}

// --- guards and parsers ---

export function isConversationWindowInfo(value: unknown): value is ConversationWindowInfo {
  if (!isDynamicRecord(value)) return false;
  const record: DynamicRecord = value;
  return (
    isString(record.id) &&
    isString(record.botId) &&
    record.botId.length > 0 &&
    isString(record.threadId) &&
    record.threadId.length > 0 &&
    record.id === conversationWindowId(record.botId, record.threadId) &&
    isString(record.title) &&
    isBoolean(record.live) &&
    isBoolean(record.focused)
  );
}

export function isConversationWindowList(value: unknown): value is ConversationWindowInfo[] {
  return Array.isArray(value) && value.every(isConversationWindowInfo);
}

export function isOpenConversationResult(value: unknown): value is OpenConversationResult {
  return isDynamicRecord(value) && isConversationWindowInfo(value.window) && isBoolean(value.created);
}

export function isConversationWindowsChanged(value: unknown): value is ConversationWindowsChanged {
  return isDynamicRecord(value) && isConversationWindowList(value.windows);
}

function parseId(value: unknown, what: string): string {
  if (!isString(value) || value.length === 0 || value.length > 200)
    throw new Error(`A conversation window needs ${what}.`);
  return value;
}

export function parseOpenConversationInput(input: unknown): OpenConversationInput {
  if (!isDynamicRecord(input)) throw new Error("The conversation window request is malformed.");
  const botId = parseId(input.botId, "an agent");
  if (input.threadId === undefined || input.threadId === null) return { botId, threadId: null };
  return { botId, threadId: parseId(input.threadId, "a thread") };
}

export function parseConversationWindowInput(input: unknown): ConversationWindowInput {
  if (!isDynamicRecord(input)) throw new Error("The conversation window request is malformed.");
  return { botId: parseId(input.botId, "an agent"), threadId: parseId(input.threadId, "a thread") };
}
