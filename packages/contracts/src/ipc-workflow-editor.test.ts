import { describe, expect, it } from "vitest";
import {
  addWorkflowNode,
  checkWorkflowDraft,
  connectWorkflowNodes,
  createWorkflowHistory,
  describeSchedule,
  emptyWorkflowGraph,
  formatClockTime,
  moveWorkflowNode,
  type Routine,
  removeWorkflowNode,
  type Workflow,
  type WorkflowGraph,
  type WorkflowRun,
  workflowCanvasPrompt,
  workflowNodeIssues,
  workflowPalette,
  workflowProblems,
  workflowRunBadge,
  workflowRunProgress,
  workflowRunState,
  workflowTriggerCard,
} from "./ipc";

const KNOWN = { botIds: ["chief", "writer"], channelIds: ["general"], routineIds: ["r1"] };
const AT = "2026-11-17T09:00:00.000Z";

function chain(): WorkflowGraph {
  let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger");
  graph = addWorkflowNode(graph, "agent", { botId: "chief", prompt: "Write the brief" });
  graph = addWorkflowNode(graph, "channel-output", { channelId: "general", text: "{{previous}}" });
  return graph;
}

function saved(graph: WorkflowGraph, extra: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf-1",
    name: "Morning brief",
    description: "",
    paused: false,
    createdAt: AT,
    updatedAt: AT,
    lastRun: null,
    ...graph,
    ...extra,
  };
}

describe("the node picker", () => {
  it("shows Inputs, Steps and Flow with the steps we do not have dimmed and a reason", () => {
    const sections = workflowPalette(emptyWorkflowGraph());
    expect(sections.map((section) => section.label)).toEqual(["Inputs", "Steps", "Flow"]);
    const all = sections.flatMap((section) => section.entries);
    expect(all.map((entry) => entry.label)).toEqual([
      "Trigger",
      "Prompt",
      "Asset",
      "LLM",
      "Agent",
      "Image",
      "Video",
      "Condition",
      "Approval",
      "Output",
    ]);
    for (const entry of all.filter((item) => item.type === null)) {
      expect(entry.available).toBe(false);
      expect(entry.reason?.length).toBeGreaterThan(10);
    }
    // Before the trigger only the trigger can be added.
    expect(all.filter((entry) => entry.available).map((entry) => entry.id)).toEqual(["trigger"]);
  });

  it("dims the trigger once there is one, and every step at the limit; the search filters by label", () => {
    const graph = chain();
    const entries = workflowPalette(graph).flatMap((section) => section.entries);
    expect(entries.find((entry) => entry.id === "trigger")).toMatchObject({
      available: false,
      reason: "A workflow has exactly one trigger.",
    });
    expect(entries.find((entry) => entry.id === "agent")?.available).toBe(true);
    expect(workflowPalette(graph, "  APP ").flatMap((section) => section.entries.map((entry) => entry.id))).toEqual([
      "approval",
    ]);
    expect(workflowPalette(graph, "zzz")).toEqual([]);
    const crowded: WorkflowGraph = {
      nodes: Array.from({ length: 30 }, (_, index) => ({
        id: `n-${index}`,
        type: "trigger" as const,
        title: "T",
        x: 0,
        y: 0,
        trigger: { kind: "manual" as const },
      })),
      edges: [],
    };
    expect(
      workflowPalette(crowded)
        .flatMap((section) => section.entries)
        .filter((entry) => entry.type !== null)
        .every((entry) => !entry.available && entry.reason === "At most 30 steps."),
    ).toBe(true);
  });

  it("the empty canvas asks for a trigger, then for the first step", () => {
    expect(workflowCanvasPrompt(emptyWorkflowGraph())).toEqual({
      title: "Start with a trigger",
      action: "Add trigger",
    });
    const withTrigger = addWorkflowNode(emptyWorkflowGraph(), "trigger");
    expect(workflowCanvasPrompt(withTrigger)).toEqual({ title: "Add the first step", action: "Add node" });
    expect(workflowCanvasPrompt(chain())).toBeNull();
  });
});

