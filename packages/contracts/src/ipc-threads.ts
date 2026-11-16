// COSGRAL W6-BE1: several threads per agent (spec-w6.md 1A, W01-W10, W32; decisions Q1-Q5, Q14).
//
// An agent has any number of threads. One is ACTIVE: it is the conversation the window shows (BotSummary.threadId,
// readConversation, the queue the person sees). The others keep their own history, queue and open "Needs you" cards.
// A turn that is running in a thread finishes in the background when the person switches to another thread (Q1); the
// agent row shows the state. The messages queue per thread (Q2). Memory stays per agent (Q4).
//
// Archiving hides a thread from the active list and blocks sending until it is restored; it is reversible (Q5).
// "Delete for good" is a separate call that needs `confirm: true` (the window asks first, the engine insists).
// Branching makes a NEW thread with the history up to one message and a link to the thread it came from (Q14).
//
// Everything here is about THIS computer only (a phone or a remote server may not call it).

import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const THREAD_LIMITS = {
  /** Characters of a title. */
  title: 120,
  /** Threads one agent may have (archived ones count). */
  threadsPerAgent: 200,
  /** Characters of the automatic title taken from the first message. */
  autoTitle: 60,
  /** Characters of the one-line preview. */
  preview: 180,
} as const;

/** What a thread without a title of its own is called. */
export const NEW_THREAD_TITLE = "New thread";

/**
 * "running": a turn is running or starting in it. "waiting": nothing runs, but a card of "Needs you" is open or the
 * queue waits on a decision. "idle": nothing to do. "archived": hidden from the active list; nothing can be sent.
 */
export const THREAD_STATES = ["running", "waiting", "idle", "archived"] as const;
export type ThreadState = (typeof THREAD_STATES)[number];

export interface ThreadSummary {
  /** The public thread id: the same id the conversation snapshot, the queue and the cards carry. */
  id: string;
  botId: string;
  /** Always readable: the person's title, else a short title from the first message, else NEW_THREAD_TITLE. */
  title: string;
  /** false = no title of the person's own (automatic or the placeholder); the window may show it quieter. */
  titled: boolean;
  state: ThreadState;
  /** The thread the window shows for this agent. Exactly one per agent. */
  active: boolean;
  /** Messages after the last one the person read, in this thread. */
  unread: number;
  /** Messages waiting in this thread's queue. */
  queued: number;
  /** Open cards of "Needs you" in this thread (the combined view shows `title` next to them). */
  needsYou: number;
  createdAt: string;
  /** Last message or change. Lists sort by it, newest first. */
  updatedAt: string;
  archivedAt: string | null;
  /** One line of the last message; "" when the thread is empty. */
  preview: string;
  /** Branching: the thread this one was made from and the message it starts after. null for ordinary threads. */
  parentThreadId: string | null;
  parentTitle: string | null;
  branchedFromMessageId: string | null;
}

/** All threads of an agent (archived ones included, with state "archived"), newest first. */
export interface ThreadList {
  botId: string;
  activeThreadId: string | null;
  threads: ThreadSummary[];
}

export interface ListThreadsInput {
  botId: string;
}

export interface CreateThreadInput {
  botId: string;
  /** Left out or empty: the title comes from the first message. */
  title?: string | null;
}

export interface ThreadInput {
  botId: string;
  threadId: string;
}

export interface RenameThreadInput extends ThreadInput {
  /** Empty = back to the automatic title. */
  title: string;
}

export interface DeleteThreadInput extends ThreadInput {
  /** Must be true: the window asks the person first; a call without it is refused. */
  confirm: true;
}

export interface BranchThreadInput extends ThreadInput {
  /** The new thread has the history up to and including this message of `threadId`. */
  fromMessageId: string;
  title?: string | null;
}

/** The window API. Every call answers the whole list of that agent, so the window replaces it as it is. */
export interface ThreadsDesktopApi {
  list: (input: ListThreadsInput) => Promise<ThreadList>;
  /** A new empty thread; it becomes the active one. */
  create: (input: CreateThreadInput) => Promise<ThreadList>;
  rename: (input: RenameThreadInput) => Promise<ThreadList>;
  /**
   * Hides the thread. When it was the active one, the newest other active thread becomes active, or a new empty
   * thread is made when there is none. A turn that runs in it finishes; nothing new can be sent until it is restored.
   */
  archive: (input: ThreadInput) => Promise<ThreadList>;
  restore: (input: ThreadInput) => Promise<ThreadList>;
  /** Removes the thread, its history, its queue and its cards. Refused without `confirm: true`. Cannot be undone. */
  delete: (input: DeleteThreadInput) => Promise<ThreadList>;
  /** Makes the thread the one the window shows. An archived thread cannot be selected (restore it first). */
  select: (input: ThreadInput) => Promise<ThreadList>;
  /** A new thread from a message (becomes active); the original is not touched. */
  branch: (input: BranchThreadInput) => Promise<ThreadList>;
}

/** `threads-changed`: the list of an agent changed (created, renamed, archived, restored, deleted, switched, activity). */
export interface ThreadsChanged extends ThreadList {}

/**
 * `thread-activity`: a light update of one thread (a turn started or ended, a message arrived, a card opened or closed,
 * the person read it). The full list is not repeated for every token.
 */
