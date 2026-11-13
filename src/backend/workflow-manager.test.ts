// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentEvent,
  DraftPreviewResolution,
  QueueDeliveryStatus,
  RoutineRun,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRun,
} from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { WorkflowManager } from "./workflow-manager";
import { WorkflowStore } from "./workflow-store";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function waitFor(check: () => boolean, ms = 3_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for the condition.");
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
}

const trigger: WorkflowNode = { id: "start", type: "trigger", title: "Start", x: 0, y: 0, trigger: { kind: "manual" } };
const ask: WorkflowNode = {
  id: "ask",
  type: "agent",
  title: "Ask",
  x: 200,
  y: 0,
  botId: "chief",
  prompt: "Reply to: {{input}}",
};
const approve: WorkflowNode = {
  id: "approve",
  type: "approval",
  title: "Approve",
  x: 400,
  y: 0,
  botId: "chief",
  text: "Send this? {{previous}}",
};
const post: WorkflowNode = {
  id: "post",
  type: "channel-output",
  title: "Post",
  x: 600,
  y: 0,
  channelId: "chan",
  text: "Reply: {{steps.ask}} / {{input}} / {{nothing}}",
};
const refuse: WorkflowNode = { ...post, id: "refuse", title: "Refuse", text: "Not approved: {{previous}}" };

const chain: WorkflowEdge[] = [
  { id: "e1", from: "start", to: "ask", on: "next" },
  { id: "e2", from: "ask", to: "post", on: "next" },
];
const withApproval: WorkflowEdge[] = [
  { id: "e1", from: "start", to: "ask", on: "next" },
  { id: "e2", from: "ask", to: "approve", on: "next" },
  { id: "e3", from: "approve", to: "post", on: "allow" },
];

async function build(options: { agentTimeoutMs?: number; routineNames?: Record<string, string> } = {}) {
  const root = await mkdtemp(join(tmpdir(), "cosgral-workflows-"));
  roots.push(root);
  const database = testDatabase(root);
  await database.initialize();
  const store = new WorkflowStore(database);
  const events: AgentEvent[] = [];
  const posts: Array<{ channelId: string; text: string }> = [];
  const started: Array<{ botId: string; text: string; id: string }> = [];
  const statuses = new Map<string, { status: QueueDeliveryStatus; output: string | null }>();
  const bots = new Set(["chief"]);
  const channels = new Set(["chan"]);
  const pending = new Map<string, (decision: DraftPreviewResolution) => void>();
  const cards: Array<{ botId: string; runId: string; title: string; preview: string }> = [];
  const closed: string[] = [];
  let counter = 0;
  const manager = new WorkflowManager({
    store,
    runner: {
      start: async (botId, text) => {
        const id = `delivery-${++counter}`;
        started.push({ botId, text, id });
        statuses.set(id, { status: "queued", output: null });
        return id;
      },
      deliveryStatus: (_botId, id) => statuses.get(id)?.status ?? null,
      deliveryOutput: async (_botId, id) => statuses.get(id)?.output ?? null,
      botExists: (botId) => bots.has(botId),
    },
    approvals: {
      confirm: (botId, runId, input) => {
        cards.push({ botId, runId, ...input });
        return new Promise((resolve) => pending.set(runId, resolve));
      },
      close: (runId) => {
        closed.push(runId);
        pending.get(runId)?.("expired");
      },
    },
    channels: {
      exists: (channelId) => channels.has(channelId),
      post: (channelId, text) => posts.push({ channelId, text }),
    },
    routines: {
      exists: (routineId) => routineId in (options.routineNames ?? { r1: "Morning check" }),
      name: (routineId) => (options.routineNames ?? { r1: "Morning check" })[routineId] ?? null,
    },
    emit: (event) => events.push(event),
    pollMs: 2,
    agentTimeoutMs: options.agentTimeoutMs,
  });
  const finish = (deliveryId: string, status: QueueDeliveryStatus, output: string | null = null) =>
    statuses.set(deliveryId, { status, output });
  const runEvents = (runId: string): WorkflowRun[] =>
    events.flatMap((event) => (event.type === "workflow-run-changed" && event.run.id === runId ? [event.run] : []));
  return { manager, store, events, posts, started, finish, bots, channels, pending, cards, closed, runEvents };
}