describe("building the graph", () => {
  it("adds steps with free ids and titles, to the right of the last one, and connects them", () => {
    const graph = chain();
    expect(graph.nodes.map((node) => [node.id, node.title, node.x])).toEqual([
      ["trigger", "Trigger", 0],
      ["agent", "Agent", 280],
      ["output", "Output", 560],
    ]);
    expect(graph.edges.map((edge) => [edge.from, edge.to, edge.on])).toEqual([
      ["trigger", "agent", "next"],
      ["agent", "output", "next"],
    ]);
    expect(workflowProblems(graph)).toEqual([]);
    const again = addWorkflowNode(graph, "agent", { botId: "writer", prompt: "Polish" });
    expect(again.nodes.at(-1)).toMatchObject({ id: "agent-2", title: "Agent 2" });
  });

  it("does not change the graph it was given", () => {
    const before = chain();
    const copy = structuredClone(before);
    addWorkflowNode(before, "approval", { botId: "chief", text: "Send?" });
    removeWorkflowNode(before, "agent");
    connectWorkflowNodes(before, "trigger", "output");
    moveWorkflowNode(before, "agent", 5, 5);
    expect(before).toEqual(copy);
  });

  it("refuses a second trigger, a step before the trigger, and the limit", () => {
    expect(() => addWorkflowNode(chain(), "trigger")).toThrow(/exactly one trigger/);
    expect(() => addWorkflowNode(emptyWorkflowGraph(), "agent")).toThrow(/Start with a trigger/);
    expect(() => addWorkflowNode(chain(), "agent", { after: "nope" })).toThrow(/does not exist/);
    let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger");
    for (let index = 1; index < 30; index += 1) graph = addWorkflowNode(graph, "agent");
    expect(graph.nodes).toHaveLength(30);
    expect(() => addWorkflowNode(graph, "agent")).toThrow(/At most 30 steps/);
  });

  it("a step after an approval takes Allow first, then Deny; a trigger can name its routine", () => {
    let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger", { routineId: "r1" });
    expect(graph.nodes[0]).toMatchObject({ trigger: { kind: "routine", routineId: "r1" } });
    graph = addWorkflowNode(graph, "approval", { botId: "chief", text: "Send it?" });
    graph = addWorkflowNode(graph, "channel-output", { channelId: "general", text: "Sent" });
    graph = addWorkflowNode(graph, "channel-output", { channelId: "general", text: "Not sent", after: "approval" });
    expect(graph.edges.filter((edge) => edge.from === "approval").map((edge) => edge.on)).toEqual(["allow", "deny"]);
    expect(workflowProblems(graph)).toEqual([]);
  });

  it("removing a step in the middle bridges the chain; removing a step the trigger needs leaves a clear problem", () => {
    const graph = removeWorkflowNode(chain(), "agent");
    expect(graph.edges.map((edge) => [edge.from, edge.to, edge.on])).toEqual([["trigger", "output", "next"]]);
    expect(workflowProblems(graph)).toEqual([]);
    expect(() => removeWorkflowNode(chain(), "nope")).toThrow(/does not exist/);
    const lonely = removeWorkflowNode(removeWorkflowNode(chain(), "output"), "agent");
    expect(workflowProblems(lonely)).toContain("A workflow needs at least one step after the trigger.");
  });

  it("connecting replaces the way on of the same kind and refuses a loop onto itself", () => {
    const graph = connectWorkflowNodes(chain(), "trigger", "output");
    expect(graph.edges.filter((edge) => edge.from === "trigger")).toHaveLength(1);
    expect(graph.edges.find((edge) => edge.from === "trigger")?.to).toBe("output");
    expect(() => connectWorkflowNodes(chain(), "agent", "agent")).toThrow(/itself/);
    expect(() => connectWorkflowNodes(chain(), "agent", "nope")).toThrow(/does not exist/);
    expect(() => moveWorkflowNode(chain(), "agent", Number.NaN, 1)).toThrow(/not valid/);
    expect(moveWorkflowNode(chain(), "agent", 10, 20).nodes[1]).toMatchObject({ x: 10, y: 20 });
  });
});

