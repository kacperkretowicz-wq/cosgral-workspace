// @vitest-environment node
import {
  type AgentEvent,
  addWorkflowNode,
  emptyWorkflowGraph,
  isAgentEvent,
  isWorkflow,
  isWorkflowRun,
  type WorkflowGraph,
  workflowRunProgress,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockWorkflows } from "./mock-workflows";

const KNOWN = { botIds: ["chief", "writer"], channelIds: ["general"], routineIds: ["r1"] };

function setup(seed = true) {
  const events: AgentEvent[] = [];
  const mock = createMockWorkflows((event) => events.push(event), {
    known: () => KNOWN,
    seed: seed ? { botId: "chief", channelId: "general" } : null,
    now: () => new Date("2026-11-17T09:00:00.000Z"),
  });
  return { mock, events };
}

function simple(): WorkflowGraph {
  let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger");
  graph = addWorkflowNode(graph, "agent", { botId: "writer", prompt: "Summarise {{input}}" });
  graph = addWorkflowNode(graph, "channel-output", { channelId: "general", text: "Result: {{previous}}" });
  return graph;
}

describe("mock workflows: the list and the empty page", () => {
  it("starts with one demo workflow, or empty; everything it returns is valid", async () => {
    const seeded = await setup().mock.api.list();
    expect(seeded).toHaveLength(1);
    expect(seeded.every(isWorkflow)).toBe(true);
    expect(await setup(false).mock.api.list()).toEqual([]);
  });

  it("clear gives the empty page and an event", async () => {
    const { mock, events } = setup();
    mock.simulate.clear();
    expect(await mock.api.list()).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: "workflows-changed", workflows: [] });
  });
});

describe("mock workflows: saving", () => {
  it("creates, updates and deletes with events; the canvas graph is checked like in the program", async () => {
    const { mock, events } = setup(false);
    const created = await mock.api.create({ name: "  Brief  ", ...simple() });
    expect(created.name).toBe("Brief");
    expect(events.some((event) => event.type === "workflows-changed" && isAgentEvent(event))).toBe(true);
    const renamed = await mock.api.update({ workflowId: created.id, name: "Brief 2", paused: true });
    expect(renamed).toMatchObject({ name: "Brief 2", paused: true });
    await mock.api.delete({ workflowId: created.id });
    expect(await mock.api.list()).toEqual([]);
  });

  it("refuses an unknown agent, an empty instruction, a graph with no step after the trigger and a bad name, with the program's sentences", async () => {
    const { mock } = setup(false);
    const ghost = addWorkflowNode(addWorkflowNode(emptyWorkflowGraph(), "trigger"), "agent", {
      botId: "ghost",
      prompt: "x",
    });
    await expect(mock.api.create({ name: "A", ...ghost })).rejects.toThrow(
      /The agent "ghost" in step "Agent" does not exist/,
    );
    const empty = addWorkflowNode(addWorkflowNode(emptyWorkflowGraph(), "trigger"), "agent", { botId: "chief" });
    await expect(mock.api.create({ name: "A", ...empty })).rejects.toThrow(/needs an instruction/);
    await expect(mock.api.create({ name: "A", ...addWorkflowNode(emptyWorkflowGraph(), "trigger") })).rejects.toThrow(
      /at least one step after the trigger/,
    );
    await expect(mock.api.create({ name: "  ", ...simple() })).rejects.toThrow(/needs a name/);
    await expect(mock.api.update({ workflowId: "nope", name: "x" })).rejects.toThrow(/does not exist/);
  });
});

