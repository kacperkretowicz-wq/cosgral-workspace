import { describe, expect, it } from "vitest";
import {
  isDeleteThreadUndoResult,
  isPendingThreadDelete,
  isPendingThreadDeleteList,
  isThreadDeletesChanged,
  newPendingThreadDelete,
  pendingDeleteExpired,
  pendingDeleteSecondsLeft,
  THREAD_UNDO_LIMITS,
  THREAD_UNDO_WINDOW_MS,
  undoDeleteProblem,
} from "./ipc-thread-undo";
import { THREAD_LIMITS } from "./ipc-threads";

const at = new Date("2026-11-17T01:00:00.000Z");
const made = newPendingThreadDelete({ botId: "chief", threadId: "t-1", title: "Plan", wasActive: true }, at);

describe("undo of deleting a thread (W12 BE-K)", () => {
  it("gives a window of ten minutes from the moment of deleting", () => {
    expect(THREAD_UNDO_LIMITS.windowMinutes).toBe(10);
    expect(made).toEqual({
      botId: "chief",
      threadId: "t-1",
      title: "Plan",
      wasActive: true,
      deletedAt: "2026-11-17T01:00:00.000Z",
      expiresAt: "2026-11-17T01:10:00.000Z",
    });
    expect(
      newPendingThreadDelete({ botId: "a", threadId: "b", title: "c", wasActive: false }, at, 1000).expiresAt,
    ).toBe("2026-11-17T01:00:01.000Z");
    expect(THREAD_UNDO_WINDOW_MS).toBe(600_000);
  });

  it("counts the time left and says when it is out", () => {
    expect(pendingDeleteExpired(made, new Date("2026-11-17T01:09:59.999Z"))).toBe(false);
    expect(pendingDeleteExpired(made, new Date("2026-11-17T01:10:00.000Z"))).toBe(true);
    expect(pendingDeleteSecondsLeft(made, new Date("2026-11-17T01:09:30.500Z"))).toBe(30);
    expect(pendingDeleteSecondsLeft(made, new Date("2026-11-17T02:00:00.000Z"))).toBe(0);
  });

  it("refuses an undo when there is nothing to undo, the time is out, or the agent has no room", () => {
    const early = new Date("2026-11-17T01:05:00.000Z");
    expect(undoDeleteProblem(made, early, true)).toBeNull();
    expect(undoDeleteProblem(null, early, true)).toBe("There is nothing to undo for this thread.");
    expect(undoDeleteProblem(made, new Date("2026-11-17T01:11:00.000Z"), true)).toBe("The time to undo has passed.");
    expect(undoDeleteProblem(made, early, false)).toBe(
      `An agent has at most ${THREAD_LIMITS.threadsPerAgent} threads.`,
    );
  });

  it("checks what the program answers and what it announces", () => {
    expect(isPendingThreadDelete(made)).toBe(true);
    expect(isPendingThreadDelete({ ...made, wasActive: "yes" })).toBe(false);
    expect(isPendingThreadDeleteList([made])).toBe(true);
    expect(isPendingThreadDeleteList([{ ...made, expiresAt: 5 }])).toBe(false);
    const list = { botId: "chief", activeThreadId: null, threads: [] };
    expect(isDeleteThreadUndoResult({ list, pending: made })).toBe(true);
    expect(isDeleteThreadUndoResult({ list: { botId: "chief" }, pending: made })).toBe(false);
    expect(isThreadDeletesChanged({ type: "thread-deletes-changed", botId: "chief", pending: [made] })).toBe(true);
    expect(isThreadDeletesChanged({ type: "threads-changed", botId: "chief", pending: [] })).toBe(false);
  });
});
