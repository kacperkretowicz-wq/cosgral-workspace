import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  emptyHistory,
  HISTORY_LIMIT,
  HISTORY_MERGE_MS,
  record,
  redo,
  undo,
} from "./workflow-history";

describe("workflow history", () => {
  it("starts with nothing to undo or redo", () => {
    const history = emptyHistory<number>();
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(undo(history, 1)).toBeUndefined();
    expect(redo(history, 1)).toBeUndefined();
  });

  it("undoes and redoes in order", () => {
    let history = emptyHistory<number>();
    history = record(history, 1, 0); // 1 -> 2
    history = record(history, 2, 10_000); // 2 -> 3
    const back = undo(history, 3);
    expect(back?.value).toBe(2);
    const backAgain = undo(back?.history ?? history, 2);
    expect(backAgain?.value).toBe(1);
    expect(canUndo(backAgain?.history ?? history)).toBe(false);
    const forward = redo(backAgain?.history ?? history, 1);
    expect(forward?.value).toBe(2);
    expect(redo(forward?.history ?? history, 2)?.value).toBe(3);
  });

  it("merges quick changes into one step (one drag, one title)", () => {
    let history = emptyHistory<number>();
    history = record(history, 1, 0);
    history = record(history, 2, 100);
    history = record(history, 3, 100 + HISTORY_MERGE_MS - 1);
    expect(history.past).toEqual([1]);
    history = record(history, 4, 100 + HISTORY_MERGE_MS - 1 + HISTORY_MERGE_MS);
    expect(history.past).toEqual([1, 4]);
  });

  it("drops the redo list on a new change", () => {
    let history = record(emptyHistory<number>(), 1, 0);
    history = undo(history, 2)?.history ?? history;
    expect(canRedo(history)).toBe(true);
    history = record(history, 1, 50_000);
    expect(canRedo(history)).toBe(false);
  });

  it("keeps a bounded number of steps", () => {
    let history = emptyHistory<number>();
    for (let index = 0; index < HISTORY_LIMIT + 20; index += 1) history = record(history, index, index * 10_000);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[history.past.length - 1]).toBe(HISTORY_LIMIT + 19);
  });
});