describe("undo and redo", () => {
  it("walks back and forth, drops the redo after a new change, and keeps a bounded history", () => {
    const history = createWorkflowHistory(emptyWorkflowGraph(), 3);
    expect(history.canUndo()).toBe(false);
    const one = addWorkflowNode(emptyWorkflowGraph(), "trigger");
    const two = addWorkflowNode(one, "agent");
    history.push(one);
    history.push(two);
    expect(history.undo().nodes).toHaveLength(1);
    expect(history.canRedo()).toBe(true);
    expect(history.redo().nodes).toHaveLength(2);
    history.undo();
    history.push(emptyWorkflowGraph());
    expect(history.canRedo()).toBe(false);
    for (let index = 0; index < 5; index += 1) history.push(one);
    let steps = 0;
    while (history.canUndo()) {
      history.undo();
      steps += 1;
    }
    expect(steps).toBe(2);
  });
});

describe("the trigger card", () => {
  it("formats the chips: a daily time with weekdays, an interval and a cron", () => {
    expect(formatClockTime("09:00")).toBe("9 AM");
    expect(formatClockTime("17:30")).toBe("5:30 PM");
    expect(formatClockTime("00:05")).toBe("12:05 AM");
    expect(formatClockTime("12:00")).toBe("12 PM");
    expect(formatClockTime("soon")).toBe("soon");
    expect(describeSchedule({ type: "daily", time: "09:00" })).toEqual({
      frequency: "Daily",
      on: "Every day",
      at: "9 AM",
    });
    expect(describeSchedule({ type: "daily", time: "07:30", weekdays: [3, 1] })).toEqual({
      frequency: "Daily",
      on: "Mon, Wed",
      at: "7:30 AM",
    });
    expect(describeSchedule({ type: "interval", everyMinutes: 15 }).frequency).toBe("Every 15 minutes");
    expect(describeSchedule({ type: "interval", everyMinutes: 60 }).frequency).toBe("Every hour");
    expect(describeSchedule({ type: "interval", everyMinutes: 2880 }).frequency).toBe("Every 2 days");
    expect(describeSchedule({ type: "cron", expression: "0 9 * * 1-5" })).toEqual({
      frequency: "Cron",
      on: "0 9 * * 1-5",
      at: "",
    });
  });

  it("shows a schedule trigger with its next run, a webhook trigger with its address, and a gone routine", () => {
    const routine: Routine = {
      id: "r1",
      botId: "chief",
      name: "Brief",
      prompt: "Brief",
      trigger: "schedule",
      schedule: { type: "daily", time: "09:00" },
      timezone: "UTC",
      paused: false,
      nextRunAt: "2026-11-17T09:00:00.000Z",
      webhook: null,
      createdBy: "person",
      createdAt: AT,
      updatedAt: AT,
    };
    const hook: Routine = {
      ...routine,
      id: "r2",
      trigger: "webhook",
      schedule: null,
      nextRunAt: null,
      webhook: { url: "http://127.0.0.1:47900/hooks/r2", eventTypes: [] },
    };
    const node = (routineId: string) => ({
      id: "trigger",
      type: "trigger" as const,
      title: "Trigger",
      x: 0,
      y: 0,
      trigger: { kind: "routine" as const, routineId },
    });
    const ok = { canRun: true, reason: null };
    expect(workflowTriggerCard(node("r1"), [routine, hook], ok)).toMatchObject({
      choice: "schedule",
      schedule: { frequency: "Daily", on: "Every day", at: "9 AM" },
      nextRunAt: "2026-11-17T09:00:00.000Z",
      canRunNow: true,
    });
    expect(workflowTriggerCard(node("r2"), [routine, hook], ok)).toMatchObject({
      choice: "webhook",
      webhookUrl: "http://127.0.0.1:47900/hooks/r2",
      nextRunAt: null,
      schedule: null,
    });
    expect(workflowTriggerCard(node("r1"), [{ ...routine, paused: true }], ok).nextRunAt).toBeNull();
    expect(workflowTriggerCard(node("gone"), [routine], ok)).toMatchObject({ routineMissing: true, routine: null });
    const manual = workflowTriggerCard(
      { id: "t", type: "trigger", title: "T", x: 0, y: 0, trigger: { kind: "manual" } },
      [],
      { canRun: false, reason: "This workflow is paused." },
    );
    expect(manual).toMatchObject({ choice: "manual", canRunNow: false, reason: "This workflow is paused." });
  });
});