describe("mock workflows: a run", () => {
  it("runs step by step with {{input}} and {{previous}}, and the workflow shows its last run", async () => {
    const { mock, events } = setup(false);
    const wf = await mock.api.create({ name: "Brief", ...simple() });
    const run = await mock.api.run({ workflowId: wf.id, input: "the news" });
    expect(isWorkflowRun(run)).toBe(true);
    expect(run).toMatchObject({ status: "running", cause: "manual", input: "the news" });
    expect(run.steps.map((step) => step.status)).toEqual(["done", "pending", "pending"]);
    expect((await mock.api.list())[0]?.lastRun).toMatchObject({ runId: run.id, status: "running" });

    const second = mock.simulate.advance(run.id);
    expect(second.steps[1]).toMatchObject({ status: "done", output: "Demo reply from writer: Summarise the news" });
    expect(workflowRunProgress(second).label).toBe("2 of 3 steps");
    const done = mock.simulate.advance(run.id);
    expect(done).toMatchObject({ status: "done", result: "Result: Demo reply from writer: Summarise the news" });
    expect(done.finishedAt).not.toBeNull();
    expect((await mock.api.list())[0]?.lastRun?.status).toBe("done");
    expect(events.filter((event) => event.type === "workflow-run-changed").length).toBeGreaterThanOrEqual(3);
    expect(() => mock.simulate.advance(run.id)).toThrow(/already ended/);
    expect((await mock.api.listRuns({ workflowId: wf.id }))[0]?.id).toBe(run.id);
  });

  it("one run at a time, and a paused workflow is not started", async () => {
    const { mock } = setup(false);
    const wf = await mock.api.create({ name: "Brief", ...simple() });
    await mock.api.run({ workflowId: wf.id });
    await expect(mock.api.run({ workflowId: wf.id })).rejects.toThrow(/already running/);
    const other = await mock.api.create({ name: "Other", ...simple(), paused: true });
    await expect(mock.api.run({ workflowId: other.id })).rejects.toThrow(/paused/);
  });

  it("the demo workflow waits on its approval card; Allow posts, Deny takes the other way", async () => {
    const { mock } = setup();
    const [wf] = await mock.api.list();
    if (!wf) throw new Error("no demo workflow");
    const run = await mock.api.run({ workflowId: wf.id, input: "Monday" });
    mock.simulate.advance(run.id);
    const waiting = mock.simulate.advance(run.id);
    expect(waiting.status).toBe("waiting");
    expect(workflowRunProgress(waiting).current).toEqual({ nodeId: "ask", title: "Post it?", status: "waiting" });
    expect(() => mock.simulate.advance(run.id)).toThrow(/waits for a decision/);
    expect((await mock.api.list())[0]?.lastRun?.status).toBe("waiting");
    const allowed = mock.simulate.decide(run.id, "allow");
    expect(allowed.status).toBe("running");
    const finished = mock.simulate.advance(run.id);
    expect(finished.status).toBe("done");
    expect(finished.steps.find((step) => step.nodeId === "post")?.status).toBe("done");
    expect(finished.steps.find((step) => step.nodeId === "skip")?.status).toBe("skipped");

    const again = await mock.api.run({ workflowId: wf.id });
    mock.simulate.advance(again.id);
    mock.simulate.advance(again.id);
    mock.simulate.decide(again.id, "deny");
    const denied = mock.simulate.advance(again.id);
    expect(denied.steps.find((step) => step.nodeId === "skip")?.output).toBe("The brief was not posted.");
    expect(denied.steps.find((step) => step.nodeId === "ask")?.status).toBe("denied");
    expect(() => mock.simulate.decide(again.id, "allow")).toThrow(/already ended|not waiting/);
  });

  it("a denial with no Deny way ends the run as denied", async () => {
    const { mock } = setup(false);
    let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger");
    graph = addWorkflowNode(graph, "approval", { botId: "chief", text: "Go on?" });
    graph = addWorkflowNode(graph, "channel-output", { channelId: "general", text: "Sent" });
    const wf = await mock.api.create({ name: "Ask", ...graph });
    const run = await mock.api.run({ workflowId: wf.id });
    mock.simulate.advance(run.id);
    expect(mock.simulate.decide(run.id, "deny")).toMatchObject({ status: "denied" });
    expect((await mock.api.listRuns({ workflowId: wf.id }))[0]?.steps.map((step) => step.status)).toEqual([
      "done",
      "denied",
      "skipped",
    ]);
  });

  it("a failing step ends the run as failed with its sentence; cancel and delete end an open run", async () => {
    const { mock } = setup(false);
    const wf = await mock.api.create({ name: "Brief", ...simple() });
    const run = await mock.api.run({ workflowId: wf.id });
    mock.simulate.failNext("The agent could not answer.");
    const failed = mock.simulate.advance(run.id);
    expect(failed).toMatchObject({ status: "failed", error: "The agent could not answer." });
    expect(failed.steps.map((step) => step.status)).toEqual(["done", "failed", "skipped"]);

    const next = await mock.api.run({ workflowId: wf.id });
    expect(await mock.api.cancelRun({ runId: next.id })).toMatchObject({ status: "cancelled" });
    await expect(mock.api.cancelRun({ runId: next.id })).rejects.toThrow(/already ended/);
    await expect(mock.api.cancelRun({ runId: "nope" })).rejects.toThrow(/does not exist/);

    const open = await mock.api.run({ workflowId: wf.id });
    await mock.api.delete({ workflowId: wf.id });
    expect(() => mock.simulate.advance(open.id)).toThrow(/already ended/);
    await expect(mock.api.listRuns({ workflowId: wf.id })).rejects.toThrow(/does not exist/);
  });
});
