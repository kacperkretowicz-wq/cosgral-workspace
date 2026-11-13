import { describe, expect, it } from "vitest";
import {
  IPC_CHANNELS,
  isAgentEvent,
  isWorkflow,
  isWorkflowEdge,
  isWorkflowNode,
  isWorkflowRun,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowRun,
  workflowProblems,
} from "./ipc";

const AT = "2026-11-13T12:00:00.000Z";

const trigger: WorkflowNode = { id: "start", type: "trigger", title: "Start", x: 0, y: 0, trigger: { kind: "manual" } };
const agent: WorkflowNode = {
  id: "draft",
  type: "agent",
  title: "Draft the reply",
  x: 240,
  y: 0,
  botId: "chief",
  prompt: "Write a short reply to: {{input}}",
};
const approval: WorkflowNode = {
  id: "check",
  type: "approval",
  title: "Approve",
  x: 480,
  y: 0,
  botId: "chief",
  text: "Send this?\n{{previous}}",
};
const output: WorkflowNode = {
  id: "post",
  type: "channel-output",
  title: "Post to channel",
  x: 720,
  y: 0,
  channelId: "channel-1",
  text: "{{steps.draft}}",
};

const edges: WorkflowEdge[] = [
  { id: "e1", from: "start", to: "draft", on: "next" },
  { id: "e2", from: "draft", to: "check", on: "next" },
  { id: "e3", from: "check", to: "post", on: "allow" },
];

const workflow: Workflow = {
  id: "wf-1",
  name: "Reply with approval",
  description: "",
  nodes: [trigger, agent, approval, output],
  edges,
  paused: false,
  createdAt: AT,
  updatedAt: AT,
  lastRun: null,
};

const run: WorkflowRun = {
  id: "run-1",
  workflowId: "wf-1",
  workflowName: "Reply with approval",
  cause: "manual",
  status: "waiting",
  input: "Hello",
  steps: [
    {
      nodeId: "draft",
      title: "Draft the reply",
      type: "agent",
      status: "done",
      output: "Hi!",
      error: null,
      startedAt: AT,
      finishedAt: AT,
    },
    {
      nodeId: "check",
      title: "Approve",
      type: "approval",
      status: "waiting",
      output: null,
      error: null,
      startedAt: AT,
      finishedAt: null,
    },
  ],
  result: null,
  error: null,
  startedAt: AT,
  finishedAt: null,
};

