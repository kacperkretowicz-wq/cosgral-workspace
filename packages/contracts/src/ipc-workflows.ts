// COSGRAL W3: workflows (spec-w2 §7, parity row 28).
//
// A workflow is a small graph a person draws on a canvas: one trigger, then steps. Each step has a
// position (x, y) for the canvas and leads to the next one through a connection ("edge").
//
// Steps:
//   trigger         starts a run: by hand, or when a routine (W2) starts a run.
//   agent           asks one agent to do something; the agent's last reply is the step's output.
//   approval        a card in Needs you (the confirm card: Confirm / Edit / Cancel) under that agent's row.
//                   Confirm continues on the "allow" connection. Edit, Cancel or a closed card continue on the
//                   "deny" connection, or end the run as "denied" when there is none.
//   channel-output  posts a program message (kind "system") into a channel.
//
// Texts of steps may use {{input}} (what the person typed when running, or the routine run's summary),
// {{previous}} (output of the step before) and {{steps.<stepId>}} (output of any earlier step).
// Unknown names stay empty. Texts that come from outside (input, replies) are data, never instructions.
//
// A run follows the connections from the trigger. A workflow runs once at a time; another start is refused.
// A run that was open when the program stopped ends as "failed" after the restart (open cards do not survive).
// Everything stays on this computer. Saved workflows and the last runs survive a restart.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const WORKFLOW_LIMITS = {
  workflows: 64,
  name: 80,
  description: 500,
  nodes: 30,
  edges: 60,
  /** Step and connection ids: lowercase letter first, then lowercase letters, digits and dashes. */
  idLength: 40,
  title: 80,
  /** Instruction of an agent step. */
  prompt: 4_000,
  /** Text of an approval card or a channel output. */
  text: 2_000,
  /** What a person types when starting a run. */
  input: 8_000,
  /** Stored output of one step (longer outputs are cut). */
  output: 20_000,
  /** Runs kept per workflow (oldest dropped). */
  runsKept: 100,
} as const;

export const WORKFLOW_NODE_TYPES = ["trigger", "agent", "approval", "channel-output"] as const;
export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export const WORKFLOW_EDGE_KINDS = ["next", "allow", "deny"] as const;
export type WorkflowEdgeKind = (typeof WORKFLOW_EDGE_KINDS)[number];

export const WORKFLOW_RUN_STATUSES = ["running", "waiting", "done", "failed", "denied", "cancelled"] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export const WORKFLOW_STEP_STATUSES = ["pending", "running", "waiting", "done", "failed", "denied", "skipped"] as const;
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];

export const WORKFLOW_RUN_CAUSES = ["manual", "routine"] as const;
export type WorkflowRunCause = (typeof WORKFLOW_RUN_CAUSES)[number];

export type WorkflowTrigger = { kind: "manual" } | { kind: "routine"; routineId: string };

interface WorkflowNodeBase {
  id: string;
  title: string;
  /** Canvas position. */
  x: number;
  y: number;
}

export type WorkflowNode =
  | (WorkflowNodeBase & { type: "trigger"; trigger: WorkflowTrigger })
  | (WorkflowNodeBase & { type: "agent"; botId: string; prompt: string })
  /** `botId`: the agent whose row shows the approval card in Needs you. */
  | (WorkflowNodeBase & { type: "approval"; botId: string; text: string })
  | (WorkflowNodeBase & { type: "channel-output"; channelId: string; text: string });

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  /** "next" leaves a trigger, agent or channel-output step; "allow" / "deny" leave an approval. */
  on: WorkflowEdgeKind;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowRunSummary {
  runId: string;
  status: WorkflowRunStatus;
  startedAt: string;
}

export interface Workflow extends WorkflowGraph {
  id: string;
  name: string;
  description: string;
  /** A paused workflow starts neither by hand nor from its routine. */
  paused: boolean;
  createdAt: string;
  updatedAt: string;
  /** The newest run, null before the first. */
  lastRun: WorkflowRunSummary | null;
}

export interface WorkflowStepRun {
  nodeId: string;
  title: string;
  type: WorkflowNodeType;
  status: WorkflowStepStatus;
  /** Reply of the agent, the approval decision, or the posted text; null until the step finishes. */
  output: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  cause: WorkflowRunCause;
  status: WorkflowRunStatus;
  input: string;
  /** In the order the steps ran or will run; steps not reached stay "pending" or become "skipped". */
  steps: WorkflowStepRun[];
  /** Output of the last step that ran; null while nothing finished. */
  result: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CreateWorkflowInput extends WorkflowGraph {
  name: string;
  description?: string;
  paused?: boolean;
}

/** Fields left out stay as they are; the changed workflow is checked as a whole. */
export interface UpdateWorkflowInput {
  workflowId: string;
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  paused?: boolean;
}

export interface WorkflowIdInput {
  workflowId: string;
}

export interface RunWorkflowInput {
  workflowId: string;
  /** Becomes {{input}}. */
  input?: string;
}

export interface WorkflowRunIdInput {
  runId: string;
}

const ID = /^[a-z][a-z0-9-]*$/;

export function isWorkflowId(value: unknown): value is string {
  return isString(value) && value.length <= WORKFLOW_LIMITS.idLength && ID.test(value);
}

function isTrigger(value: unknown): value is WorkflowTrigger {
  return (
    isDynamicRecord(value) &&
    (value.kind === "manual" || (value.kind === "routine" && isString(value.routineId) && value.routineId !== ""))
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isWorkflowNode(value: unknown): value is WorkflowNode {
  if (
    !isDynamicRecord(value) ||
    !isWorkflowId(value.id) ||
    !isString(value.title) ||
    !isNumber(value.x) ||
    !isNumber(value.y) ||
    !isOneOf(WORKFLOW_NODE_TYPES, value.type)
  ) {
    return false;
  }
  switch (value.type) {
    case "trigger":
      return isTrigger(value.trigger);
    case "agent":
      return isString(value.botId) && isString(value.prompt);
    case "approval":
      return isString(value.botId) && isString(value.text);
    case "channel-output":
      return isString(value.channelId) && isString(value.text);
  }
}

export function isWorkflowEdge(value: unknown): value is WorkflowEdge {
  return (
    isDynamicRecord(value) &&
    isWorkflowId(value.id) &&
    isWorkflowId(value.from) &&
    isWorkflowId(value.to) &&
    isOneOf(WORKFLOW_EDGE_KINDS, value.on)
  );
}

function isRunSummary(value: unknown): value is WorkflowRunSummary {
  return (
    isDynamicRecord(value) &&
    isString(value.runId) &&
    isOneOf(WORKFLOW_RUN_STATUSES, value.status) &&
    isString(value.startedAt)
  );
}

export function isWorkflow(value: unknown): value is Workflow {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.description) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isWorkflowNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isWorkflowEdge) &&
    isBoolean(value.paused) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    (value.lastRun === null || isRunSummary(value.lastRun))
  );
}

