// COSGRAL W12 (BE-K): undo of deleting a thread ("Deleted. Undo" for a few minutes).
//
// `threads.delete` removes a thread for good, at once. This adds a second way: `threadUndo.delete` HIDES the thread (it is not in the list,
// cannot be selected, branched or sent to) and removes it for good only when the undo window has passed; until then nothing of it is
// touched (history, queue, cards, plans, pins stay as they were), so `threadUndo.undo` brings back everything, not a copy. The window
// is THREAD_UNDO_LIMITS.windowMinutes; the end of it is saved, so a restart does not extend it, and a thread whose time ran out while the
// program was closed is removed when it starts. `threads.delete` still works as "delete now" (also on a thread that is waiting).
//
// Not covered by the hiding: a search through all messages may still find the thread's messages until the window ends; a message that
// waits in its queue may still start a turn there (the removal waits until the turn is over). This computer only.

import {
  type DeleteThreadInput,
  isThreadList,
  type ListThreadsInput,
  THREAD_LIMITS,
  type ThreadInput,
  type ThreadList,
} from "./ipc-threads";
import { isBoolean, isDynamicRecord, isString } from "./runtime-values";

export const THREAD_UNDO_LIMITS = {
  /** How long a deleted thread can be brought back. */
  windowMinutes: 10,
} as const;

export const THREAD_UNDO_WINDOW_MS = THREAD_UNDO_LIMITS.windowMinutes * 60_000;

/** A deleted thread that can still be brought back. */
export interface PendingThreadDelete {
  botId: string;
  threadId: string;
  /** The title the thread had (always readable), for "Deleted "<title>". Undo". */
  title: string;
  /** The thread was the one the window showed; undo shows it again. */
  wasActive: boolean;
  deletedAt: string;
  /** After this time undo is no longer possible and the thread is removed for good. */
  expiresAt: string;
}

export interface DeleteThreadUndoResult {
  /** The agent's list without the deleted thread. */
  list: ThreadList;
  pending: PendingThreadDelete;
}

/** `window.openbot.threadUndo` (this computer only). */
export interface ThreadUndoDesktopApi {
  /** Same refusals as `threads.delete` (needs `confirm: true`; refused while a turn runs in the thread). Hides, does not remove yet. */
  delete: (input: DeleteThreadInput) => Promise<DeleteThreadUndoResult>;
  /** Brings the thread back with everything it had. The list is answered whole; `wasActive` threads are shown again. */
  undo: (input: ThreadInput) => Promise<ThreadList>;
  /** The deleted threads of an agent that can still be brought back, newest first. */
  list: (input: ListThreadsInput) => Promise<PendingThreadDelete[]>;
}

/** `thread-deletes-changed`: the threads of an agent that can be brought back changed (one was deleted, brought back or ran out of time). */
export interface ThreadDeletesChanged {
  botId: string;
  pending: PendingThreadDelete[];
}

// -- rules shared by the engine and the mock -------------------------------------------------------------------------------------

export function newPendingThreadDelete(
  input: { botId: string; threadId: string; title: string; wasActive: boolean },
  now: Date,
  windowMs: number = THREAD_UNDO_WINDOW_MS,
): PendingThreadDelete {
  return {
    ...input,
    deletedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + windowMs).toISOString(),
  };
}

export function pendingDeleteExpired(pending: Pick<PendingThreadDelete, "expiresAt">, now: Date): boolean {
  return Date.parse(pending.expiresAt) <= now.getTime();
}

/** Seconds left to undo (0 when the time is out), for a countdown. */
export function pendingDeleteSecondsLeft(pending: Pick<PendingThreadDelete, "expiresAt">, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(pending.expiresAt) - now.getTime()) / 1000));
}

/** Why a thread cannot be brought back, in plain words, or null. */
export function undoDeleteProblem(
  pending: Pick<PendingThreadDelete, "expiresAt"> | null,
  now: Date,
  hasRoom: boolean,
  /** Threads one agent may have (default THREAD_LIMITS.threadsPerAgent). */
  limit: number = THREAD_LIMITS.threadsPerAgent,
): string | null {
  if (!pending) return "There is nothing to undo for this thread.";
  if (pendingDeleteExpired(pending, now)) return "The time to undo has passed.";
  if (!hasRoom) return `An agent has at most ${limit} threads.`;
  return null;
}

// -- guards ----------------------------------------------------------------------------------------------------------------------

export function isPendingThreadDelete(value: unknown): value is PendingThreadDelete {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isString(value.title) &&
    isBoolean(value.wasActive) &&
    isString(value.deletedAt) &&
    isString(value.expiresAt)
  );
}

export function isPendingThreadDeleteList(value: unknown): value is PendingThreadDelete[] {
  return Array.isArray(value) && value.every(isPendingThreadDelete);
}

export function isDeleteThreadUndoResult(value: unknown): value is DeleteThreadUndoResult {
  return isDynamicRecord(value) && isThreadList(value.list) && isPendingThreadDelete(value.pending);
}

export function isThreadDeletesChanged(
  value: unknown,
): value is ThreadDeletesChanged & { type: "thread-deletes-changed" } {
  return (
    isDynamicRecord(value) &&
    value.type === "thread-deletes-changed" &&
    isString(value.botId) &&
    isPendingThreadDeleteList(value.pending)
  );
}
