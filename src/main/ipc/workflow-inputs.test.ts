import type { WorkflowEdge, WorkflowNode } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  parseCreateWorkflow,
  parseRunWorkflow,
  parseUpdateWorkflow,
  parseWorkflowId,
  parseWorkflowRunId,
} from "./workflow-inputs";

const nodes: WorkflowNode[] = [
  { id: "start", type: "trigger", title: "Start", x: 0, y: 0, trigger: { kind: "manual" } },
  { id: "ask", type: "agent", title: "Ask", x: 200, y: 0, botId: "chief", prompt: "Say hi." },
];
const edges: WorkflowEdge[] = [{ id: "e1", from: "start", to: "ask", on: "next" }];

describe("workflow IPC inputs", () => {
  it("parses a workflow to create and one to update", () => {
    expect(parseCreateWorkflow({ name: "Hi", nodes, edges })).toEqual({ name: "Hi", nodes, edges });
    expect(parseCreateWorkflow({ name: "Hi", description: "d", nodes, edges, paused: true })).toMatchObject({
      description: "d",
      paused: true,
    });
    expect(parseUpdateWorkflow({ workflowId: "wf-1", paused: false })).toEqual({ workflowId: "wf-1", paused: false });
    expect(parseUpdateWorkflow({ workflowId: "wf-1", name: "New", nodes, edges })).toMatchObject({ name: "New" });
  });

  it("rejects what is not a workflow", () => {
    expect(() => parseCreateWorkflow(null)).toThrow();
    expect(() => parseCreateWorkflow({ nodes, edges })).toThrow(/name/);
    expect(() => parseCreateWorkflow({ name: "x".repeat(81), nodes, edges })).toThrow(/name/);
    expect(() => parseCreateWorkflow({ name: "Hi", nodes: "none", edges })).toThrow(/steps/);
    expect(() => parseCreateWorkflow({ name: "Hi", nodes: [{ id: "x" }], edges })).toThrow(/steps/);
    expect(() => parseCreateWorkflow({ name: "Hi", nodes, edges: [{ id: "e1", on: "next" }] })).toThrow(/connections/);
    expect(() => parseCreateWorkflow({ name: "Hi", nodes, edges, paused: "no" })).toThrow(/paused/);
    expect(() => parseCreateWorkflow({ name: "Hi", nodes: Array(31).fill(nodes[1]), edges })).toThrow(/at most 30/i);
    expect(() => parseUpdateWorkflow({ name: "x" })).toThrow(/workflowId/);
    expect(() => parseUpdateWorkflow({ workflowId: "wf-1", description: 5 })).toThrow(/description/);
  });

  it("parses ids and the run input", () => {
    expect(parseWorkflowId({ workflowId: "wf-1" })).toEqual({ workflowId: "wf-1" });
    expect(parseWorkflowRunId({ runId: "run-1" })).toEqual({ runId: "run-1" });
    expect(parseRunWorkflow({ workflowId: "wf-1" })).toEqual({ workflowId: "wf-1" });
    expect(parseRunWorkflow({ workflowId: "wf-1", input: "" })).toEqual({ workflowId: "wf-1", input: "" });
    expect(parseRunWorkflow({ workflowId: "wf-1", input: "Hello" })).toEqual({ workflowId: "wf-1", input: "Hello" });
    expect(() => parseRunWorkflow({ workflowId: "wf-1", input: 3 })).toThrow(/input/);
    expect(() => parseRunWorkflow({ workflowId: "wf-1", input: "x".repeat(8_001) })).toThrow(/input/);
    expect(() => parseWorkflowId({})).toThrow();
    expect(() => parseWorkflowRunId(null)).toThrow();
  });
});