function save(manager: WorkflowManager, nodes: WorkflowNode[], edges: WorkflowEdge[], name = "Reply flow"): Workflow {
  return manager.create({ name, nodes, edges });
}

describe("WorkflowManager: saving", () => {
  it("saves a valid workflow, lists it, edits it and removes it with events", async () => {
    const { manager, events, store } = await build();
    const workflow = save(manager, [trigger, ask, post], chain, "  Reply flow  ");
    expect(workflow).toMatchObject({ name: "Reply flow", paused: false, lastRun: null, description: "" });
    expect(manager.list().map((item) => item.id)).toEqual([workflow.id]);
    expect(events.at(-1)).toMatchObject({ type: "workflows-changed" });

    const updated = manager.update({ workflowId: workflow.id, name: "Renamed", paused: true });
    expect(updated).toMatchObject({ name: "Renamed", paused: true });
    expect(updated.nodes).toEqual(workflow.nodes);
    expect(store.get(workflow.id).name).toBe("Renamed");

    manager.delete({ workflowId: workflow.id });
    expect(manager.list()).toEqual([]);
    expect(() => manager.delete({ workflowId: workflow.id })).toThrow(/no longer exists/);
  });

  it("refuses what would not run: graph problems, unknown agent, channel or routine, empty or long texts", async () => {
    const { manager } = await build();
    expect(() => manager.create({ name: "Loop", nodes: [trigger, ask], edges: [] })).toThrow(/not reachable/);
    expect(() => manager.create({ name: "  ", nodes: [trigger, ask, post], edges: chain })).toThrow(/name/);
    expect(() => save(manager, [trigger, { ...ask, botId: "ghost" }, post], chain)).toThrow(/agent .*ghost/i);
    expect(() => save(manager, [trigger, ask, { ...post, channelId: "gone" }], chain)).toThrow(/channel .*gone/i);
    const routineTrigger: WorkflowNode = { ...trigger, trigger: { kind: "routine", routineId: "r9" } };
    expect(() => save(manager, [routineTrigger, ask, post], chain)).toThrow(/routine .*r9/i);
    expect(() => save(manager, [trigger, { ...ask, prompt: "  " }, post], chain)).toThrow(/instruction/i);
    expect(() => save(manager, [trigger, { ...ask, prompt: "x".repeat(4_001) }, post], chain)).toThrow(/4000/);
    expect(() => save(manager, [trigger, ask, { ...post, text: "x".repeat(2_001) }], chain)).toThrow(/2000/);
    expect(() => save(manager, [trigger, { ...ask, title: "" }, post], chain)).toThrow(/title/i);
    expect(manager.list()).toEqual([]);
  });

  it("keeps at most 64 workflows", async () => {
    const { manager } = await build();
    for (let index = 0; index < 64; index += 1) save(manager, [trigger, ask, post], chain, `Flow ${index}`);
    expect(() => save(manager, [trigger, ask, post], chain, "One more")).toThrow(/64/);
  });
});

