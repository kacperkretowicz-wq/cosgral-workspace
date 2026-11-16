import type { AgentPlan, Subagent } from "@openbot/contracts/ipc";
export function planFixture(patch: Partial<AgentPlan> = {}): AgentPlan {
  return {
    requestId: "plan-ui",
    botId: "chief",
    threadId: "thread-chief",
    turnId: "turn-ui",
    title: "Prepare the release",
    summary: "Review the changes before publishing.",
    phase: "proposed",
    steps: [
      { id: "s1", title: "Review the changes", detail: "Check the proposed behavior.", status: "pending" },
      { id: "s2", title: "Publish after approval", detail: null, status: "pending" },
    ],
    createdAt: "2026-11-16T12:00:00Z",
    updatedAt: "2026-11-16T12:00:00Z",
    decidedAt: null,
    ...patch,
  };
}
export function subagentFixture(patch: Partial<Subagent> = {}): Subagent {
  return {
    id: "sub-ui",
    botId: "chief",
    threadId: "thread-chief",
    parentTurnId: "turn-ui",
    title: "Review assistant",
    task: "Review the changes and report any issues.",
    state: "working",
    createdAt: "2026-11-16T12:00:00Z",
    updatedAt: "2026-11-16T12:00:00Z",
    finishedAt: null,
    preview: "Reviewing the changed files…",
    result: null,
    error: null,
    waitingRequestIds: [],
    ...patch,
  };
}
