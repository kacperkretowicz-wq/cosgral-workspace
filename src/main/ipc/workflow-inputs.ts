// COSGRAL W3: input validation for the workflow IPC calls. Content rules (titles, texts, known agents and
// channels, the graph itself) are in WorkflowManager; this only checks the shape and the sizes.

import {
  type CreateWorkflowInput,
  isWorkflowEdge,
  isWorkflowNode,
  type RunWorkflowInput,
  type UpdateWorkflowInput,
  WORKFLOW_LIMITS,
  type WorkflowEdge,
  type WorkflowIdInput,
  type WorkflowNode,
  type WorkflowRunIdInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseCreateWorkflow(value: unknown): CreateWorkflowInput {
  if (!isObject(value)) throw new Error("Workflow details are required.");
  return {
    name: requireString(value.name, "name", WORKFLOW_LIMITS.name),
    description: optionalText(value.description, "description", WORKFLOW_LIMITS.description),
    nodes: requiredNodes(value.nodes),
    edges: requiredEdges(value.edges),
    paused: optionalBoolean(value.paused),
  };
}

export function parseUpdateWorkflow(value: unknown): UpdateWorkflowInput {
  if (!isObject(value)) throw new Error("Workflow details are required.");
  return {
    workflowId: requireString(value.workflowId, "workflowId"),
    name: value.name === undefined ? undefined : requireString(value.name, "name", WORKFLOW_LIMITS.name),
    description: optionalText(value.description, "description", WORKFLOW_LIMITS.description),
    nodes: value.nodes === undefined ? undefined : requiredNodes(value.nodes),
    edges: value.edges === undefined ? undefined : requiredEdges(value.edges),
    paused: optionalBoolean(value.paused),
  };
}

export function parseWorkflowId(value: unknown): WorkflowIdInput {
  if (!isObject(value)) throw new Error("The workflow is required.");
  return { workflowId: requireString(value.workflowId, "workflowId") };
}

export function parseWorkflowRunId(value: unknown): WorkflowRunIdInput {
  if (!isObject(value)) throw new Error("The workflow run is required.");
  return { runId: requireString(value.runId, "runId") };
}

export function parseRunWorkflow(value: unknown): RunWorkflowInput {
  if (!isObject(value)) throw new Error("The workflow is required.");
  const workflowId = requireString(value.workflowId, "workflowId");
  if (value.input === undefined || value.input === null) return { workflowId };
  if (!isString(value.input) || value.input.length > WORKFLOW_LIMITS.input) {
    throw new Error(`input must be a text of at most ${WORKFLOW_LIMITS.input} characters.`);
  }
  return { workflowId, input: value.input };
}

function requiredNodes(value: unknown): WorkflowNode[] {
  if (!Array.isArray(value) || !value.every(isWorkflowNode)) throw new Error("nodes must be a list of valid steps.");
  if (value.length > WORKFLOW_LIMITS.nodes) throw new Error(`A workflow has at most ${WORKFLOW_LIMITS.nodes} steps.`);
  return [...value];
}

function requiredEdges(value: unknown): WorkflowEdge[] {
  if (!Array.isArray(value) || !value.every(isWorkflowEdge))
    throw new Error("edges must be a list of valid connections.");
  if (value.length > WORKFLOW_LIMITS.edges) {
    throw new Error(`A workflow has at most ${WORKFLOW_LIMITS.edges} connections.`);
  }
  return [...value];
}

function optionalText(value: unknown, name: string, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isString(value) || value.length > maxLength)
    throw new Error(`${name} must be a text of at most ${maxLength} characters.`);
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isBoolean(value)) throw new Error("paused must be true or false.");
  return value;
}