describe("problems shown on the canvas", () => {
  it("an empty canvas is not an error and cannot be saved; a finished chain can", () => {
    expect(checkWorkflowDraft(emptyWorkflowGraph(), KNOWN)).toEqual({
      graphProblems: [],
      nodeIssues: [],
      canSave: false,
    });
    expect(checkWorkflowDraft(chain(), KNOWN)).toMatchObject({ canSave: true, nodeIssues: [], graphProblems: [] });
  });

  it("names what each step still needs, with the sentences the program uses on save", () => {
    let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger", { routineId: "gone" });
    graph = addWorkflowNode(graph, "agent");
    graph = addWorkflowNode(graph, "approval", { botId: "ghost", text: "Ok?" });
    graph = addWorkflowNode(graph, "channel-output", { channelId: "nowhere", text: "" });
    const issues = workflowNodeIssues(graph, KNOWN).map((issue) => issue.message);
    expect(issues).toEqual([
      'The routine "gone" in the trigger does not exist.',
      'Step "Agent" needs an agent.',
      'Step "Agent" needs an instruction.',
      'The agent "ghost" in step "Approval" does not exist.',
      'The channel "nowhere" in step "Output" does not exist.',
      'Step "Output" needs a text.',
    ]);
    expect(checkWorkflowDraft(graph, KNOWN).canSave).toBe(false);
    const titled = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, title: " " })) };
    expect(workflowNodeIssues(titled, KNOWN).filter((issue) => /needs a title/.test(issue.message))).toHaveLength(4);
  });
});

describe("running", () => {
  it("'Run workflow' is allowed for a good workflow and says why not otherwise", () => {
    expect(workflowRunState(saved(chain()))).toEqual({ canRun: true, reason: null, running: false });
    expect(workflowRunState(saved(chain(), { paused: true }))).toMatchObject({
      canRun: false,
      reason: "This workflow is paused.",
    });
    expect(workflowRunState(saved(chain(), { lastRun: { runId: "run-1", status: "waiting", startedAt: AT } }))).toEqual(
      { canRun: false, reason: "This workflow is already running.", running: true },
    );
    const broken = saved({ nodes: chain().nodes, edges: [] });
    expect(workflowRunState(broken).reason).toMatch(/^Fix the canvas first: /);
    expect(
      workflowRunState(saved(chain(), { lastRun: { runId: "run-1", status: "done", startedAt: AT } })).canRun,
    ).toBe(true);
  });

  it("badges and progress of a run", () => {
    expect(workflowRunBadge("waiting")).toEqual({ label: "Waiting for you", tone: "waiting" });
    expect(workflowRunBadge("failed").tone).toBe("danger");
    const run: WorkflowRun = {
      id: "run-1",
      workflowId: "wf-1",
      workflowName: "Morning brief",
      cause: "manual",
      status: "waiting",
      input: "",
      steps: [
        {
          nodeId: "trigger",
          title: "Trigger",
          type: "trigger",
          status: "done",
          output: "",
          error: null,
          startedAt: AT,
          finishedAt: AT,
        },
        {
          nodeId: "approval",
          title: "Approval",
          type: "approval",
          status: "waiting",
          output: null,
          error: null,
          startedAt: AT,
          finishedAt: null,
        },
        {
          nodeId: "output",
          title: "Output",
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
      startedAt: AT,
      finishedAt: null,
    };
    expect(workflowRunProgress(run)).toEqual({
      finished: 1,
      total: 3,
      label: "1 of 3 steps",
      current: { nodeId: "approval", title: "Approval", status: "waiting" },
    });
    expect(workflowRunProgress({ ...run, steps: [] }).label).toBe("0 of 0 steps");
  });
});
