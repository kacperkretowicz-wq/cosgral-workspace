// COSGRAL W6-BE3: the plan card (spec-w6.md 1C, W17-W22; decisions Q8, Q9).
//
// Before a long or multi-step task whose steps change something outside the conversation, the agent shows a PLAN: an
// ordered list of steps. The card waits in "Needs you" (and in the conversation, in the thread it belongs to). The person
// has two choices (Q9): "approve" or "reject". There is no editing of the steps in W6. Nothing is approved by silence:
// a card that closes without an answer (the turn stopped, the program closed) is "expired" and counts as not approved.
//
// After "approve" the agent works through the steps and reports each one (`update_plan`), so the card shows progress.
// After "reject" the agent is told to do none of the steps. The plan is kept (with its phase and progress) with the
// conversation, so its history is still there after a restart. A card that was OPEN (still waiting for an answer, or
// approved and running) does NOT come back as open after a restart: nothing runs without the program and the agent that
// waited is gone. It is then listed as "expired" (it was never answered) or "stopped" (it was approved but not done), and
// it can no longer be approved. The window must not promise that an Approve survives a restart.
//
// The agent uses two tools of the `cosgral_cards` namespace: `propose_plan` (waits for the person) and `update_plan`.
// Whether a plan is needed is a rule of the program's instructions to the agent (`planRequired`, Q8): the program cannot
// force a model to ask, so the rule is stated to the agent and the plan is checked when it arrives.

import { isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const PLAN_LIMITS = {
  /** Steps of one plan (at least one). */
  steps: 20,
  title: 120,
  summary: 1_000,
  stepTitle: 200,
  stepDetail: 1_000,
  /** Plans kept per thread in the list (older ones are dropped from the list, not from the thread). */
  listed: 50,
} as const;

export const PLAN_STEP_STATUSES = ["pending", "in-progress", "done", "skipped"] as const;
export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

/**
 * "proposed": the card waits for the person. "approved": the agent works through the steps. "rejected": the person said
 * no; no step runs. "expired": the card closed without an answer (nothing is approved). "stopped": the person stopped the
 * work (or the program closed) before the plan was done. "completed": every step is done or skipped.
 */
export const PLAN_PHASES = ["proposed", "approved", "rejected", "expired", "stopped", "completed"] as const;
export type PlanPhase = (typeof PLAN_PHASES)[number];

/** The only two answers (Q9). */
export const PLAN_DECISIONS = ["approve", "reject"] as const;
export type PlanDecision = (typeof PLAN_DECISIONS)[number];

export interface PlanStep {
  /** Stable inside the plan ("s1", "s2", ...); the agent reports progress with it. */
  id: string;
  title: string;
  /** A short description, or null. */
  detail: string | null;
  status: PlanStepStatus;
}

export interface AgentPlan {
  /** Also the id of the card. */
  requestId: string;
  botId: string;
  /** The thread the plan belongs to (the same id the conversation, the queue and the other cards carry). */
  threadId: string;
  /** The turn that proposed it. */
  turnId: string;
  title: string;
  summary: string | null;
  steps: PlanStep[];
  phase: PlanPhase;
  createdAt: string;
  /** When the person decided, else null. */
  decidedAt: string | null;
  /** When the phase last changed (a decision, a step, the end). */
  updatedAt: string;
}

export interface RespondToPlanInput {
  requestId: string;
  decision: PlanDecision;
}

export interface ListPlansInput {
  botId: string;
  /** Left out or null: the thread the window shows for this agent. */
  threadId?: string | null;
}

/** `window.openbot.plans` (this computer only). Changes come as the event `plan-changed`. */
export interface PlansDesktopApi {
  /** The person's answer. Throws when the card is no longer open. Answers with the plan as it is now. */
  respond: (input: RespondToPlanInput) => Promise<AgentPlan>;
  /** The plans of a thread, newest first (also the finished ones, with their progress). */
  list: (input: ListPlansInput) => Promise<AgentPlan[]>;
}

/** Event `plan-changed`: a plan was proposed, decided, advanced, stopped or finished. Replace the plan with this requestId. */
export interface PlanChanged {
  plan: AgentPlan;
}

// --- rules shared by the engine and the mock ---

export interface PlanStepInput {
  title: string;
  detail?: string | null;
}

/** A readable reason a list of steps is not a plan (W22: an empty plan is refused, it never becomes a card), or null. */
export function planProblem(steps: unknown): string | null {
  if (!Array.isArray(steps) || steps.length === 0) return "A plan needs at least one step.";
  if (steps.length > PLAN_LIMITS.steps) return `A plan has at most ${PLAN_LIMITS.steps} steps.`;
  for (const [index, step] of steps.entries()) {
    if (!isDynamicRecord(step) || !isString(step.title) || step.title.trim().length === 0)
      return `Step ${index + 1} needs a title.`;
    if (step.title.trim().length > PLAN_LIMITS.stepTitle)
      return `The title of step ${index + 1} has at most ${PLAN_LIMITS.stepTitle} characters.`;
    if (step.detail !== undefined && step.detail !== null) {
      if (!isString(step.detail)) return `The description of step ${index + 1} must be text.`;
      if (step.detail.length > PLAN_LIMITS.stepDetail)
        return `The description of step ${index + 1} has at most ${PLAN_LIMITS.stepDetail} characters.`;
    }
  }
  return null;
}

/** The steps of a proposal as stored: ids s1, s2, ..., trimmed titles, all "pending". Call `planProblem` first. */
export function newPlanSteps(steps: readonly PlanStepInput[]): PlanStep[] {
  return steps.map((step, index) => ({
    id: `s${index + 1}`,
    title: step.title.trim(),
    detail: step.detail?.trim() ? step.detail.trim() : null,
    status: "pending",
  }));
}

/**
 * When the agent must show a plan first (Q8): a task of at least 3 steps, or of at least 2 steps of which one changes
 * something outside the conversation (runs a command, writes a file, calls a tool with an effect, sends something).
 * A plan with one step is allowed but never required.
 */
export function planRequired(input: { stepCount: number; effectfulSteps: number }): boolean {
  return input.stepCount >= 3 || (input.stepCount >= 2 && input.effectfulSteps >= 1);
}

/** How far a plan is: the steps that are finished (done or skipped), and the step in progress, if any. */
export function planProgress(plan: Pick<AgentPlan, "steps">): {
  finished: number;
  total: number;
  current: PlanStep | null;
} {
  const finished = plan.steps.filter((step) => step.status === "done" || step.status === "skipped").length;
  return {
    finished,
    total: plan.steps.length,
    current: plan.steps.find((step) => step.status === "in-progress") ?? null,
  };
}

/** Whether a plan can still be answered, advanced or stopped. */
export function planIsOpen(plan: Pick<AgentPlan, "phase">): boolean {
  return plan.phase === "proposed" || plan.phase === "approved";
}

// --- guards and parsers ---

export function isPlanStep(value: unknown): value is PlanStep {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    (value.detail === null || isString(value.detail)) &&
    isOneOf(PLAN_STEP_STATUSES, value.status)
  );
}