function isStepRun(value: unknown): value is WorkflowStepRun {
  return (
    isDynamicRecord(value) &&
    isString(value.nodeId) &&
    isString(value.title) &&
    isOneOf(WORKFLOW_NODE_TYPES, value.type) &&
    isOneOf(WORKFLOW_STEP_STATUSES, value.status) &&
    isNullableString(value.output) &&
    isNullableString(value.error) &&
    isNullableString(value.startedAt) &&
    isNullableString(value.finishedAt)
  );
}

export function isWorkflowRun(value: unknown): value is WorkflowRun {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.workflowId) &&
    isString(value.workflowName) &&
    isOneOf(WORKFLOW_RUN_CAUSES, value.cause) &&
    isOneOf(WORKFLOW_RUN_STATUSES, value.status) &&
    isString(value.input) &&
    Array.isArray(value.steps) &&
    value.steps.every(isStepRun) &&
    isNullableString(value.result) &&
    isNullableString(value.error) &&
    isString(value.startedAt) &&
    isNullableString(value.finishedAt)
  );
}

function label(node: WorkflowNode): string {
  return `"${node.title}" (${node.id})`;
}

/**
 * What is wrong with a graph, in plain words; an empty list means it can be saved and run.
 * The canvas can call this on every change. It checks the shape only: whether the agents and channels
 * exist is checked when the workflow is saved.
 */
export function workflowProblems(graph: WorkflowGraph): string[] {
  const problems: string[] = [];
  const { nodes, edges } = graph;
  if (nodes.length > WORKFLOW_LIMITS.nodes) problems.push(`At most ${WORKFLOW_LIMITS.nodes} steps.`);
  if (edges.length > WORKFLOW_LIMITS.edges) problems.push(`At most ${WORKFLOW_LIMITS.edges} connections.`);
  const triggers = nodes.filter((node) => node.type === "trigger");
  if (triggers.length !== 1) problems.push("A workflow has exactly one trigger.");

  const byId = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) problems.push(`Two steps have the same id: ${node.id}.`);
    byId.set(node.id, node);
  }
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) problems.push(`Two connections have the same id: ${edge.id}.`);
    edgeIds.add(edge.id);
  }
  if (nodes.length === 1 && triggers.length === 1) {
    problems.push("A workflow needs at least one step after the trigger.");
  }

  const valid: WorkflowEdge[] = [];
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      problems.push(`Connection ${edge.id} points to an unknown step.`);
      continue;
    }
    valid.push(edge);
    if (from.type === "approval" ? edge.on === "next" : edge.on !== "next") {
      problems.push(
        from.type === "approval"
          ? `Connection ${edge.id} leaves the approval ${label(from)}: use "allow" or "deny".`
          : `Connection ${edge.id} leaves ${label(from)}: use "next".`,
      );
    }
    if (to.type === "trigger") problems.push(`The trigger cannot have incoming connections (${edge.id}).`);
  }

  for (const node of nodes) {
    const leaving = valid.filter((edge) => edge.from === node.id);
    if (node.type === "approval") {
      const allow = leaving.filter((edge) => edge.on === "allow").length;
      const deny = leaving.filter((edge) => edge.on === "deny").length;
      if (allow === 0) problems.push(`The approval ${label(node)} needs an Allow connection.`);
      if (allow > 1 || deny > 1) problems.push(`The approval ${label(node)} has more than one way on for a decision.`);
    } else if (leaving.length > 1) {
      problems.push(`${label(node)} has more than one way on; keep one connection.`);
    }
  }

  if (triggers.length === 1) {
    const start = triggers[0];
    if (start) {
      const seen = new Set<string>([start.id]);
      const queue = [start.id];
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        for (const edge of valid) {
          if (edge.from === id && !seen.has(edge.to)) {
            seen.add(edge.to);
            queue.push(edge.to);
          }
        }
      }
      const lost = nodes.filter((node) => !seen.has(node.id));
      if (lost.length > 0) {
        problems.push(`These steps are not reachable from the trigger: ${lost.map(label).join(", ")}.`);
      }
    }
  }

  const state = new Map<string, "open" | "closed">();
  const visit = (id: string): boolean => {
    state.set(id, "open");
    for (const edge of valid) {
      if (edge.from !== id) continue;
      const next = state.get(edge.to);
      if (next === "open" || (next === undefined && visit(edge.to))) return true;
    }
    state.set(id, "closed");
    return false;
  };
  if (nodes.some((node) => state.get(node.id) === undefined && visit(node.id))) {
    problems.push("The connections form a loop; a run must always move forward.");
  }
  return problems;
}
