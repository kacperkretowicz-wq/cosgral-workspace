// COSGRAL W6-BE4: the subagents for Storybook and the preview. Demo data only. The same rules as the program: at most 3
// work at the same time in a thread (the next is refused with a readable reason), a subagent cannot start subagents, a
// finished one cannot be changed, Stop ends one at once, and ending the parent's turn stops its subagents. `spawn`,
// `write`, `ask`, `answer`, `complete`, `fail` and `endParentTurn` let a story play the agent and the program.

import {
  type AgentEvent,
  SUBAGENT_LIMITS,
  type Subagent,
  type SubagentsDesktopApi,
  subagentIsActive,
  subagentPreviewText,
  subagentResultText,
  subagentStartProblem,
  subagentTitle,
} from "@openbot/contracts/ipc";

export interface MockSubagents extends Required<SubagentsDesktopApi> {
  /** The agent starts a subagent (a card in the panel). `depth` 1 plays a subagent that tries to start another. */
  spawn: (input: {
    botId: string;
    threadId: string;
    parentTurnId?: string | null;
    task: string;
    title?: string | null;
    depth?: number;
  }) => Subagent;
  /** What the subagent has written so far (the preview while it works). */
  write: (id: string, text: string) => Subagent;
  /** The subagent waits for the person: the cards with these ids are in "Needs you". */
  ask: (id: string, requestIds: string[]) => Subagent;
  /** The person answered: it works again. */
  answer: (id: string) => Subagent;
  complete: (id: string, result: string) => Subagent;
  fail: (id: string, error: string) => Subagent;
  /** The parent's turn ended or was stopped: its active subagents are stopped. */
  endParentTurn: (botId: string, threadId: string) => Subagent[];
}

export function createMockSubagents(
  emit: (event: AgentEvent) => void,
  options: { activeThread?: (botId: string) => string } = {},
): MockSubagents {
  const subagents = new Map<string, Subagent>();
  let counter = 0;
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };

  const need = (id: string): Subagent => {
    const found = subagents.get(id);
    if (!found) throw new Error("Unknown subagent.");
    return found;
  };
  const change = (subagent: Subagent, patch: Partial<Subagent>): Subagent => {
    Object.assign(subagent, patch, { updatedAt: now() });
    emit({ type: "subagent-changed", subagent: structuredClone(subagent) });
    return structuredClone(subagent);
  };
  const end = (subagent: Subagent, state: "done" | "failed" | "stopped", patch: Partial<Subagent> = {}) =>
    change(subagent, { state, finishedAt: now(), waitingRequestIds: [], ...patch });
  const active = (id: string): Subagent => {
    const found = need(id);
    if (!subagentIsActive(found)) throw new Error("This subagent has already ended.");
    return found;
  };

  return {
    spawn: (input) => {
      const running = [...subagents.values()].filter(
        (item) => item.botId === input.botId && item.threadId === input.threadId && subagentIsActive(item),
      ).length;
      const problem = subagentStartProblem({ depth: input.depth ?? 0, running });
      if (problem) throw new Error(problem);
      counter += 1;
      const at = now();
      const subagent: Subagent = {
        id: `sub-${counter}`,
        botId: input.botId,
        threadId: input.threadId,
        parentTurnId: input.parentTurnId ?? null,
        title: subagentTitle(input.title, input.task),
        task: input.task.trim(),
        state: "working",
        createdAt: at,
        updatedAt: at,
        finishedAt: null,
        preview: null,
        result: null,
        error: null,
        waitingRequestIds: [],
      };
      subagents.set(subagent.id, subagent);
      emit({ type: "subagent-changed", subagent: structuredClone(subagent) });
      return structuredClone(subagent);
    },
    write: (id, text) => change(active(id), { preview: subagentPreviewText(text) }),
    ask: (id, requestIds) => change(active(id), { state: "waiting", waitingRequestIds: [...requestIds] }),
    answer: (id) => change(active(id), { state: "working", waitingRequestIds: [] }),
    complete: (id, result) => end(active(id), "done", { result: subagentResultText(result), preview: null }),
    fail: (id, error) => end(active(id), "failed", { error, preview: null }),
    endParentTurn: (botId, threadId) =>
      [...subagents.values()]
        .filter((item) => item.botId === botId && item.threadId === threadId && subagentIsActive(item))
        .map((item) => end(item, "stopped", { error: "The turn of the agent ended." })),
    list: async ({ botId, threadId }) =>
      [...subagents.values()]
        .filter(
          (item) =>
            item.botId === botId && item.threadId === (threadId ?? options.activeThread?.(botId) ?? item.threadId),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, SUBAGENT_LIMITS.listed)
        .map((item) => structuredClone(item)),
    stop: async ({ subagentId }) => {
      const found = need(subagentId);
      if (!subagentIsActive(found)) return structuredClone(found);
      return end(found, "stopped", { error: "Stopped by the user." });
    },
  };
}
