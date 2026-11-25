/**
 * Undo and redo for the workflow draft. Kept apart from the page so it can be tested without a window.
 *
 * `record` is called with the draft as it was just before a change. Changes that follow each other quickly (dragging a
 * step, typing a title) belong to one gesture, so they share one undo step: only the first of them is remembered.
 */
export type History<T> = { past: T[]; future: T[]; lastChangeAt: number };

/** How many undo steps are kept. */
export const HISTORY_LIMIT = 100;
/** Changes closer together than this (in milliseconds) count as one gesture. */
export const HISTORY_MERGE_MS = 700;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], lastChangeAt: 0 };
}

export function record<T>(history: History<T>, before: T, now: number): History<T> {
  const sameGesture = history.past.length > 0 && now - history.lastChangeAt < HISTORY_MERGE_MS;
  const past = sameGesture ? history.past : [...history.past, before].slice(-HISTORY_LIMIT);
  return { past, future: [], lastChangeAt: now };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

/** Steps back: `value` is the draft to show, `history` the new history. Returns undefined when there is nothing to undo. */
export function undo<T>(history: History<T>, current: T): { value: T; history: History<T> } | undefined {
  const value = history.past[history.past.length - 1];
  if (value === undefined) return undefined;
  return {
    value,
    history: { past: history.past.slice(0, -1), future: [...history.future, current], lastChangeAt: 0 },
  };
}

/** Steps forward again after an undo. Returns undefined when there is nothing to redo. */
export function redo<T>(history: History<T>, current: T): { value: T; history: History<T> } | undefined {
  const value = history.future[history.future.length - 1];
  if (value === undefined) return undefined;
  return {
    value,
    history: { past: [...history.past, current], future: history.future.slice(0, -1), lastChangeAt: 0 },
  };
}