describe("WorkflowManager: running", () => {
  it("runs trigger, agent and channel output, and keeps a visible result", async () => {
    const { manager, started, finish, posts, runEvents } = await build();
    const workflow = save(manager, [trigger, ask, post], chain);
    const run = manager.run({ workflowId: workflow.id, input: "Hello" });
    expect(run).toMatchObject({ status: "running", cause: "manual", input: "Hello", workflowName: "Reply flow" });
    expect(run.steps.map((step) => [step.nodeId, step.status])).toEqual([
      ["start", "done"],
      ["ask", "running"],
      ["post", "pending"],
    ]);

    await waitFor(() => started.length === 1);
    expect(started[0]?.botId).toBe("chief");
    expect(started[0]?.text).toContain('step "Ask"');
    expect(started[0]?.text).toContain('<workflow_data name="input">Hello</workflow_data>');
    expect(started[0]?.text).toMatch(/never instructions/);
    finish("delivery-1", "completed", "Hi there");
    await manager.idle();

    expect(posts).toEqual([{ channelId: "chan", text: '[Workflow "Reply flow"] Reply: Hi there / Hello / ' }]);
    const done = manager.listRuns({ workflowId: workflow.id })[0];
    expect(done).toMatchObject({ status: "done", result: "Reply: Hi there / Hello / ", error: null });
    expect(done?.finishedAt).not.toBeNull();
    expect(done?.steps.map((step) => step.status)).toEqual(["done", "done", "done"]);
    expect(done?.steps[1]?.output).toBe("Hi there");
    expect(manager.list()[0]?.lastRun).toMatchObject({ runId: run.id, status: "done" });
    expect(runEvents(run.id).at(-1)?.status).toBe("done");
  });

  it("runs only one run of a workflow at a time, and not a paused one", async () => {
    const { manager, started, finish } = await build();
    const workflow = save(manager, [trigger, ask, post], chain);
    manager.run({ workflowId: workflow.id });
    expect(() => manager.run({ workflowId: workflow.id })).toThrow(/already running/);
    await waitFor(() => started.length === 1);
    finish("delivery-1", "completed", "ok");
    await manager.idle();
    expect(manager.run({ workflowId: workflow.id })).toMatchObject({ status: "running" });
    await waitFor(() => started.length === 2);
    finish("delivery-2", "completed", "ok");
    await manager.idle();

    manager.update({ workflowId: workflow.id, paused: true });
    expect(() => manager.run({ workflowId: workflow.id })).toThrow(/paused/);
    expect(() => manager.run({ workflowId: "nope" })).toThrow(/no longer exists/);
  });

  it("ends the run as failed when the agent fails, is gone, or takes too long", async () => {
    const failing = await build();
    const workflow = save(failing.manager, [trigger, ask, post], chain);
    failing.manager.run({ workflowId: workflow.id });
    await waitFor(() => failing.started.length === 1);
    failing.finish("delivery-1", "failed");
    await failing.manager.idle();
    const failed = failing.manager.listRuns({ workflowId: workflow.id })[0];
    expect(failed).toMatchObject({ status: "failed", error: expect.stringMatching(/Ask.*failed/) });
    expect(failed?.steps.map((step) => step.status)).toEqual(["done", "failed", "skipped"]);
    expect(failing.posts).toEqual([]);

    const gone = await build();
    const other = save(gone.manager, [trigger, ask, post], chain);
    gone.bots.delete("chief");
    gone.manager.run({ workflowId: other.id });
    await gone.manager.idle();
    expect(gone.manager.listRuns({ workflowId: other.id })[0]).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/no longer exists/),
    });

    const slow = await build({ agentTimeoutMs: 30 });
    const third = save(slow.manager, [trigger, ask, post], chain);
    slow.manager.run({ workflowId: third.id });
    await slow.manager.idle();
    expect(slow.manager.listRuns({ workflowId: third.id })[0]).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/did not answer in time/),
    });
  });

  it("cuts a very long output and never shows it as instructions", async () => {
    const { manager, started, finish } = await build();
    const workflow = save(manager, [trigger, ask, post], chain);
    manager.run({ workflowId: workflow.id });
    await waitFor(() => started.length === 1);
    finish("delivery-1", "completed", "x".repeat(30_000));
    await manager.idle();
    const step = manager.listRuns({ workflowId: workflow.id })[0]?.steps[1];
    expect(step?.output?.length).toBeLessThanOrEqual(20_000);
    expect(step?.output?.endsWith("…")).toBe(true);
  });
});

