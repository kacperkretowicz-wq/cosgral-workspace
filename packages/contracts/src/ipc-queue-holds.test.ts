import { describe, expect, it } from "vitest";
import { QUEUE_HOLD_KINDS, QUEUE_HOLD_REASONS, type QueueHoldFacts, queueHoldOf } from "./ipc-queue-holds";

const calm: QueueHoldFacts = { budget: null, serverBusy: false, restarting: false, threadFull: false, queued: 0 };

describe("why a queue waits (W12 BE-N)", () => {
  it("names four holds", () => {
    expect([...QUEUE_HOLD_KINDS]).toEqual(["budget", "agent-restart", "server-busy", "thread-limit"]);
  });

  it("holds nothing when nothing applies", () => {
    expect(queueHoldOf(calm)).toBeNull();
    expect(queueHoldOf({ ...calm, queued: 3 })).toBeNull();
  });

  it("gives the sentence of a used-up budget as it is", () => {
    expect(queueHoldOf({ ...calm, budget: "The daily budget is used up." })).toEqual({
      kind: "budget",
      reason: "The daily budget is used up.",
    });
  });

  it("shows a restart or a full thread list only while something waits", () => {
    expect(queueHoldOf({ ...calm, restarting: true })).toBeNull();
    expect(queueHoldOf({ ...calm, threadFull: true })).toBeNull();
    expect(queueHoldOf({ ...calm, restarting: true, queued: 1 })?.kind).toBe("agent-restart");
    expect(queueHoldOf({ ...calm, threadFull: true, queued: 1 })).toEqual({
      kind: "thread-limit",
      reason: QUEUE_HOLD_REASONS["thread-limit"],
    });
  });

  it("shows the server limit when the agent waits for a place", () => {
    expect(queueHoldOf({ ...calm, serverBusy: true })).toEqual({
      kind: "server-busy",
      reason: QUEUE_HOLD_REASONS["server-busy"],
    });
  });

  it("picks the hold the person can act on first: budget, restart, server, thread", () => {
    const all: QueueHoldFacts = { budget: "Budget.", serverBusy: true, restarting: true, threadFull: true, queued: 2 };
    expect(queueHoldOf(all)?.kind).toBe("budget");
    expect(queueHoldOf({ ...all, budget: null })?.kind).toBe("agent-restart");
    expect(queueHoldOf({ ...all, budget: null, restarting: false })?.kind).toBe("server-busy");
    expect(queueHoldOf({ ...all, budget: null, restarting: false, serverBusy: false })?.kind).toBe("thread-limit");
  });
});
