// COSGRAL W6-BE3: the plan card (spec-w6.md 1C, W17-W22; decisions Q8, Q9).
//
// The agent proposes a plan with `propose_plan` and waits. The person has two answers: approve or reject (no editing, Q9).
// After "approve" the agent works through the steps and reports each with `update_plan`; the plan is done when every step
// is done or skipped. A card that is not answered closes with its turn ("expired"): nothing counts as approved. Plans are
// saved on every change, so they are still there after a restart; a plan that was open at a restart is closed then.

import {
  type AgentEvent,
  type AgentPlan,
  type ListPlansInput,
  newPlanSteps,
  type PendingAgentPlan,
  PLAN_LIMITS,
  type PlanDecision,
  type PlanPhase,
  parsePlanUpdate,
  planIsOpen,
  planProblem,
  planProgress,
  planStepMove,
  type RespondToPlanInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { CardContext } from "./action-cards";
import type { PlanStore } from "./plan-store";
import type { DynamicToolResult } from "./protocol";

export interface PlanCardsOptions {
  emit: (event: AgentEvent) => void;
  /** Creation time and order shared with the other cards. */
  order: () => { createdAt: string; sequence: number };
  store: PlanStore;
  now: () => string;
  newId: () => string;
}

interface OpenPlan {
  plan: AgentPlan;
  sequence: number;
  providerThreadId: string;
  /** Set while the card waits for the person; the agent's `propose_plan` call is answered with it. */
  resolve: ((result: DynamicToolResult) => void) | null;
}

const INSTRUCTIONS: Record<"approve" | "reject" | "expired", string> = {
  approve:
    "The user approved this plan. Work through the steps in order and report each one with cosgral_cards.update_plan (planId, stepId, status: in-progress, done or skipped). Do not do anything the plan does not list; propose a new plan for that.",
  reject:
    "The user rejected this plan. Do none of the steps. Ask what they want instead, or propose a different plan only if they ask for one.",
  expired: "The card closed before the user decided. Nothing is approved; do none of the steps.",
};

export class PlanCards {
  readonly #options: PlanCardsOptions;
  readonly #open = new Map<string, OpenPlan>();

  constructor(options: PlanCardsOptions) {
    this.#options = options;
  }

  /** `propose_plan`: waits until the person answers or the turn ends. */
  propose(context: CardContext, args: DynamicRecord): Promise<DynamicToolResult> {
    const steps = args.steps;
    const problem = planProblem(steps);
    if (problem) throw new Error(problem);
    const title = optionalText(args, "title", PLAN_LIMITS.title) ?? "Plan";
    const summary = optionalText(args, "summary", PLAN_LIMITS.summary);
    const openHere = [...this.#open.values()].find(
      (open) => open.plan.botId === context.botId && open.plan.threadId === context.threadId,
    );
    if (openHere) {
      throw new Error(
        openHere.plan.phase === "proposed"
          ? "A plan is already open in this thread and waits for the user. Wait for the answer."
          : "A plan is already open in this thread. Finish it with update_plan before you propose another.",
      );
    }
    const { createdAt, sequence } = this.#options.order();
    const plan: AgentPlan = {
      requestId: `plan-${this.#options.newId()}`,
      botId: context.botId,
      threadId: context.threadId,
      turnId: context.turnId,
      title: title.trim(),
      summary: summary?.trim() ? summary.trim() : null,
      steps: newPlanSteps(readSteps(steps)),
      phase: "proposed",
      createdAt,
      decidedAt: null,
      updatedAt: createdAt,
    };
    // Saved before the card opens: when the store refuses, nothing is shown.
    this.#options.store.save(plan);
    return new Promise((resolve) => {
      this.#open.set(plan.requestId, { plan, sequence, providerThreadId: context.providerThreadId, resolve });
      this.#emit(plan);
    });
  }

  /** `update_plan`: the agent reports a step of an approved plan. */
  update(context: CardContext, args: DynamicRecord): DynamicToolResult {
    const input = parsePlanUpdate(args);
    const open = this.#open.get(input.planId);
    const stored = open?.plan ?? this.#options.store.get(input.planId);
    if (!stored || stored.botId !== context.botId)
      throw new Error("There is no such plan. Use the planId from propose_plan.");
    if (stored.phase !== "approved") {
      throw new Error(
        stored.phase === "proposed"
          ? "This plan is not approved yet: do not run it."
          : `This plan is not approved or no longer running (${stored.phase}): do not run it.`,
      );
    }
    const step = stored.steps.find((candidate) => candidate.id === input.stepId);
    if (!step) throw new Error("There is no such step in this plan.");
    const refused = planStepMove(step.status, input.status);
    if (refused) throw new Error(refused);
    step.status = input.status;
    const finished = stored.steps.every((candidate) => candidate.status === "done" || candidate.status === "skipped");
    this.#setPhase(stored, finished ? "completed" : "approved");
    if (finished) this.#open.delete(stored.requestId);
    const progress = planProgress(stored);
    return textResult({
      planId: stored.requestId,
      phase: stored.phase,
      finished: progress.finished,
      total: progress.total,
      ...(progress.current ? { current: progress.current.id } : {}),
    });
  }

  /** The person's answer. Throws when the card is no longer open. Answers with the plan as it is now. */
  respond(input: RespondToPlanInput): AgentPlan {
    const open = this.#open.get(input.requestId);
    if (open?.plan.phase !== "proposed") throw new Error("This card is already decided or no longer open.");
    const decision: PlanDecision = input.decision;
    open.plan.decidedAt = this.#options.now();
    this.#setPhase(open.plan, decision === "approve" ? "approved" : "rejected");
    if (decision === "reject") this.#open.delete(input.requestId);
    const resolve = open.resolve;
    open.resolve = null;
    resolve?.(
      textResult({
        decision,
        planId: open.plan.requestId,
        steps: open.plan.steps.map((step) => ({ id: step.id, title: step.title })),
        instruction: INSTRUCTIONS[decision],
      }),
    );
    return structuredClone(open.plan);
  }

  list(input: ListPlansInput & { threadId: string }): AgentPlan[] {
    return this.#options.store
      .list(input.botId, input.threadId)
      .map((plan) => this.#open.get(plan.requestId)?.plan ?? plan);
  }

  listPending(): Array<{ sequence: number; request: PendingAgentPlan }> {
    return [...this.#open.values()]
      .filter((open) => open.plan.phase === "proposed")
      .map((open) => ({
        sequence: open.sequence,
        request: { kind: "plan" as const, plan: structuredClone(open.plan) },
      }));
  }

  /** COSGRAL W6-BE4: the cards of plans that wait in this CLI thread (a subagent's cards). */
  requestIdsFor(providerThreadId: string): string[] {
    return [...this.#open.values()]
      .filter((open) => open.providerThreadId === providerThreadId && open.plan.phase === "proposed")
      .map((open) => open.plan.requestId);
  }

  pendingCount(botId: string): number {
    let count = 0;
    for (const open of this.#open.values()) if (open.plan.botId === botId && open.plan.phase === "proposed") count += 1;
    return count;
  }

  /** The turn ended or stopped: its proposed card expires and its approved plan stops. Nothing counts as approved. */
  expireTurn(providerThreadId: string, turnId: string): void {
    for (const open of [...this.#open.values()]) {
      if (open.providerThreadId === providerThreadId && open.plan.turnId === turnId) this.#close(open);
    }
  }

  expireAll(): void {
    for (const open of [...this.#open.values()]) this.#close(open);
  }

  /** The thread is gone: its open plans close, then every plan of the thread is forgotten. */
  forgetThread(botId: string, threadId: string): void {
    for (const open of [...this.#open.values()]) {
      if (open.plan.botId === botId && open.plan.threadId === threadId) this.#close(open);
    }
    this.#options.store.deleteThread(botId, threadId);
  }

  /** After a restart no agent is waiting any more: a plan that was open closes (proposed expires, approved stops). */
  recover(): void {
    for (const plan of this.#options.store.listOpen()) {
      if (this.#open.has(plan.requestId)) continue;
      this.#setPhase(plan, plan.phase === "proposed" ? "expired" : "stopped");
    }
  }

  #close(open: OpenPlan): void {
    this.#open.delete(open.plan.requestId);
    if (!planIsOpen(open.plan)) return;
    const wasProposed = open.plan.phase === "proposed";
    this.#setPhase(open.plan, wasProposed ? "expired" : "stopped");
    const resolve = open.resolve;
    open.resolve = null;
    resolve?.(textResult({ decision: "expired", planId: open.plan.requestId, instruction: INSTRUCTIONS.expired }));
  }

  #setPhase(plan: AgentPlan, phase: PlanPhase): void {
    plan.phase = phase;
    plan.updatedAt = this.#options.now();
    this.#options.store.save(plan);
    this.#emit(plan);
  }

  #emit(plan: AgentPlan): void {
    this.#options.emit({ type: "plan-changed", plan: structuredClone(plan) });
  }
}

function readSteps(value: unknown): Array<{ title: string; detail?: string | null }> {
  if (!Array.isArray(value)) return [];
  return value.map((step) => ({
    title: String(step.title),
    detail: isString(step.detail) ? step.detail : null,
  }));
}

/** A string argument, or null when it is missing or blank. */
function optionalText(args: DynamicRecord, key: string, limit: number): string | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (!isString(value)) throw new Error(`${key} must be text.`);
  if (value.length > limit) throw new Error(`${key} has at most ${limit} characters.`);
  return value.trim() ? value : null;
}

function textResult(value: unknown): DynamicToolResult {
  return { success: true, contentItems: [{ type: "inputText", text: JSON.stringify(value) }] };
}
