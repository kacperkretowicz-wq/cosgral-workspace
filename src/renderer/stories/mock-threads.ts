// COSGRAL W6-BE1: the threads of an agent for Storybook and the preview. Demo data only. The same rules as the program:
// one active thread per agent, archive moves the active thread on (or makes a new one), delete needs `confirm: true`,
// a branch is a new thread with a link to its parent. `simulate` lets a story make a turn run, a card open, messages arrive.

import {
  type AgentEvent,
  branchThreadTitle,
  type CreateThreadInput,
  NEW_THREAD_TITLE,
  newPendingThreadDelete,
  nextActiveThreadId,
  normalizeThreadTitle,
  type PendingThreadDelete,
  pendingDeleteExpired,
  THREAD_LIMITS,
  type ThreadList,
  type ThreadSummary,
  type ThreadsDesktopApi,
  type ThreadUndoDesktopApi,
  threadTitleProblem,
  undoDeleteProblem,
} from "@openbot/contracts/ipc";

export interface MockThreads extends Required<ThreadsDesktopApi> {
  /** COSGRAL W12 (BE-K): delete with undo (`window.openbot.threadUndo`); `delete` above stays "for good, now". */
  undo: Required<ThreadUndoDesktopApi>;
  /** Changes what a thread shows (state of a running turn, unread, queue, open cards) and says so like the program. */
  simulate: (
    botId: string,
    threadId: string,
    patch: Partial<Pick<ThreadSummary, "state" | "unread" | "queued" | "needsYou" | "preview">>,
  ) => void;
}

