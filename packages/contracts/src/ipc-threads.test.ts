import { describe, expect, it } from "vitest";
import {
  autoThreadTitle,
  branchThreadTitle,
  IPC_CHANNELS,
  isThreadActivity,
  isThreadList,
  isThreadSummary,
  NEW_THREAD_TITLE,
  nextActiveThreadId,
  normalizeThreadTitle,
  parseBranchThreadInput,
  parseCreateThreadInput,
  parseDeleteThreadInput,
  parseListThreadsInput,
  parseRenameThreadInput,
  parseThreadInput,
  THREAD_LIMITS,
  type ThreadSummary,
  threadStateOf,
  threadTitleProblem,
} from "./ipc";
import { isAgentEvent } from "./ipc-conversation";

const summary: ThreadSummary = {
  id: "openbot-thread-1",
  botId: "chief",
  title: "Plan the launch",
  titled: true,
  state: "idle",
  active: true,
  unread: 0,
  queued: 0,
  needsYou: 0,
  createdAt: "2026-11-16T10:00:00.000Z",
  updatedAt: "2026-11-16T10:05:00.000Z",
  archivedAt: null,
  preview: "Done.",
  parentThreadId: null,
  parentTitle: null,
  branchedFromMessageId: null,
};

describe("threads contract (W6-BE1): shapes and events", () => {
  it("accepts a thread, a list and the two events, and refuses a wrong state or field", () => {
    expect(isThreadSummary(summary)).toBe(true);
    expect(isThreadSummary({ ...summary, state: "paused" })).toBe(false);
    expect(isThreadSummary({ ...summary, unread: "1" })).toBe(false);
    expect(isThreadSummary({ ...summary, parentThreadId: undefined })).toBe(false);
    const list = { botId: "chief", activeThreadId: summary.id, threads: [summary] };
    expect(isThreadList(list)).toBe(true);
    expect(isThreadList({ ...list, threads: [{ ...summary, active: "yes" }] })).toBe(false);
    expect(isThreadList({ ...list, activeThreadId: 3 })).toBe(false);
    expect(isThreadList({ botId: "chief", activeThreadId: null, threads: [] })).toBe(true);
    expect(isAgentEvent({ type: "threads-changed", ...list })).toBe(true);
    expect(isAgentEvent({ type: "threads-changed", ...list, threads: [{}] })).toBe(false);
    const activity = {
      type: "thread-activity",
      botId: "chief",
      threadId: summary.id,
      state: "running",
      unread: 2,
      queued: 1,
      needsYou: 0,
      updatedAt: summary.updatedAt,
    };
    expect(isThreadActivity(activity)).toBe(true);
    expect(isAgentEvent(activity)).toBe(true);
    expect(isAgentEvent({ ...activity, state: "sleeping" })).toBe(false);
  });

  it("has a channel for every call", () => {
    expect(IPC_CHANNELS.threadsList).toBe("threads:list");
    expect(
      [
        IPC_CHANNELS.threadsCreate,
        IPC_CHANNELS.threadsRename,
        IPC_CHANNELS.threadsArchive,
        IPC_CHANNELS.threadsRestore,
        IPC_CHANNELS.threadsDelete,
        IPC_CHANNELS.threadsSelect,
        IPC_CHANNELS.threadsBranch,
      ].every((channel) => channel.startsWith("threads:")),
    ).toBe(true);
  });
});

