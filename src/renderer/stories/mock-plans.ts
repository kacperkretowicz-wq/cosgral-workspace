// COSGRAL W6-BE3: the plan card for Storybook and the preview. Demo data only. The same rules as the program: a plan
// has 1-20 steps (an empty one is refused), only Approve or Reject answers it, nothing is approved by silence, a finished
// step stays finished, and a plan is done when every step is done or skipped. `propose`, `advance` and `stop` let a story
// play the agent and the program.

import {
  type AgentEvent,
  type AgentPlan,
  newPlanSteps,
  type PendingAgentRequest,
  PLAN_LIMITS,
  type PlanPhase,
  type PlanStepInput,
  type PlanStepStatus,
  type PlansDesktopApi,
  planIsOpen,
  planProblem,
  planStepMove,
} from "@openbot/contracts/ipc";

export interface MockPlans extends Required<PlansDesktopApi> {
  /** The agent proposes a plan: a card in "Needs you" until it is answered. */
  propose: (input: {
    botId: string;
    threadId: string;
    turnId?: string;
    title?: string;
    summary?: string | null;
    steps: readonly PlanStepInput[];
  }) => AgentPlan;
  /** The agent reports a step of an approved plan. */
  advance: (requestId: string, stepId: string, status: PlanStepStatus) => AgentPlan;
  /** The person stopped the work (or the program closed): an open plan ends, a proposed one counts as not approved. */
  stop: (requestId: string) => AgentPlan;
  /** The plans that wait for an answer, as the open cards of "Needs you". */
  pendingRequests: () => PendingAgentRequest[];
}

export function createMockPlans(
  emit: (event: AgentEvent) => void,
  options: { activeThread?: (botId: string) => string } = {},
): MockPlans {
  const plans = new Map<string, AgentPlan>();
  let counter = 0;
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };

  const need = (requestId: string): AgentPlan => {
    const plan = plans.get(requestId);
    if (!plan) throw new Error("Unknown plan.");
    return plan;
  };
  const change = (plan: AgentPlan, patch: Partial<Pick<AgentPlan, "phase" | "decidedAt">>): AgentPlan => {
    Object.assign(plan, patch, { updatedAt: now() });
    emit({ type: "plan-changed", plan: structuredClone(plan) });
    return structuredClone(plan);
  };
  const end = (plan: AgentPlan, phase: PlanPhase) => change(plan, { phase });

  return {
    propose: (input) => {
      const problem = planProblem(input.steps);
      if (problem) throw new Error(problem);
      counter += 1;
      const at = now();
      const plan: AgentPlan = {
        requestId: `plan-${counter}`,
        botId: input.botId,
        threadId: input.threadId,
        turnId: input.turnId ?? `turn-${counter}`,
        title: (input.title?.trim() || "Plan").slice(0, PLAN_LIMITS.title),
        summary: input.summary?.trim() ? input.summary.trim() : null,
        steps: newPlanSteps(input.steps),
        phase: "proposed",
        createdAt: at,
        decidedAt: null,
        updatedAt: at,
      };
      plans.set(plan.requestId, plan);
      emit({ type: "plan-changed", plan: structuredClone(plan) });
      return structuredClone(plan);
    },
    respond: async ({ requestId, decision }) => {
      const plan = plans.get(requestId);
      if (plan?.phase !== "proposed") throw new Error("This card is already decided or no longer open.");
      return change(plan, { phase: decision === "approve" ? "approved" : "rejected", decidedAt: now() });
    },
    list: async ({ botId, threadId }) =>
      [...plans.values()]
        .filter(
          (plan) =>
            plan.botId === botId && plan.threadId === (threadId ?? options.activeThread?.(botId) ?? plan.threadId),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, PLAN_LIMITS.listed)
        .map((plan) => structuredClone(plan)),
    advance: (requestId, stepId, status) => {
      const plan = need(requestId);
      if (plan.phase !== "approved") throw new Error("This plan is not approved: do not run it.");
      const step = plan.steps.find((item) => item.id === stepId);
      if (!step) throw new Error("This plan has no such step.");
      const problem = planStepMove(step.status, status);
      if (problem) throw new Error(problem);
      step.status = status;
      const finished = plan.steps.every((item) => item.status === "done" || item.status === "skipped");
      return finished ? end(plan, "completed") : change(plan, {});
    },
    stop: (requestId) => {
      const plan = need(requestId);
      if (!planIsOpen(plan)) return structuredClone(plan);
      return end(plan, plan.phase === "proposed" ? "expired" : "stopped");
    },
    pendingRequests: () =>
      [...plans.values()]
        .filter((plan) => plan.phase === "proposed")
        .map((plan) => ({ kind: "plan" as const, plan: structuredClone(plan) })),
  };
}
