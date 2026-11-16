// @vitest-environment node
// COSGRAL W6-BE3: the plan card on the engine side (spec-w6.md 1C, W17-W22; Q8, Q9). The agent proposes a plan with
// `propose_plan` and waits; the person approves or rejects; the agent reports steps with `update_plan`; a card that is
// not answered expires and nothing counts as approved.

import type { AgentEvent, AgentPlan, KeptDraft } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { describe, expect, it } from "vitest";
import { ActionCards, type CardContext } from "./action-cards";
import type { KeptDraftStore } from "./draft-store";
import type { PlanStore } from "./plan-store";
import type { DynamicToolCallParams, DynamicToolResult } from "./protocol";

class MemoryPlans implements PlanStore {
  readonly rows = new Map<string, AgentPlan>();
  save(plan: AgentPlan): void {
    this.rows.set(plan.requestId, structuredClone(plan));
  }
  get(requestId: string): AgentPlan | null {
    const plan = this.rows.get(requestId);
    return plan ? structuredClone(plan) : null;
  }
  list(botId: string, threadId: string): AgentPlan[] {
    return [...this.rows.values()]
      .filter((plan) => plan.botId === botId && plan.threadId === threadId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((plan) => structuredClone(plan));
  }
  listOpen(): AgentPlan[] {
    return [...this.rows.values()]
      .filter((plan) => plan.phase === "proposed" || plan.phase === "approved")
      .map((plan) => structuredClone(plan));
  }
  deleteThread(botId: string, threadId: string): void {
    for (const [id, plan] of this.rows) if (plan.botId === botId && plan.threadId === threadId) this.rows.delete(id);
  }
  pruneBots(botIds: string[]): boolean {
    let removed = false;
    for (const [id, plan] of this.rows) {
      if (!botIds.includes(plan.botId)) {
        this.rows.delete(id);
        removed = true;
      }
    }
    return removed;
  }
}

class MemoryDrafts implements KeptDraftStore {
  list(): KeptDraft[] {
    return [];
  }
  get(): KeptDraft | null {
    return null;
  }
  save(): void {}
  delete(): boolean {
    return false;
  }
}

const context: CardContext = {
  botId: "chief",
  threadId: "public-thread",
  providerThreadId: "raw-thread",
  turnId: "turn",
};

function setup() {
  const events: AgentEvent[] = [];
  const plans = new MemoryPlans();
  let sequence = 0;
  let id = 0;
  const cards = new ActionCards({
    emit: (event) => events.push(event),
    order: () => ({ createdAt: `2026-11-16T00:00:0${sequence}Z`, sequence: ++sequence }),
    drafts: new MemoryDrafts(),
    plans,
    newId: () => `id${++id}`,
  });
  return { cards, events, plans };
}

function call(tool: string, args: unknown, turnId = "turn"): DynamicToolCallParams {
  return { threadId: "raw-thread", turnId, callId: `${tool}-call`, namespace: "cosgral_cards", tool, arguments: args };
}

function payload(result: DynamicToolResult): DynamicRecord {
  const item = result.contentItems[0];
  if (item?.type !== "inputText") throw new Error("Expected a text result.");
  try {
    const value = JSON.parse(item.text);
    if (isDynamicRecord(value)) return value;
  } catch {
    // A refusal is plain text.
  }
  return { text: item.text };
}

const twoSteps = [{ title: "Read the file" }, { title: "Write the new file", detail: "keep a backup" }];

function planOf(cards: ActionCards) {
  const pending = cards.listPending().find((entry) => entry.request.kind === "plan")?.request;
  if (pending?.kind !== "plan") throw new Error("No open plan card.");
  return pending.plan;
}

describe("plan cards (engine)", () => {
  it("propose_plan opens a card in Needs you and waits for the person", async () => {
    const { cards, events } = setup();
    const waiting = cards.handleDynamicTool(
      call("propose_plan", { title: "Migrate", summary: "Two steps", steps: twoSteps }),
      context,
    );
    const plan = planOf(cards);
    expect(plan).toMatchObject({
      botId: "chief",
      threadId: "public-thread",
      turnId: "turn",
      title: "Migrate",
      summary: "Two steps",
      phase: "proposed",
    });
    expect(plan.steps.map((step) => [step.id, step.status])).toEqual([
      ["s1", "pending"],
      ["s2", "pending"],
    ]);
    expect(cards.pendingCount("chief")).toBe(1);
    expect(events.map((event) => event.type)).toEqual(["plan-changed"]);

    await cards.respondToPlan({ requestId: plan.requestId, decision: "approve" });
    const result = payload(await waiting);
    expect(result).toMatchObject({ decision: "approve", planId: plan.requestId });
    expect(String(result.instruction)).toMatch(/update_plan/);
    expect(cards.pendingCount("chief")).toBe(0);
  });

  it("refuses an empty plan: no card is created (W22)", async () => {
    const { cards, plans } = setup();
    const result = await cards.handleDynamicTool(call("propose_plan", { title: "Nothing", steps: [] }), context);
    expect(result.success).toBe(false);
    expect(payload(result).text).toMatch(/at least one step/);
    expect(cards.listPending()).toEqual([]);
    expect(plans.rows.size).toBe(0);
  });

  it("refuses a plan with a blank step and a plan with too many steps", async () => {
    const { cards } = setup();
    const blank = await cards.handleDynamicTool(call("propose_plan", { steps: [{ title: " " }] }), context);
    expect(blank.success).toBe(false);
    const many = await cards.handleDynamicTool(
      call("propose_plan", { steps: Array.from({ length: 21 }, (_, index) => ({ title: `s${index}` })) }),
      context,
    );
    expect(many.success).toBe(false);
    expect(cards.listPending()).toEqual([]);
  });

  it("reject keeps the plan and tells the agent to do none of the steps (Q9)", async () => {
    const { cards, plans } = setup();
    const waiting = cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const { requestId } = planOf(cards);
    const answer = await cards.respondToPlan({ requestId, decision: "reject" });
    expect(answer.phase).toBe("rejected");
    const result = payload(await waiting);
    expect(result.decision).toBe("reject");
    expect(String(result.instruction)).toMatch(/none of the steps/i);
    expect(plans.get(requestId)?.phase).toBe("rejected");
    expect(plans.get(requestId)?.decidedAt).not.toBeNull();
    const update = await cards.handleDynamicTool(
      call("update_plan", { planId: requestId, stepId: "s1", status: "in-progress" }),
      context,
    );
    expect(update.success).toBe(false);
    expect(payload(update).text).toMatch(/not approved/);
  });

  it("answers a card only once and refuses unknown or invalid answers", async () => {
    const { cards } = setup();
    void cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const { requestId } = planOf(cards);
    await cards.respondToPlan({ requestId, decision: "approve" });
    await expect(cards.respondToPlan({ requestId, decision: "reject" })).rejects.toThrow(/already decided/);
    await expect(cards.respondToPlan({ requestId: "nope", decision: "approve" })).rejects.toThrow(/already decided/);
  });

  it("update_plan moves steps of an approved plan and completes it (W18-W19)", async () => {
    const { cards, events, plans } = setup();
    void cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const { requestId } = planOf(cards);
    await cards.respondToPlan({ requestId, decision: "approve" });

    const first = await cards.handleDynamicTool(
      call("update_plan", { planId: requestId, stepId: "s1", status: "in-progress" }),
      context,
    );
    expect(first.success).toBe(true);
    expect(payload(first)).toMatchObject({ finished: 0, total: 2, phase: "approved" });
    await cards.handleDynamicTool(call("update_plan", { planId: requestId, stepId: "s1", status: "done" }), context);

    const back = await cards.handleDynamicTool(
      call("update_plan", { planId: requestId, stepId: "s1", status: "pending" }),
      context,
    );
    expect(back.success).toBe(false);
    expect(payload(back).text).toMatch(/already finished/);

    const last = await cards.handleDynamicTool(
      call("update_plan", { planId: requestId, stepId: "s2", status: "skipped" }),
      context,
    );
    expect(payload(last)).toMatchObject({ finished: 2, total: 2, phase: "completed" });
    expect(plans.get(requestId)?.phase).toBe("completed");
    expect(events.filter((event) => event.type === "plan-changed").length).toBeGreaterThanOrEqual(5);
  });

  it("update_plan refuses an unknown plan, an unknown step, another agent's plan and a bad status", async () => {
    const { cards } = setup();
    void cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const { requestId } = planOf(cards);
    await cards.respondToPlan({ requestId, decision: "approve" });
    const unknownPlan = await cards.handleDynamicTool(
      call("update_plan", { planId: "nope", stepId: "s1", status: "done" }),
      context,
    );
    expect(payload(unknownPlan).text).toMatch(/no such plan/i);
    const unknownStep = await cards.handleDynamicTool(
      call("update_plan", { planId: requestId, stepId: "s9", status: "done" }),
      context,
    );
    expect(payload(unknownStep).text).toMatch(/no such step/i);
    const stranger = await cards.handleDynamicTool(
      call("update_plan", { planId: requestId, stepId: "s1", status: "done" }),
      { ...context, botId: "other" },
    );
    expect(payload(stranger).text).toMatch(/no such plan/i);
    const bad = await cards.handleDynamicTool(
      call("update_plan", { planId: requestId, stepId: "s1", status: "almost" }),
      context,
    );
    expect(bad.success).toBe(false);
  });

  it("allows one open plan per thread", async () => {
    const { cards } = setup();
    void cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const second = await cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    expect(second.success).toBe(false);
    expect(payload(second).text).toMatch(/already open/);
    const other = { ...context, threadId: "another-thread", providerThreadId: "raw-2" };
    void cards.handleDynamicTool({ ...call("propose_plan", { steps: twoSteps }), threadId: "raw-2" }, other);
    expect(cards.pendingCount("chief")).toBe(2);
  });

  it("a card that is not answered expires with its turn: nothing is approved by silence", async () => {
    const { cards, plans } = setup();
    const waiting = cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const { requestId } = planOf(cards);
    cards.expireTurn("raw-thread", "turn");
    const result = payload(await waiting);
    expect(result.decision).toBe("expired");
    expect(String(result.instruction)).toMatch(/nothing is approved/i);
    expect(plans.get(requestId)?.phase).toBe("expired");
    expect(cards.listPending()).toEqual([]);
  });

  it("an approved plan whose turn ends before it is done is stopped, and a finished plan stays completed", async () => {
    const { cards, plans } = setup();
    void cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const first = planOf(cards).requestId;
    await cards.respondToPlan({ requestId: first, decision: "approve" });
    cards.expireTurn("raw-thread", "turn");
    expect(plans.get(first)?.phase).toBe("stopped");

    void cards.handleDynamicTool(call("propose_plan", { steps: [{ title: "Only" }] }, "turn-2"), {
      ...context,
      turnId: "turn-2",
    });
    const second = planOf(cards).requestId;
    await cards.respondToPlan({ requestId: second, decision: "approve" });
    await cards.handleDynamicTool(call("update_plan", { planId: second, stepId: "s1", status: "done" }, "turn-2"), {
      ...context,
      turnId: "turn-2",
    });
    cards.expireTurn("raw-thread", "turn-2");
    expect(plans.get(second)?.phase).toBe("completed");
  });

  it("expireAll closes every open plan (the program is closing)", async () => {
    const { cards, plans } = setup();
    const waiting = cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const { requestId } = planOf(cards);
    cards.expireAll();
    expect(payload(await waiting).decision).toBe("expired");
    expect(plans.get(requestId)?.phase).toBe("expired");
  });

  it("after a restart an open plan from the store is closed: proposed expires, approved stops", async () => {
    const { cards, plans, events } = setup();
    const proposed: AgentPlan = {
      requestId: "old-1",
      botId: "chief",
      threadId: "public-thread",
      turnId: "t",
      title: "Old",
      summary: null,
      steps: [{ id: "s1", title: "x", detail: null, status: "pending" }],
      phase: "proposed",
      createdAt: "2026-11-15T00:00:00Z",
      decidedAt: null,
      updatedAt: "2026-11-15T00:00:00Z",
    };
    plans.save(proposed);
    plans.save({ ...proposed, requestId: "old-2", phase: "approved", decidedAt: "2026-11-15T00:00:01Z" });
    cards.recoverPlans();
    expect(plans.get("old-1")?.phase).toBe("expired");
    expect(plans.get("old-2")?.phase).toBe("stopped");
    expect(events.filter((event) => event.type === "plan-changed")).toHaveLength(2);
    expect(cards.listPending()).toEqual([]);
  });

  it("lists the plans of a thread, with their progress, also after they ended", async () => {
    const { cards } = setup();
    void cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const { requestId } = planOf(cards);
    await cards.respondToPlan({ requestId, decision: "reject" });
    const listed = cards.listPlans({ botId: "chief", threadId: "public-thread" });
    expect(listed.map((plan) => [plan.requestId, plan.phase])).toEqual([[requestId, "rejected"]]);
    expect(cards.listPlans({ botId: "chief", threadId: "elsewhere" })).toEqual([]);
  });

  it("forgets the plans of a deleted thread", async () => {
    const { cards, plans } = setup();
    void cards.handleDynamicTool(call("propose_plan", { steps: twoSteps }), context);
    const { requestId } = planOf(cards);
    await cards.respondToPlan({ requestId, decision: "reject" });
    cards.forgetThreadPlans("chief", "public-thread");
    expect(plans.rows.size).toBe(0);
  });
});