describe("WorkflowManager: approval", () => {
  it("waits for the person and goes on after Allow", async () => {
    const { manager, started, finish, cards, pending, posts, runEvents } = await build();
    const workflow = save(manager, [trigger, ask, approve, post], withApproval);
    const run = manager.run({ workflowId: workflow.id, input: "Hi" });
    await waitFor(() => started.length === 1);
    finish("delivery-1", "completed", "Draft text");
    await waitFor(() => cards.length === 1);
    expect(cards[0]).toMatchObject({
      botId: "chief",
      runId: run.id,
      title: "Reply flow: Approve",
      preview: "Send this? Draft text",
    });
    expect(manager.listRuns({ workflowId: workflow.id })[0]).toMatchObject({ status: "waiting" });
    expect(manager.listRuns({ workflowId: workflow.id })[0]?.steps.map((step) => step.status)).toEqual([
      "done",
      "done",
      "waiting",
      "pending",
    ]);
    expect(posts).toEqual([]);

    pending.get(run.id)?.("send");
    await manager.idle();
    expect(posts).toHaveLength(1);
    const done = manager.listRuns({ workflowId: workflow.id })[0];
    expect(done).toMatchObject({ status: "done" });
    expect(done?.steps[2]).toMatchObject({ status: "done", output: "Approved" });
    expect(runEvents(run.id).map((item) => item.status)).toEqual(
      expect.arrayContaining(["running", "waiting", "done"]),
    );
  });

  it("follows the deny connection after Edit or Cancel, or ends as denied without one", async () => {
    const edges: WorkflowEdge[] = [...withApproval, { id: "e4", from: "approve", to: "refuse", on: "deny" }];
    const branch = await build();
    const workflow = save(branch.manager, [trigger, ask, approve, post, refuse], edges);
    branch.manager.run({ workflowId: workflow.id });
    await waitFor(() => branch.started.length === 1);
    branch.finish("delivery-1", "completed", "Draft");
    await waitFor(() => branch.cards.length === 1);
    branch.pending.values().next().value?.("edit");
    await branch.manager.idle();
    const run = branch.manager.listRuns({ workflowId: workflow.id })[0];
    expect(run).toMatchObject({ status: "done", result: expect.stringContaining("Not approved") });
    expect(run?.steps.map((step) => [step.nodeId, step.status])).toEqual([
      ["start", "done"],
      ["ask", "done"],
      ["approve", "denied"],
      ["post", "skipped"],
      ["refuse", "done"],
    ]);
    expect(run?.steps[2]?.output).toBe("Sent back for edits");

    const plain = await build();
    const second = save(plain.manager, [trigger, ask, approve, post], withApproval);
    plain.manager.run({ workflowId: second.id });
    await waitFor(() => plain.started.length === 1);
    plain.finish("delivery-1", "completed", "Draft");
    await waitFor(() => plain.cards.length === 1);
    plain.pending.values().next().value?.("keep-draft");
    await plain.manager.idle();
    expect(plain.manager.listRuns({ workflowId: second.id })[0]).toMatchObject({ status: "denied" });
    expect(plain.posts).toEqual([]);
    expect(plain.manager.listRuns({ workflowId: second.id })[0]?.steps.at(-1)?.status).toBe("skipped");
  });
});

