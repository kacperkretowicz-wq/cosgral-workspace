// COSGRAL W11 (U6): the tabs of the threads of one agent, above its chat. The threads themselves (ipc-threads.ts) stay as they are:
// a thread is "active", "archived" or deleted. A TAB is only whether the window shows it in the strip: closing a tab does not
// archive or delete the thread (it is still in the list of all threads and can be opened again). The order of the tabs is the
// person's own and is kept per agent.
//
// This computer only.

import { isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const THREAD_TAB_LIMITS = {
  /** Tabs open at once per agent; opening one more closes the oldest one that is not active. */
  maxOpen: 12,
  threadId: 128,
} as const;

export interface ThreadTabs {
  botId: string;
  /** The open tabs, left to right: public thread ids (the same ids as ThreadSummary.id). */
  open: string[];
}

export interface ThreadTabInput {
  botId: string;
  threadId: string;
}

export interface ReorderThreadTabsInput {
  botId: string;
  /** The open tabs in the new order: the same ids as now, each once. */
  threadIds: string[];
}

export const THREAD_TAB_CLOSE_MODES = ["this", "others", "right"] as const;
export type ThreadTabCloseMode = (typeof THREAD_TAB_CLOSE_MODES)[number];

export interface CloseThreadTabsInput {
  botId: string;
  /** The tab the menu was opened on. */
  threadId: string;
  mode: ThreadTabCloseMode;
}

/** `thread-tabs-changed`: the strip of one agent changed. */
export interface ThreadTabsChanged extends ThreadTabs {}

/** `window.openbot.threadTabs` (this computer only). */
export interface ThreadTabsDesktopApi {
  get: (input: { botId: string }) => Promise<ThreadTabs>;
  /** Shows a thread as a tab (at the end); an archived or unknown thread is refused. Already open: nothing changes. */
  open: (input: ThreadTabInput) => Promise<ThreadTabs>;
  /** Closes tabs: this one, all the others, or the ones to its right. A thread is never deleted or archived by it. */
  close: (input: CloseThreadTabsInput) => Promise<ThreadTabs>;
  reorder: (input: ReorderThreadTabsInput) => Promise<ThreadTabs>;
}

/** The tabs after opening `threadId`: appended, and over the limit the oldest one that is not `threadId` goes. */
export function openTab(open: readonly string[], threadId: string): string[] {
  if (open.includes(threadId)) return [...open];
  const next = [...open, threadId];
  while (next.length > THREAD_TAB_LIMITS.maxOpen) next.shift();
  return next;
}

/** The tabs after closing in `mode` from the tab `threadId`. A tab that is not open leaves them as they are. */
export function closeTabs(open: readonly string[], threadId: string, mode: ThreadTabCloseMode): string[] {
  const index = open.indexOf(threadId);
  if (index < 0) return [...open];
  if (mode === "this") return open.filter((id) => id !== threadId);
  if (mode === "others") return [threadId];
  return open.slice(0, index + 1);
}

/** True when `order` holds exactly the open tabs, each once, in any order. */
export function isTabPermutation(open: readonly string[], order: readonly string[]): boolean {
  return order.length === open.length && new Set(order).size === order.length && order.every((id) => open.includes(id));
}

export function parseThreadTabInput(input: unknown): ThreadTabInput {
  if (!isDynamicRecord(input) || !isString(input.botId) || input.botId.length === 0)
    throw new Error("Choose an agent.");
  if (!isString(input.threadId) || input.threadId.length === 0 || input.threadId.length > THREAD_TAB_LIMITS.threadId) {
    throw new Error("Choose a thread.");
  }
  return { botId: input.botId, threadId: input.threadId };
}

export function parseCloseThreadTabsInput(input: unknown): CloseThreadTabsInput {
  const base = parseThreadTabInput(input);
  if (!isDynamicRecord(input) || !isOneOf(THREAD_TAB_CLOSE_MODES, input.mode)) {
    throw new Error(`Close "${THREAD_TAB_CLOSE_MODES.join('", "')}".`);
  }
  return { ...base, mode: input.mode };
}

export function parseReorderThreadTabsInput(input: unknown): ReorderThreadTabsInput {
  if (!isDynamicRecord(input) || !isString(input.botId) || input.botId.length === 0)
    throw new Error("Choose an agent.");
  if (
    !Array.isArray(input.threadIds) ||
    input.threadIds.length > THREAD_TAB_LIMITS.maxOpen ||
    !input.threadIds.every((id) => isString(id) && id.length > 0 && id.length <= THREAD_TAB_LIMITS.threadId)
  ) {
    throw new Error("The new order is a list of thread ids.");
  }
  return { botId: input.botId, threadIds: [...input.threadIds] };
}

export function isThreadTabs(value: unknown): value is ThreadTabs {
  return isDynamicRecord(value) && isString(value.botId) && Array.isArray(value.open) && value.open.every(isString);
}

export function isThreadTabsChanged(value: unknown): value is ThreadTabsChanged & { type: "thread-tabs-changed" } {
  return isDynamicRecord(value) && value.type === "thread-tabs-changed" && isThreadTabs(value);
}
