// @vitest-environment node
import {
  type AgentEvent,
  addWorkflowNode,
  describeWorkflowDiff,
  diffWorkflowGraphs,
  emptyWorkflowGraph,
  isAgentEvent,
  isWorkflow,
  isWorkflowRun,
  isWorkflowVersionDetails,
  isWorkflowVersionSummary,
  WORKFLOW_VERSION_LIMITS,
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

describe("mock workflows: versions", () => {
  it("a new workflow has version 1; every graph change is a new version, renaming and moving are not", async () => {
    const { mock } = setup(false);
    const wf = await mock.api.create({ name: "Brief", ...simple() });
    const first = await mock.api.listVersions({ workflowId: wf.id });
    expect(first.every(isWorkflowVersionSummary)).toBe(true);
    expect(first.map((version) => [version.number, version.reason, version.current])).toEqual([[1, "created", true]]);
    expect(first[0]?.summary).toBe("1 trigger, 1 agent step, 1 output");

    await mock.api.update({ workflowId: wf.id, name: "Brief 2", paused: false });
    expect(await mock.api.listVersions({ workflowId: wf.id })).toHaveLength(1);
    await mock.api.update({
      workflowId: wf.id,
      nodes: wf.nodes.map((node) => ({ ...node, x: node.x + 10 })),
      edges: wf.edges,
    });
    expect(await mock.api.listVersions({ workflowId: wf.id })).toHaveLength(2);

    const edited = wf.nodes.map((node) =>
      node.type === "agent" ? { ...node, prompt: "Short summary of {{input}}" } : node,
    );
    await mock.api.update({ workflowId: wf.id, nodes: edited, edges: wf.edges });
    const list = await mock.api.listVersions({ workflowId: wf.id });
    expect(list.map((version) => [version.number, version.current])).toEqual([
      [3, true],
      [2, false],
      [1, false],
    ]);
    // Saving the same graph again is not a new version.
    await mock.api.update({ workflowId: wf.id, nodes: edited, edges: wf.edges });
    expect(await mock.api.listVersions({ workflowId: wf.id })).toHaveLength(3);
  });

  it("a version has its graph, and the diff says what changed", async () => {
    const { mock } = setup(false);
    const wf = await mock.api.create({ name: "Brief", ...simple() });
    const edited = wf.nodes.map((node) => (node.type === "agent" ? { ...node, prompt: "Short" } : node));
    await mock.api.update({ workflowId: wf.id, nodes: edited, edges: wf.edges });
    const older = await mock.api.getVersion({ workflowId: wf.id, version: 1 });
    const newer = await mock.api.getVersion({ workflowId: wf.id, version: 2 });
    expect(isWorkflowVersionDetails(older)).toBe(true);
    expect(describeWorkflowDiff(diffWorkflowGraphs(older, newer))).toBe("Changed: Agent.");
    await expect(mock.api.getVersion({ workflowId: wf.id, version: 9 })).rejects.toThrow(/no longer exists/);
  });

  it("restore puts the older graph back as a NEW version that says where it came from, and can itself be restored", async () => {
    const { mock, events } = setup(false);
    const wf = await mock.api.create({ name: "Brief", ...simple() });
    const edited = wf.nodes.map((node) => (node.type === "agent" ? { ...node, prompt: "Short" } : node));
    await mock.api.update({ workflowId: wf.id, nodes: edited, edges: wf.edges });

    const restored = await mock.api.restoreVersion({ workflowId: wf.id, version: 1 });
    expect(restored.nodes.find((node) => node.type === "agent")).toMatchObject({ prompt: "Summarise {{input}}" });
    expect(events.at(-1)).toMatchObject({ type: "workflows-changed" });
    const list = await mock.api.listVersions({ workflowId: wf.id });
    expect(list.map((version) => [version.number, version.reason, version.restoredFrom])).toEqual([
      [3, "restored", 1],
      [2, "edited", null],
      [1, "created", null],
    ]);
    // Restoring what is already current changes nothing.
    await mock.api.restoreVersion({ workflowId: wf.id, version: 3 });
    expect(await mock.api.listVersions({ workflowId: wf.id })).toHaveLength(3);
    // Undo the restore.
    const back = await mock.api.restoreVersion({ workflowId: wf.id, version: 2 });
    expect(back.nodes.find((node) => node.type === "agent")).toMatchObject({ prompt: "Short" });
    expect((await mock.api.listVersions({ workflowId: wf.id })).at(0)).toMatchObject({ number: 4, restoredFrom: 2 });
  });

  it("restore is checked like a save: an agent that is gone refuses it; only 20 versions are kept; delete drops them", async () => {
    let known = ["chief", "writer"];
    const mock = createMockWorkflows(() => undefined, {
      known: () => ({ botIds: known, channelIds: ["general"], routineIds: [] }),
      seed: null,
    });
    const wf = await mock.api.create({ name: "Brief", ...simple() });
    const edited = wf.nodes.map((node) =>
      node.type === "agent" ? { ...node, botId: "chief", prompt: "Other" } : node,
    );
    await mock.api.update({ workflowId: wf.id, nodes: edited, edges: wf.edges });
    known = ["chief"];
    await expect(mock.api.restoreVersion({ workflowId: wf.id, version: 1 })).rejects.toThrow(
      /The agent "writer" in step "Agent" does not exist/,
    );
    expect(await mock.api.listVersions({ workflowId: wf.id })).toHaveLength(2);

    for (let index = 0; index < 25; index += 1) {
      const nodes = wf.nodes.map((node) =>
        node.type === "agent" ? { ...node, botId: "chief", prompt: `Round ${index}` } : node,
      );
      await mock.api.update({ workflowId: wf.id, nodes, edges: wf.edges });
    }
    const kept = await mock.api.listVersions({ workflowId: wf.id });
    expect(kept).toHaveLength(WORKFLOW_VERSION_LIMITS.kept);
    expect(kept[0]?.number).toBe(27);
    expect(kept.at(-1)?.number).toBe(8);
    await mock.api.delete({ workflowId: wf.id });
    await expect(mock.api.listVersions({ workflowId: wf.id })).rejects.toThrow(/does not exist/);
  });

  it("the demo workflow gets its first version when its versions are listed", async () => {
    const { mock } = setup();
    const [wf] = await mock.api.list();
    if (!wf) throw new Error("no demo workflow");
    expect((await mock.api.listVersions({ workflowId: wf.id })).map((version) => version.number)).toEqual([1]);
  });
});