describe("WorkflowManager: cancelling and stopping", () => {
  it("cancels a run that waits for an approval and closes its card", async () => {
    const { manager, started, finish, cards, closed, posts } = await build();
    const workflow = save(manager, [trigger, ask, approve, post], withApproval);
    const run = manager.run({ workflowId: workflow.id });
    await waitFor(() => started.length === 1);
    finish("delivery-1", "completed", "Draft");
    await waitFor(() => cards.length === 1);
    const cancelled = manager.cancelRun({ runId: run.id });
    expect(cancelled).toMatchObject({ status: "cancelled" });
    expect(closed).toEqual([run.id]);
    await manager.idle();
    expect(manager.listRuns({ workflowId: workflow.id })[0]?.status).toBe("cancelled");
    expect(posts).toEqual([]);
    expect(() => manager.cancelRun({ runId: run.id })).toThrow(/already ended/);
    expect(manager.run({ workflowId: workflow.id })).toMatchObject({ status: "running" });
  });

  it("cancels a run that waits for an agent", async () => {
    const { manager, started } = await build();
    const workflow = save(manager, [trigger, ask, post], chain);
    const run = manager.run({ workflowId: workflow.id });
    await waitFor(() => started.length === 1);
    manager.cancelRun({ runId: run.id });
    await manager.idle();
    expect(manager.listRuns({ workflowId: workflow.id })[0]).toMatchObject({ status: "cancelled" });
    expect(manager.listRuns({ workflowId: workflow.id })[0]?.steps.map((step) => step.status)).toEqual([
      "done",
      "failed",
      "skipped",
    ]);
  });

  it("ends an open run as failed when the program stops, and again after a restart", async () => {
    const first = await build();
    const workflow = save(first.manager, [trigger, ask, post], chain);
    first.manager.run({ workflowId: workflow.id });
    await waitFor(() => first.started.length === 1);
    first.manager.stop();
    expect(first.manager.listRuns({ workflowId: workflow.id })[0]).toMatchObject({
      status: "failed",
      error: "The program stopped during this run.",
    });
    await first.manager.idle();

    // A run that a crash left open is closed by the next start.
    const crashed = await build();
    const other = save(crashed.manager, [trigger, ask, post], chain);
    const run: WorkflowRun = {
      id: "run-open",
      workflowId: other.id,
      workflowName: other.name,
      cause: "manual",
      status: "waiting",
      input: "",
      steps: [
        {
          nodeId: "start",
          title: "Start",
          type: "trigger",
          status: "done",
          output: "",
          error: null,
          startedAt: "2026-11-13T12:00:00.000Z",
          finishedAt: "2026-11-13T12:00:00.000Z",
        },
        {
          nodeId: "ask",
          title: "Ask",
          type: "agent",
          status: "running",
          output: null,
          error: null,
          startedAt: "2026-11-13T12:00:00.000Z",
          finishedAt: null,
        },
        {
          nodeId: "post",
          title: "Post",
          type: "channel-output",
          status: "pending",
          output: null,
          error: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
      result: null,
      error: null,
      startedAt: "2026-11-13T12:00:00.000Z",
      finishedAt: null,
    };
    crashed.store.saveRun(run);
    crashed.manager.start();
    const recovered = crashed.manager.listRuns({ workflowId: other.id })[0];
    expect(recovered).toMatchObject({ status: "failed", error: "The program stopped during this run." });
    expect(recovered?.steps.map((step) => step.status)).toEqual(["done", "failed", "skipped"]);
    expect(recovered?.finishedAt).not.toBeNull();
    expect(crashed.manager.list()[0]?.lastRun).toMatchObject({ runId: "run-open", status: "failed" });
    expect(() => crashed.manager.run({ workflowId: other.id })).not.toThrow();
  });
});

describe("WorkflowManager: routine trigger", () => {
  const routineTrigger: WorkflowNode = { ...trigger, trigger: { kind: "routine", routineId: "r1" } };
  const routineRun = (id: string, status: RoutineRun["status"], routineId = "r1"): AgentEvent => ({
    type: "routine-run",
    run: {
      id,
      routineId,
      botId: "chief",
      cause: "schedule",
      status,
      reason: null,
      startedAt: "2026-11-13T12:00:00.000Z",
      finishedAt: null,
      deliveryId: null,
    },
  });

  it("starts the workflow when its routine starts a run, once per routine run", async () => {
    const { manager, started, finish } = await build();
    const workflow = save(manager, [routineTrigger, ask, post], chain);
    manager.handleEvent(routineRun("rr-1", "running"));
    manager.handleEvent(routineRun("rr-1", "running"));
    await waitFor(() => started.length === 1);
    expect(started[0]?.text).toContain("Morning check");
    finish("delivery-1", "completed", "ok");
    await manager.idle();
    const runs = manager.listRuns({ workflowId: workflow.id });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ cause: "routine", status: "done" });
    expect(runs[0]?.input).toMatch(/Morning check/);
  });

  it("ignores other routines, finished runs, paused workflows and a workflow that is already running", async () => {
    const { manager, started, finish } = await build();
    const workflow = save(manager, [routineTrigger, ask, post], chain);
    manager.handleEvent(routineRun("rr-2", "running", "other"));
    manager.handleEvent(routineRun("rr-3", "done"));
    manager.update({ workflowId: workflow.id, paused: true });
    manager.handleEvent(routineRun("rr-4", "running"));
    expect(manager.listRuns({ workflowId: workflow.id })).toEqual([]);

    manager.update({ workflowId: workflow.id, paused: false });
    manager.handleEvent(routineRun("rr-5", "running"));
    manager.handleEvent(routineRun("rr-6", "running"));
    await waitFor(() => started.length === 1);
    expect(manager.listRuns({ workflowId: workflow.id })).toHaveLength(1);
    finish("delivery-1", "completed", "ok");
    await manager.idle();
  });
});