export function createMockThreads(
  emit: (event: AgentEvent) => void,
  seed: Record<string, ThreadSummary[]> = {},
  options: { clock?: () => Date } = {},
): MockThreads {
  const byBot = new Map<string, ThreadSummary[]>(
    Object.entries(seed).map(([botId, threads]) => [botId, structuredClone(threads)]),
  );
  let counter = 0;
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };

  const threadsOf = (botId: string): ThreadSummary[] => {
    const existing = byBot.get(botId);
    if (existing && existing.length > 0) return existing;
    const first = make(botId, { active: true });
    byBot.set(botId, [first]);
    return [first];
  };

  function make(
    botId: string,
    options: { active: boolean; title?: string | null; parent?: ThreadSummary; fromMessageId?: string },
  ): ThreadSummary {
    counter += 1;
    const title = options.title ? normalizeThreadTitle(options.title) : "";
    const at = now();
    return {
      id: `${botId}-thread-${counter}`,
      botId,
      title: title || (options.parent ? branchThreadTitle(options.parent.title) : NEW_THREAD_TITLE),
      titled: title.length > 0,
      state: "idle",
      active: options.active,
      unread: 0,
      queued: 0,
      needsYou: 0,
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
      preview: "",
      parentThreadId: options.parent?.id ?? null,
      parentTitle: options.parent?.title ?? null,
      branchedFromMessageId: options.fromMessageId ?? null,
    };
  }

  const answer = (botId: string): ThreadList => {
    const threads = threadsOf(botId);
    const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      botId,
      activeThreadId: threads.find((thread) => thread.active)?.id ?? null,
      threads: structuredClone(sorted),
    };
  };

  const changed = (botId: string): ThreadList => {
    const list = answer(botId);
    emit({ type: "threads-changed", ...list });
    return list;
  };

  const find = (botId: string, threadId: string): ThreadSummary => {
    const thread = threadsOf(botId).find((item) => item.id === threadId);
    if (!thread) throw new Error("Unknown thread.");
    return thread;
  };

  const activate = (botId: string, thread: ThreadSummary) => {
    for (const item of threadsOf(botId)) item.active = item.id === thread.id;
  };

  /** The active thread left (archived or deleted): the newest other open one, else a new empty thread. */
  const moveActiveOn = (botId: string, leaving: ThreadSummary) => {
    const threads = threadsOf(botId);
    const nextId = nextActiveThreadId(threads, leaving.id);
    const next = threads.find((item) => item.id === nextId);
    if (next) return activate(botId, next);
    const fresh = make(botId, { active: true });
    for (const item of threads) item.active = false;
    threads.push(fresh);
  };

  // --- COSGRAL W12 (BE-K): delete with undo ---
  const undoClock = options.clock ?? (() => new Date());
  const pendingByBot = new Map<string, { pending: PendingThreadDelete; thread: ThreadSummary }[]>();
  const livePending = (botId: string) => {
    const keep = (pendingByBot.get(botId) ?? []).filter((entry) => !pendingDeleteExpired(entry.pending, undoClock()));
    pendingByBot.set(botId, keep);
    return keep;
  };
  const announcePending = (botId: string) =>
    emit({
      type: "thread-deletes-changed",
      botId,
      pending: livePending(botId)
        .map((entry) => structuredClone(entry.pending))
        .reverse(),
    });
  /** Takes the thread out of the list; when it was the active one the newest other open thread (or a new empty one) becomes active. */
  const takeOut = (botId: string, threadId: string, clearLinks: boolean): ThreadSummary => {
    const thread = find(botId, threadId);
    byBot.set(
      botId,
      threadsOf(botId).filter((item) => item.id !== threadId),
    );
    // A branch keeps the name of its parent but loses the link (only when the thread is gone for good).
    if (clearLinks)
      for (const item of threadsOf(botId)) if (item.parentThreadId === threadId) item.parentThreadId = null;
    if (thread.active) {
      const rest = threadsOf(botId);
      const next = rest.find((item) => item.id === nextActiveThreadId(rest, threadId));
      if (next) activate(botId, next);
      else rest.push(make(botId, { active: true }));
    }
    return thread;
  };

  const undo: Required<ThreadUndoDesktopApi> = {
    delete: async ({ botId, threadId, confirm }) => {
      if (confirm !== true) throw new Error("Deleting a thread for good needs confirmation.");
      const thread = takeOut(botId, threadId, false);
      const pending = newPendingThreadDelete(
        { botId, threadId, title: thread.title, wasActive: thread.active },
        undoClock(),
      );
      pendingByBot.set(botId, [...livePending(botId), { pending, thread }]);
      const list = changed(botId);
      announcePending(botId);
      return { list, pending: structuredClone(pending) };
    },
    undo: async ({ botId, threadId }) => {
      // An entry whose time ran out is still known here, so the answer says so (like the program), then it is dropped.
      const entry = (pendingByBot.get(botId) ?? []).find((item) => item.pending.threadId === threadId) ?? null;
      const problem = undoDeleteProblem(
        entry?.pending ?? null,
        undoClock(),
        threadsOf(botId).length < THREAD_LIMITS.threadsPerAgent,
      );
      if (problem || !entry) {
        announcePending(botId);
        throw new Error(problem ?? "There is nothing to undo for this thread.");
      }
      pendingByBot.set(
        botId,
        livePending(botId).filter((item) => item !== entry),
      );
      threadsOf(botId).push(entry.thread);
      if (entry.pending.wasActive) activate(botId, entry.thread);
      const list = changed(botId);
      announcePending(botId);
      return list;
    },
    list: async ({ botId }) =>
      livePending(botId)
        .map((entry) => structuredClone(entry.pending))
        .reverse(),
  };

  const create = (input: CreateThreadInput) => {
    const problem = threadTitleProblem(input.title ?? "");
    if (problem) throw new Error(problem);
    const threads = threadsOf(input.botId);
    if (threads.length >= THREAD_LIMITS.threadsPerAgent)
      throw new Error(`An agent has at most ${THREAD_LIMITS.threadsPerAgent} threads.`);
    const thread = make(input.botId, { active: true, title: input.title });
    for (const item of threads) item.active = false;
    threads.push(thread);
    return changed(input.botId);
  };

  return {
    list: async ({ botId }) => answer(botId),
    create: async (input) => create(input),
    rename: async ({ botId, threadId, title }) => {
      const problem = threadTitleProblem(title);
      if (problem) throw new Error(problem);
      const thread = find(botId, threadId);
      const clean = normalizeThreadTitle(title);
      thread.title = clean || NEW_THREAD_TITLE;
      thread.titled = clean.length > 0;
      thread.updatedAt = now();
      return changed(botId);
    },
    archive: async ({ botId, threadId }) => {
      const thread = find(botId, threadId);
      if (thread.state !== "archived") {
        thread.state = "archived";
        thread.archivedAt = now();
        thread.updatedAt = thread.archivedAt;
        if (thread.active) {
          thread.active = false;
          moveActiveOn(botId, thread);
        }
      }
      return changed(botId);
    },
    restore: async ({ botId, threadId }) => {
      const thread = find(botId, threadId);
      if (thread.state === "archived") {
        thread.state = "idle";
        thread.archivedAt = null;
        thread.updatedAt = now();
      }
      return changed(botId);
    },
    undo,
    delete: async ({ botId, threadId, confirm }) => {
      if (confirm !== true) throw new Error("Deleting a thread for good needs confirmation.");
      // "Delete now" also works on a thread that is waiting in the undo window.
      const waiting = livePending(botId).find((entry) => entry.pending.threadId === threadId);
      if (waiting) {
        pendingByBot.set(
          botId,
          livePending(botId).filter((entry) => entry !== waiting),
        );
        for (const item of threadsOf(botId)) if (item.parentThreadId === threadId) item.parentThreadId = null;
        announcePending(botId);
        return answer(botId);
      }
      takeOut(botId, threadId, true);
      return changed(botId);
    },
    select: async ({ botId, threadId }) => {
      const thread = find(botId, threadId);
      if (thread.state === "archived") throw new Error("Restore the thread first.");
      activate(botId, thread);
      thread.unread = 0;
      return changed(botId);
    },
    branch: async ({ botId, threadId, fromMessageId, title }) => {
      const problem = threadTitleProblem(title ?? "");
      if (problem) throw new Error(problem);
      const parent = find(botId, threadId);
      const threads = threadsOf(botId);
      if (threads.length >= THREAD_LIMITS.threadsPerAgent)
        throw new Error(`An agent has at most ${THREAD_LIMITS.threadsPerAgent} threads.`);
      const thread = make(botId, { active: true, title, parent, fromMessageId });
      for (const item of threads) item.active = false;
      threads.push(thread);
      return changed(botId);
    },
    simulate: (botId, threadId, patch) => {
      const thread = find(botId, threadId);
      Object.assign(thread, patch);
      thread.updatedAt = now();
      emit({
        type: "thread-activity",
        botId,
        threadId,
        state: thread.state,
        unread: thread.unread,
        queued: thread.queued,
        needsYou: thread.needsYou,
        updatedAt: thread.updatedAt,
      });
    },
  };
}
