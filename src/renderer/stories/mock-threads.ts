// COSGRAL W6-BE1: the threads of an agent for Storybook and the preview. Demo data only. The same rules as the program:
// one active thread per agent, archive moves the active thread on (or makes a new one), delete needs `confirm: true`,
// a branch is a new thread with a link to its parent. `simulate` lets a story make a turn run, a card open, messages arrive.

import {
  type AgentEvent,
  branchThreadTitle,
  type CreateThreadInput,
  NEW_THREAD_TITLE,
  nextActiveThreadId,
  normalizeThreadTitle,
  THREAD_LIMITS,
  type ThreadList,
  type ThreadSummary,
  type ThreadsDesktopApi,
  threadTitleProblem,
} from "@openbot/contracts/ipc";

export interface MockThreads extends Required<ThreadsDesktopApi> {
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
    delete: async ({ botId, threadId, confirm }) => {
      if (confirm !== true) throw new Error("Deleting a thread for good needs confirmation.");
      const thread = find(botId, threadId);
      const wasActive = thread.active;
      byBot.set(
        botId,
        threadsOf(botId).filter((item) => item.id !== threadId),
      );
      // A branch keeps the name of its parent but loses the link.
      for (const item of threadsOf(botId)) if (item.parentThreadId === threadId) item.parentThreadId = null;
      if (wasActive) {
        const rest = threadsOf(botId);
        const next = rest.find((item) => item.id === nextActiveThreadId(rest, threadId));
        if (next) activate(botId, next);
        else rest.push(make(botId, { active: true }));
      }
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