export interface ThreadActivity {
  botId: string;
  threadId: string;
  state: ThreadState;
  unread: number;
  queued: number;
  needsYou: number;
  updatedAt: string;
}

// --- rules shared by the engine and the mock ---

/** One line, spaces collapsed, no control characters. */
export function normalizeThreadTitle(value: string): string {
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Why a title is not allowed, or null. Empty is allowed (it means "automatic"). */
export function threadTitleProblem(value: unknown): string | null {
  if (!isString(value)) return "The title must be text.";
  if (normalizeThreadTitle(value).length > THREAD_LIMITS.title)
    return `A title has at most ${THREAD_LIMITS.title} characters.`;
  return null;
}

/** The automatic title: the first line of the first message, cut with an ellipsis; "" when there is nothing to use. */
export function autoThreadTitle(firstMessage: string): string {
  const line = normalizeThreadTitle(firstMessage.split(/\r?\n/).find((part) => part.trim().length > 0) ?? "");
  if (line.length <= THREAD_LIMITS.autoTitle) return line;
  return `${line.slice(0, THREAD_LIMITS.autoTitle - 1).trimEnd()}…`;
}

/** The title a branch gets when the person gives none ("Branch of <title>", at most THREAD_LIMITS.title characters). */
export function branchThreadTitle(parentTitle: string): string {
  return `Branch of ${parentTitle}`.slice(0, THREAD_LIMITS.title).trimEnd();
}

/**
 * After a thread was archived: which one becomes active. The newest other thread that is not archived; null when
 * there is none (the caller makes a new empty thread).
 */
export function nextActiveThreadId(
  threads: ReadonlyArray<Pick<ThreadSummary, "id" | "state" | "updatedAt">>,
  leavingId: string,
): string | null {
  const open = threads.filter((thread) => thread.id !== leavingId && thread.state !== "archived");
  open.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return open[0]?.id ?? null;
}

/** The state of a thread from its facts (the engine and the mock use the same rule). */
export function threadStateOf(input: {
  archived: boolean;
  turnRunning: boolean;
  needsYou: number;
  queuedWaitingOnPause: boolean;
}): ThreadState {
  if (input.archived) return "archived";
  if (input.turnRunning) return "running";
  if (input.needsYou > 0 || input.queuedWaitingOnPause) return "waiting";
  return "idle";
}

// --- guards (the window checks what the program answers) ---

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isThreadSummary(value: unknown): value is ThreadSummary {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.botId) &&
    isString(value.title) &&
    isBoolean(value.titled) &&
    isOneOf(THREAD_STATES, value.state) &&
    isBoolean(value.active) &&
    isNumber(value.unread) &&
    isNumber(value.queued) &&
    isNumber(value.needsYou) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    isNullableString(value.archivedAt) &&
    isString(value.preview) &&
    isNullableString(value.parentThreadId) &&
    isNullableString(value.parentTitle) &&
    isNullableString(value.branchedFromMessageId)
  );
}

export function isThreadList(value: unknown): value is ThreadList {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isNullableString(value.activeThreadId) &&
    Array.isArray(value.threads) &&
    value.threads.every(isThreadSummary)
  );
}

export function isThreadsChanged(value: unknown): value is ThreadsChanged & { type: "threads-changed" } {
  return isDynamicRecord(value) && value.type === "threads-changed" && isThreadList(value);
}

export function isThreadActivity(value: unknown): value is ThreadActivity & { type: "thread-activity" } {
  return (
    isDynamicRecord(value) &&
    value.type === "thread-activity" &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isOneOf(THREAD_STATES, value.state) &&
    isNumber(value.unread) &&
    isNumber(value.queued) &&
    isNumber(value.needsYou) &&
    isString(value.updatedAt)
  );
}

// --- parsers of the calls (the program checks what the window sends) ---

function record(value: unknown): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  return value;
}

function parseId(value: unknown, what: string): string {
  if (!isString(value) || value.length === 0 || value.length > 200) throw new Error(`Choose ${what}.`);
  return value;
}

function parseOptionalTitle(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const problem = threadTitleProblem(value);
  if (problem) throw new Error(problem);
  return isString(value) ? normalizeThreadTitle(value) : null;
}

export function parseListThreadsInput(value: unknown): ListThreadsInput {
  return { botId: parseId(record(value).botId, "an agent") };
}

export function parseCreateThreadInput(value: unknown): CreateThreadInput {
  const input = record(value);
  return { botId: parseId(input.botId, "an agent"), title: parseOptionalTitle(input.title) };
}

export function parseThreadInput(value: unknown): ThreadInput {
  const input = record(value);
  return { botId: parseId(input.botId, "an agent"), threadId: parseId(input.threadId, "a thread") };
}

export function parseRenameThreadInput(value: unknown): RenameThreadInput {
  const input = record(value);
  const title = parseOptionalTitle(input.title ?? "");
  return { ...parseThreadInput(input), title: title ?? "" };
}

export function parseDeleteThreadInput(value: unknown): DeleteThreadInput {
  const input = record(value);
  if (input.confirm !== true) throw new Error("Deleting a thread for good needs confirmation.");
  return { ...parseThreadInput(input), confirm: true };
}

export function parseBranchThreadInput(value: unknown): BranchThreadInput {
  const input = record(value);
  return {
    ...parseThreadInput(input),
    fromMessageId: parseId(input.fromMessageId, "a message"),
    title: parseOptionalTitle(input.title),
  };
}