export function isAgentPlan(value: unknown): value is AgentPlan {
  return (
    isDynamicRecord(value) &&
    isString(value.requestId) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isString(value.turnId) &&
    isString(value.title) &&
    (value.summary === null || isString(value.summary)) &&
    Array.isArray(value.steps) &&
    value.steps.every(isPlanStep) &&
    isOneOf(PLAN_PHASES, value.phase) &&
    isString(value.createdAt) &&
    (value.decidedAt === null || isString(value.decidedAt)) &&
    isString(value.updatedAt)
  );
}

export function isAgentPlanList(value: unknown): value is AgentPlan[] {
  return Array.isArray(value) && value.every(isAgentPlan);
}

export function isPlanChanged(value: unknown): value is PlanChanged & { type: "plan-changed" } {
  return isDynamicRecord(value) && value.type === "plan-changed" && isAgentPlan(value.plan);
}

export function parseRespondToPlanInput(value: unknown): RespondToPlanInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  if (!isString(value.requestId) || value.requestId.length === 0 || value.requestId.length > 200)
    throw new Error("Choose a plan.");
  if (!isOneOf(PLAN_DECISIONS, value.decision)) throw new Error('The answer is "approve" or "reject".');
  return { requestId: value.requestId, decision: value.decision };
}

export function parseListPlansInput(value: unknown): ListPlansInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  if (!isString(value.botId) || value.botId.length === 0 || value.botId.length > 200)
    throw new Error("Choose an agent.");
  const threadId = value.threadId;
  if (threadId !== undefined && threadId !== null && (!isString(threadId) || threadId.length === 0))
    throw new Error("Choose a thread.");
  return { botId: value.botId, threadId: threadId ?? null };
}

/** `update_plan` arguments of the agent: which plan, which step, which status. Refused with a readable reason. */
export function parsePlanUpdate(value: unknown): { planId: string; stepId: string; status: PlanStepStatus } {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  if (!isString(value.planId) || value.planId.length === 0) throw new Error("planId is required.");
  if (!isString(value.stepId) || value.stepId.length === 0) throw new Error("stepId is required.");
  if (!isOneOf(PLAN_STEP_STATUSES, value.status))
    throw new Error(`status is one of: ${PLAN_STEP_STATUSES.join(", ")}.`);
  return { planId: value.planId, stepId: value.stepId, status: value.status };
}

/** Whether an update moves a step the way a plan allows: a finished step stays finished. */
export function planStepMove(from: PlanStepStatus, to: PlanStepStatus) {
  if ((from === "done" || from === "skipped") && from !== to) return "This step is already finished.";
  return null;
}
