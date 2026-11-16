import type { AgentEvent } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockPlans } from "./mock-plans";

const steps = [{ title: "Read the file" }, { title: "Write the new file" }];

function setup() {
  const events: AgentEvent[] = [];
  const plans = createMockPlans((event) => events.push(event));
  return { events, plans };
}

describe("mock plans", () => {
  it("shows a proposed plan as a card in Needs you and announces it", () => {
    const { events, plans } = setup();
    const plan = plans.propose({ botId: "b", threadId: "t", title: "Migrate", steps });
    expect(plan.phase).toBe("proposed");
    expect(plan.steps.map((step) => step.status)).toEqual(["pending", "pending"]);
    expect(plans.pendingRequests()).toEqual([{ kind: "plan", plan }]);
    expect(events.map((event) => event.type)).toEqual(["plan-changed"]);
  });

  it("refuses an empty plan (W22)", () => {
    expect(() => setup().plans.propose({ botId: "b", threadId: "t", steps: [] })).toThrow(/at least one step/);
  });

  it("approve leaves the Needs you list and lets the agent report steps until it completes", async () => {
    const { plans } = setup();
    const { requestId } = plans.propose({ botId: "b", threadId: "t", steps });
    expect((await plans.respond({ requestId, decision: "approve" })).phase).toBe("approved");
    expect(plans.pendingRequests()).toEqual([]);
    plans.advance(requestId, "s1", "in-progress");
    plans.advance(requestId, "s1", "done");
    expect(() => plans.advance(requestId, "s1", "pending")).toThrow(/already finished/);
    const done = plans.advance(requestId, "s2", "skipped");
    expect(done.phase).toBe("completed");
  });

  it("reject keeps the plan and runs nothing", async () => {
    const { plans } = setup();
    const { requestId } = plans.propose({ botId: "b", threadId: "t", steps });
    expect((await plans.respond({ requestId, decision: "reject" })).phase).toBe("rejected");
    expect(() => plans.advance(requestId, "s1", "in-progress")).toThrow(/not approved/);
  });

  it("answers a card only once", async () => {
    const { plans } = setup();
    const { requestId } = plans.propose({ botId: "b", threadId: "t", steps });
    await plans.respond({ requestId, decision: "approve" });
    await expect(plans.respond({ requestId, decision: "reject" })).rejects.toThrow(/already decided/);
    await expect(plans.respond({ requestId: "nope", decision: "approve" })).rejects.toThrow();
  });

  it("a card that is not answered expires: nothing is approved by silence", () => {
    const { plans } = setup();
    const { requestId } = plans.propose({ botId: "b", threadId: "t", steps });
    expect(plans.stop(requestId).phase).toBe("expired");
    expect(plans.pendingRequests()).toEqual([]);
  });

  it("stopping an approved plan ends it as stopped, and ending twice changes nothing", async () => {
    const { events, plans } = setup();
    const { requestId } = plans.propose({ botId: "b", threadId: "t", steps });
    await plans.respond({ requestId, decision: "approve" });
    expect(plans.stop(requestId).phase).toBe("stopped");
    const count = events.length;
    expect(plans.stop(requestId).phase).toBe("stopped");
    expect(events).toHaveLength(count);
  });

  it("lists the plans of one thread, newest first", async () => {
    const { plans } = setup();
    const first = plans.propose({ botId: "b", threadId: "t1", steps });
    const second = plans.propose({ botId: "b", threadId: "t1", steps });
    plans.propose({ botId: "b", threadId: "t2", steps });
    const listed = await plans.list({ botId: "b", threadId: "t1" });
    expect(listed.map((plan) => plan.requestId)).toEqual([second.requestId, first.requestId]);
  });
});