describe("workflows IPC contract", () => {
  it("recognizes nodes, edges, workflows and runs", () => {
    for (const node of [trigger, agent, approval, output]) expect(isWorkflowNode(node)).toBe(true);
    expect(isWorkflowNode({ ...trigger, trigger: { kind: "routine", routineId: "r1" } })).toBe(true);
    expect(isWorkflowNode({ ...trigger, trigger: { kind: "cron" } })).toBe(false);
    expect(isWorkflowNode({ ...agent, botId: undefined })).toBe(false);
    expect(isWorkflowNode({ ...agent, id: "Draft Step" })).toBe(false);
    expect(isWorkflowNode({ ...agent, type: "browser" })).toBe(false);
    expect(isWorkflowNode({ ...agent, x: "left" })).toBe(false);
    expect(isWorkflowEdge(edges[0])).toBe(true);
    expect(isWorkflowEdge({ ...edges[0], on: "maybe" })).toBe(false);
    expect(isWorkflow(workflow)).toBe(true);
    expect(isWorkflow({ ...workflow, nodes: [{ id: "x" }] })).toBe(false);
    expect(isWorkflow({ ...workflow, lastRun: { runId: "run-1", status: "done", startedAt: AT } })).toBe(true);
    expect(isWorkflow({ ...workflow, lastRun: { runId: "run-1", status: "stuck", startedAt: AT } })).toBe(false);
    expect(isWorkflowRun(run)).toBe(true);
    expect(isWorkflowRun({ ...run, status: "paused" })).toBe(false);
    expect(isWorkflowRun({ ...run, cause: "webhook" })).toBe(false);
  });

  it("reports what is wrong with a graph in plain words", () => {
    expect(workflowProblems({ nodes: workflow.nodes, edges })).toEqual([]);
    expect(workflowProblems({ nodes: [trigger], edges: [] })).toEqual([expect.stringMatching(/at least one step/)]);
    expect(workflowProblems({ nodes: [agent, approval], edges: [] })).toContainEqual(
      expect.stringMatching(/exactly one trigger/),
    );
    expect(workflowProblems({ nodes: [trigger, { ...agent, id: "start" }], edges: [] })).toContainEqual(
      expect.stringMatching(/same id/),
    );
    expect(
      workflowProblems({ nodes: [trigger, agent], edges: [{ id: "e1", from: "start", to: "nowhere", on: "next" }] }),
    ).toContainEqual(expect.stringMatching(/unknown step/));
    // The approval needs an "allow" way on; "deny" is optional.
    expect(
      workflowProblems({
        nodes: [trigger, approval],
        edges: [{ id: "e1", from: "start", to: "check", on: "next" }],
      }),
    ).toContainEqual(expect.stringMatching(/Allow/));
    // A step outside the path from the trigger is reported, not silently ignored.
    expect(workflowProblems({ nodes: [...workflow.nodes], edges: edges.slice(0, 2) })).toContainEqual(
      expect.stringMatching(/not reachable.*post/),
    );
    // "next" belongs to normal steps; "allow" and "deny" to approvals only.
    expect(
      workflowProblems({
        nodes: [trigger, agent],
        edges: [{ id: "e1", from: "start", to: "draft", on: "allow" }],
      }),
    ).toContainEqual(expect.stringMatching(/"next"/));
    // One way on from a normal step; no loops.
    expect(
      workflowProblems({
        nodes: [trigger, agent, output],
        edges: [
          { id: "e1", from: "start", to: "draft", on: "next" },
          { id: "e2", from: "draft", to: "post", on: "next" },
          { id: "e3", from: "draft", to: "start", on: "next" },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/one way on/),
        expect.stringMatching(/trigger.*incoming|incoming.*trigger/),
      ]),
    );
    expect(
      workflowProblems({
        nodes: [trigger, agent, { ...agent, id: "again" }],
        edges: [
          { id: "e1", from: "start", to: "draft", on: "next" },
          { id: "e2", from: "draft", to: "again", on: "next" },
          { id: "e3", from: "again", to: "draft", on: "next" },
        ],
      }),
    ).toContainEqual(expect.stringMatching(/loop/));
  });

  it("allows a deny branch and a join after the approval", () => {
    const refuse: WorkflowNode = { ...output, id: "refuse", title: "Tell the channel", text: "Not approved" };
    expect(
      workflowProblems({
        nodes: [trigger, agent, approval, output, refuse],
        edges: [...edges, { id: "e4", from: "check", to: "refuse", on: "deny" }],
      }),
    ).toEqual([]);
  });

  it("has channels and events for the workflows API", () => {
    expect(IPC_CHANNELS.workflowsList).toBe("workflows:list");
    expect(IPC_CHANNELS.workflowsCreate).toBe("workflows:create");
    expect(IPC_CHANNELS.workflowsUpdate).toBe("workflows:update");
    expect(IPC_CHANNELS.workflowsDelete).toBe("workflows:delete");
    expect(IPC_CHANNELS.workflowsRun).toBe("workflows:run");
    expect(IPC_CHANNELS.workflowsCancelRun).toBe("workflows:cancel-run");
    expect(IPC_CHANNELS.workflowsListRuns).toBe("workflows:list-runs");
    expect(isAgentEvent({ type: "workflows-changed", workflows: [workflow] })).toBe(true);
    expect(isAgentEvent({ type: "workflows-changed", workflows: [{ id: "x" }] })).toBe(false);
    expect(isAgentEvent({ type: "workflow-run-changed", run })).toBe(true);
    expect(isAgentEvent({ type: "workflow-run-changed", run: { id: "r" } })).toBe(false);
  });
});
