// COSGRAL W12-KK: versions of a workflow (the "Versions" list of the Workflows page, with Restore).
//
// Every time the graph (steps and connections) of a workflow is saved with a change, the program keeps that state as a numbered
// version: 1 when the workflow is made, then one per change. Renaming, pausing or changing the description is not a new version. The
// last 20 versions are kept; older ones are dropped. The newest version is always the graph the workflow has now.
//
// Restore puts an older graph back as the current one. It is checked like any save (the agents and channels it names must still
// exist, the graph must be valid) and becomes a NEW version that says which one it came from, so nothing is lost and a restore can be
// undone by restoring again. A run that is open keeps the graph it started with.
// A workflow made before versions existed gets its first version the first time it is changed or its versions are listed.
// Everything stays on this computer.

import {
  isWorkflowEdge,
  isWorkflowNode,
  WORKFLOW_NODE_TYPES,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeType,
} from "./ipc-workflows";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const WORKFLOW_VERSION_LIMITS = {
  /** Versions kept per workflow (oldest dropped). */
  kept: 20,
} as const;

export const WORKFLOW_VERSION_REASONS = ["created", "edited", "restored"] as const;
export type WorkflowVersionReason = (typeof WORKFLOW_VERSION_REASONS)[number];

/** A row of the Versions list (no graph). */
export interface WorkflowVersionSummary {
  /** 1, 2, 3 … per workflow; never reused. */
  number: number;
  savedAt: string;
  reason: WorkflowVersionReason;
  /** The version a restore copied; null otherwise. */
  restoredFrom: number | null;
  /** The workflow's name when the version was saved. */
  name: string;
  steps: number;
  connections: number;
  /** "1 trigger, 2 agent steps, 1 approval, 1 output": see `workflowGraphSummary`. */
  summary: string;
  /** The newest version: the graph the workflow has now. */
  current: boolean;
}

/** One version with its graph: for a preview on the canvas and for `diffWorkflowGraphs`. */
export interface WorkflowVersionDetails extends WorkflowVersionSummary, WorkflowGraph {}

export interface WorkflowVersionInput {
  workflowId: string;
  version: number;
}

const TYPE_LABELS: Record<WorkflowNodeType, readonly [string, string]> = {
  trigger: ["trigger", "triggers"],
  agent: ["agent step", "agent steps"],
  approval: ["approval", "approvals"],
  "channel-output": ["output", "outputs"],
  prompt: ["prompt", "prompts"],
  condition: ["condition", "conditions"],
};

/** "1 trigger, 2 agent steps, 1 approval, 1 output" (an empty graph says "empty"). */
export function workflowGraphSummary(graph: WorkflowGraph): string {
  const parts: string[] = [];
  for (const type of WORKFLOW_NODE_TYPES) {
    const count = graph.nodes.filter((node) => node.type === type).length;
    if (count > 0) parts.push(`${count} ${TYPE_LABELS[type][count === 1 ? 0 : 1]}`);
  }
  return parts.length === 0 ? "empty" : parts.join(", ");
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Same steps (content and position) and connections, regardless of their order in the lists. */
export function workflowGraphsEqual(left: WorkflowGraph, right: WorkflowGraph): boolean {
  const byId = <T extends { id: string }>(items: readonly T[]): T[] =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));
  return sameJson(byId(left.nodes), byId(right.nodes)) && sameJson(byId(left.edges), byId(right.edges));
}

export interface WorkflowGraphDiff {
  /** Titles of steps that are only in the newer graph. */
  added: string[];
  /** Titles of steps that are only in the older graph. */
  removed: string[];
  /** Titles of steps in both whose content changed (text, agent, channel, trigger; moving on the canvas is not a change). */
  changed: string[];
  /** The connections differ. */
  connectionsChanged: boolean;
  /** Something besides canvas positions differs. */
  different: boolean;
}

/** The step without its canvas position, as text (to compare content). */
function contentKey(node: WorkflowNode): string {
  const { x: _x, y: _y, ...rest } = node;
  return JSON.stringify(rest);
}

/** What changed from `from` (older) to `to` (newer), in words a list can show: "Added: Output", "Changed: Write the brief". */
export function diffWorkflowGraphs(from: WorkflowGraph, to: WorkflowGraph): WorkflowGraphDiff {
  const before = new Map(from.nodes.map((node) => [node.id, node]));
  const after = new Map(to.nodes.map((node) => [node.id, node]));
  const added = to.nodes.filter((node) => !before.has(node.id)).map((node) => node.title);
  const removed = from.nodes.filter((node) => !after.has(node.id)).map((node) => node.title);
  const changed = to.nodes
    .filter((node) => {
      const old = before.get(node.id);
      return old !== undefined && contentKey(old) !== contentKey(node);
    })
    .map((node) => node.title);
  const edgeKey = (edge: WorkflowEdge): string => `${edge.from}>${edge.to}:${edge.on}`;
  const edgesBefore = from.edges.map(edgeKey).sort();
  const edgesAfter = to.edges.map(edgeKey).sort();
  const connectionsChanged = !sameJson(edgesBefore, edgesAfter);
  return {
    added,
    removed,
    changed,
    connectionsChanged,
    different: added.length > 0 || removed.length > 0 || changed.length > 0 || connectionsChanged,
  };
}

/** One line for the list: "Added: Output. Changed: Write the brief. Connections changed." */
export function describeWorkflowDiff(diff: WorkflowGraphDiff): string {
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`Added: ${diff.added.join(", ")}.`);
  if (diff.removed.length > 0) parts.push(`Removed: ${diff.removed.join(", ")}.`);
  if (diff.changed.length > 0) parts.push(`Changed: ${diff.changed.join(", ")}.`);
  if (diff.connectionsChanged) parts.push("Connections changed.");
  return parts.length === 0 ? "Only positions on the canvas changed." : parts.join(" ");
}

export function isWorkflowVersionSummary(value: unknown): value is WorkflowVersionSummary {
  return (
    isDynamicRecord(value) &&
    isNumber(value.number) &&
    Number.isInteger(value.number) &&
    value.number >= 1 &&
    isString(value.savedAt) &&
    isOneOf(WORKFLOW_VERSION_REASONS, value.reason) &&
    (value.restoredFrom === null || (isNumber(value.restoredFrom) && Number.isInteger(value.restoredFrom))) &&
    isString(value.name) &&
    isNumber(value.steps) &&
    isNumber(value.connections) &&
    isString(value.summary) &&
    isBoolean(value.current)
  );
}

export function isWorkflowVersionDetails(value: unknown): value is WorkflowVersionDetails {
  return (
    isWorkflowVersionSummary(value) &&
    isDynamicRecord(value) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isWorkflowNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isWorkflowEdge)
  );
}
