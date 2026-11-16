import { describe, expect, it } from "vitest";
import {
  type AgentPlan,
  IPC_CHANNELS,
  isAgentPlan,
  isAgentPlanList,
  isPendingAgentRequest,
  isPlanChanged,
  newPlanSteps,
  PLAN_LIMITS,
  parseListPlansInput,
  parsePlanUpdate,
  parseRespondToPlanInput,
  planIsOpen,
  planProblem,
  planProgress,
  planRequired,
  planStepMove,
} from "./ipc";
import { isAgentEvent } from "./ipc-conversation";

const plan: AgentPlan = {
  requestId: "plan-1",
  botId: "bot-1",
  threadId: "thread-1",
  turnId: "turn-1",
  title: "Migrate the config",
  summary: null,
  steps: newPlanSteps([{ title: "Read the file" }, { title: "Write the new file", detail: "  keep a backup " }]),
  phase: "proposed",
  createdAt: "2026-11-16T12:00:00.000Z",
  decidedAt: null,
  updatedAt: "2026-11-16T12:00:00.000Z",
};

describe("plan contract (W17-W22)", () => {
  it("refuses an empty plan and a plan that is too long (W22)", () => {
    expect(planProblem([])).toMatch(/at least one step/);
    expect(planProblem(undefined)).toMatch(/at least one step/);
    expect(planProblem(Array.from({ length: PLAN_LIMITS.steps + 1 }, () => ({ title: "x" })))).toMatch(/at most/);
    expect(planProblem(Array.from({ length: PLAN_LIMITS.steps }, () => ({ title: "x" })))).toBeNull();
  });

  it("refuses a step without a title or with text that is too long", () => {
    expect(planProblem([{ title: "  " }])).toMatch(/Step 1 needs a title/);
    expect(planProblem([{ title: "ok" }, { detail: "x" }])).toMatch(/Step 2 needs a title/);
    expect(planProblem([{ title: "x".repeat(PLAN_LIMITS.stepTitle + 1) }])).toMatch(/title of step 1/);
    expect(planProblem([{ title: "ok", detail: "x".repeat(PLAN_LIMITS.stepDetail + 1) }])).toMatch(
      /description of step 1/,
    );
    expect(planProblem([{ title: "ok", detail: 4 }])).toMatch(/must be text/);
    expect(planProblem([{ title: "ok", detail: null }])).toBeNull();
  });

  it("gives the steps stable ids, trimmed text and the status pending", () => {
    expect(plan.steps).toEqual([
      { id: "s1", title: "Read the file", detail: null, status: "pending" },
      { id: "s2", title: "Write the new file", detail: "keep a backup", status: "pending" },
    ]);
  });

  it("requires a plan from 3 steps, or from 2 steps when one has an effect (Q8)", () => {
    expect(planRequired({ stepCount: 1, effectfulSteps: 1 })).toBe(false);
    expect(planRequired({ stepCount: 2, effectfulSteps: 0 })).toBe(false);
    expect(planRequired({ stepCount: 2, effectfulSteps: 1 })).toBe(true);
    expect(planRequired({ stepCount: 3, effectfulSteps: 0 })).toBe(true);
  });

  it("counts progress: done and skipped are finished", () => {
    const steps = newPlanSteps([{ title: "a" }, { title: "b" }, { title: "c" }]);
    steps[0].status = "done";
    steps[1].status = "in-progress";
    expect(planProgress({ steps })).toEqual({ finished: 1, total: 3, current: steps[1] });
    steps[1].status = "skipped";
    expect(planProgress({ steps })).toEqual({ finished: 2, total: 3, current: null });
  });

  it("keeps a finished step finished", () => {
    expect(planStepMove("done", "pending")).toMatch(/already finished/);
    expect(planStepMove("skipped", "in-progress")).toMatch(/already finished/);
    expect(planStepMove("done", "done")).toBeNull();
    expect(planStepMove("pending", "done")).toBeNull();
    expect(planStepMove("in-progress", "skipped")).toBeNull();
  });

  it("knows which plans are open", () => {
    expect(planIsOpen({ phase: "proposed" })).toBe(true);
    expect(planIsOpen({ phase: "approved" })).toBe(true);
    for (const phase of ["rejected", "expired", "stopped", "completed"] as const) {
      expect(planIsOpen({ phase })).toBe(false);
    }
  });

  it("accepts only approve or reject (Q9: no editing)", () => {
    expect(parseRespondToPlanInput({ requestId: "plan-1", decision: "approve" })).toEqual({
      requestId: "plan-1",
      decision: "approve",
    });
    expect(parseRespondToPlanInput({ requestId: "plan-1", decision: "reject" }).decision).toBe("reject");
    expect(() => parseRespondToPlanInput({ requestId: "plan-1", decision: "edit" })).toThrow(/approve/);
    expect(() => parseRespondToPlanInput({ requestId: "plan-1", decision: "approve", steps: [] })).not.toThrow();
    expect(parseRespondToPlanInput({ requestId: "plan-1", decision: "approve", steps: [] })).not.toHaveProperty(
      "steps",
    );
    expect(() => parseRespondToPlanInput({ requestId: "", decision: "approve" })).toThrow();
    expect(() => parseRespondToPlanInput(null)).toThrow();
  });

  it("parses the list input and the agent's update", () => {
    expect(parseListPlansInput({ botId: "bot-1" })).toEqual({ botId: "bot-1", threadId: null });
    expect(parseListPlansInput({ botId: "bot-1", threadId: "t" }).threadId).toBe("t");
    expect(() => parseListPlansInput({ botId: "" })).toThrow();
    expect(() => parseListPlansInput({ botId: "bot-1", threadId: "" })).toThrow();
    expect(parsePlanUpdate({ planId: "plan-1", stepId: "s1", status: "done" })).toEqual({
      planId: "plan-1",
      stepId: "s1",
      status: "done",
    });
    expect(() => parsePlanUpdate({ planId: "plan-1", stepId: "s1", status: "almost" })).toThrow(/status is one of/);
    expect(() => parsePlanUpdate({ stepId: "s1", status: "done" })).toThrow(/planId/);
  });

  it("recognises a plan, the event and the card in Needs you", () => {
    expect(isAgentPlan(plan)).toBe(true);
    expect(isAgentPlan({ ...plan, phase: "maybe" })).toBe(false);
    expect(isAgentPlan({ ...plan, steps: [{ id: "s1" }] })).toBe(false);
    expect(isAgentPlanList([plan, plan])).toBe(true);
    expect(isAgentPlanList([plan, {}])).toBe(false);
    expect(isPlanChanged({ type: "plan-changed", plan })).toBe(true);
    expect(isAgentEvent({ type: "plan-changed", plan })).toBe(true);
    expect(isAgentEvent({ type: "plan-changed", plan: { ...plan, phase: "maybe" } })).toBe(false);
    expect(isPendingAgentRequest({ kind: "plan", plan })).toBe(true);
    expect(isPendingAgentRequest({ kind: "plan", plan: { ...plan, steps: "x" } })).toBe(false);
  });

  it("has channels for the plan", () => {
    expect(IPC_CHANNELS.plansRespond).toBe("plans:respond");
    expect(IPC_CHANNELS.plansList).toBe("plans:list");
  });
});