describe("threads contract (W6-BE1): rules", () => {
  it("cleans a title and refuses one that is too long", () => {
    expect(normalizeThreadTitle("  Plan \n  the\tlaunch  ")).toBe("Plan the launch");
    expect(threadTitleProblem("")).toBeNull();
    expect(threadTitleProblem("x".repeat(THREAD_LIMITS.title))).toBeNull();
    expect(threadTitleProblem("x".repeat(THREAD_LIMITS.title + 1))).toMatch(/at most 120/);
    expect(threadTitleProblem(7)).toMatch(/text/);
    expect(NEW_THREAD_TITLE).toBe("New thread");
  });

  it("makes the automatic title from the first message", () => {
    expect(autoThreadTitle("Please fix the login page\nand the footer")).toBe("Please fix the login page");
    expect(autoThreadTitle("\n\n  Hello   there  ")).toBe("Hello there");
    expect(autoThreadTitle("   ")).toBe("");
    const long = autoThreadTitle("w".repeat(200));
    expect(long).toHaveLength(THREAD_LIMITS.autoTitle);
    expect(long.endsWith("…")).toBe(true);
  });

  it("names a branch after its parent and keeps the title within the limit", () => {
    expect(branchThreadTitle("Plan the launch")).toBe("Branch of Plan the launch");
    expect(branchThreadTitle("x".repeat(300))).toHaveLength(THREAD_LIMITS.title);
  });

  it("picks the newest other thread that is not archived, or none", () => {
    const threads = [
      { id: "a", state: "idle", updatedAt: "2026-11-16T10:00:00.000Z" },
      { id: "b", state: "archived", updatedAt: "2026-11-16T12:00:00.000Z" },
      { id: "c", state: "running", updatedAt: "2026-11-16T11:00:00.000Z" },
    ] as const;
    expect(nextActiveThreadId(threads, "a")).toBe("c");
    expect(nextActiveThreadId(threads, "c")).toBe("a");
    expect(nextActiveThreadId([threads[0]], "a")).toBeNull();
    expect(nextActiveThreadId([], "a")).toBeNull();
  });

  it("gives a thread one state: archived, then running, then waiting, else idle", () => {
    const base = { archived: false, turnRunning: false, needsYou: 0, queuedWaitingOnPause: false };
    expect(threadStateOf(base)).toBe("idle");
    expect(threadStateOf({ ...base, needsYou: 1 })).toBe("waiting");
    expect(threadStateOf({ ...base, queuedWaitingOnPause: true })).toBe("waiting");
    expect(threadStateOf({ ...base, turnRunning: true, needsYou: 1 })).toBe("running");
    expect(threadStateOf({ ...base, archived: true, turnRunning: true })).toBe("archived");
  });
});

describe("threads contract (W6-BE1): the calls are checked", () => {
  it("parses the inputs and cleans titles", () => {
    expect(parseListThreadsInput({ botId: "chief" })).toEqual({ botId: "chief" });
    expect(parseCreateThreadInput({ botId: "chief" })).toEqual({ botId: "chief", title: null });
    expect(parseCreateThreadInput({ botId: "chief", title: "  Notes  " })).toEqual({ botId: "chief", title: "Notes" });
    expect(parseThreadInput({ botId: "chief", threadId: "t1" })).toEqual({ botId: "chief", threadId: "t1" });
    expect(parseRenameThreadInput({ botId: "chief", threadId: "t1", title: " New  name " })).toEqual({
      botId: "chief",
      threadId: "t1",
      title: "New name",
    });
    expect(parseRenameThreadInput({ botId: "chief", threadId: "t1", title: "" }).title).toBe("");
    expect(parseBranchThreadInput({ botId: "chief", threadId: "t1", fromMessageId: "m1" })).toEqual({
      botId: "chief",
      threadId: "t1",
      fromMessageId: "m1",
      title: null,
    });
  });

  it("refuses a missing agent, thread or message, a long title and a delete without confirmation", () => {
    expect(() => parseListThreadsInput({})).toThrow(/agent/);
    expect(() => parseThreadInput({ botId: "chief" })).toThrow(/thread/);
    expect(() => parseThreadInput(null)).toThrow(/object/);
    expect(() => parseBranchThreadInput({ botId: "chief", threadId: "t1" })).toThrow(/message/);
    expect(() => parseCreateThreadInput({ botId: "chief", title: "x".repeat(121) })).toThrow(/at most 120/);
    expect(() => parseDeleteThreadInput({ botId: "chief", threadId: "t1" })).toThrow(/confirmation/);
    expect(() => parseDeleteThreadInput({ botId: "chief", threadId: "t1", confirm: "yes" })).toThrow(/confirmation/);
    expect(parseDeleteThreadInput({ botId: "chief", threadId: "t1", confirm: true })).toEqual({
      botId: "chief",
      threadId: "t1",
      confirm: true,
    });
  });
});
