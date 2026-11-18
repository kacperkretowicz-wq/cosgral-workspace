// COSGRAL W12-KK: what the Workflows page needs besides the graph itself (screens "Workflows", "empty canvas", "Add trigger", "Add node").
//
// The page draws a canvas with a trigger card ("Schedule · Daily on Every day at 9 AM · Next run · Run now"), a node picker (Inputs, Steps,
// Flow) with a search box, a "Run workflow" button and undo/redo. Everything here is a PURE function or a fixed list, so the program, the
// window and the demo (Storybook, preview) show the same thing. Texts are English sources; the window translates them.
//
// What this version does not have (listed with a reason instead of a dead button): a separate Prompt node, Asset, LLM, Image and Video
// nodes, a Condition node, and the drawing tools of the canvas (pencil, shapes, sticky notes, text). Agent, Approval and Output (a channel
// message) are the steps we run.

import type { Routine, RoutineSchedule } from "./ipc-routines";
import {
  connectionKindsOf,
  WORKFLOW_LIMITS,
  type Workflow,
  type WorkflowConditionOperator,
  type WorkflowEdge,
  type WorkflowEdgeKind,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeType,
  type WorkflowRun,
  type WorkflowRunStatus,
  workflowOperatorNeedsValue,
  workflowProblems,
} from "./ipc-workflows";

// ---------------------------------------------------------------------------------------------------------------------------------
// The node picker ("Add node")
// ---------------------------------------------------------------------------------------------------------------------------------

export const WORKFLOW_PALETTE_GROUPS = [
  { id: "inputs", label: "Inputs" },
  { id: "steps", label: "Steps" },
  { id: "flow", label: "Flow" },
] as const;
export type WorkflowPaletteGroup = (typeof WORKFLOW_PALETTE_GROUPS)[number]["id"];

export interface WorkflowPaletteEntry {
  id: string;
  group: WorkflowPaletteGroup;
  label: string;
  /** The step this entry adds, null when this version does not have it. */
  type: WorkflowNodeType | null;
  /** One line under the label. */
  hint: string;
  available: boolean;
  /** Why it cannot be added now (not offered, one trigger only, step limit); null when it can. */
  reason: string | null;
}

const NOT_OFFERED = (what: string): string => `${what} is not part of this version.`;

/** Every entry the picker shows, in the order of the page. `type: null` entries are shown dimmed with their reason. */
export const WORKFLOW_PALETTE: readonly WorkflowPaletteEntry[] = [
  {
    id: "trigger",
    group: "inputs",
    label: "Trigger",
    type: "trigger",
    hint: "Starts a run by hand, on a schedule or from a webhook.",
    available: true,
    reason: null,
  },
  {
    id: "prompt",
    group: "inputs",
    label: "Prompt",
    type: "prompt",
    hint: "A fixed text that goes into the next step.",
    available: true,
    reason: null,
  },
  {
    id: "asset",
    group: "inputs",
    label: "Asset",
    type: null,
    hint: "A file for the next step.",
    available: false,
    reason: "Files are not passed between steps in this version.",
  },
  {
    id: "llm",
    group: "steps",
    label: "LLM",
    type: null,
    hint: "A model call without an agent.",
    available: false,
    reason: "Use an Agent step: it runs the instruction with that agent's model.",
  },
  {
    id: "agent",
    group: "steps",
    label: "Agent",
    type: "agent",
    hint: "Asks one agent to do something; its last reply is the output.",
    available: true,
    reason: null,
  },
  {
    id: "image",
    group: "steps",
    label: "Image",
    type: null,
    hint: "Makes an image.",
    available: false,
    reason: NOT_OFFERED("Making images"),
  },
  {
    id: "video",
    group: "steps",
    label: "Video",
    type: null,
    hint: "Makes a video.",
    available: false,
    reason: NOT_OFFERED("Making videos"),
  },
  {
    id: "condition",
    group: "flow",
    label: "Condition",
    type: "condition",
    hint: "Goes the Yes way or the No way by comparing a text with a value.",
    available: true,
    reason: null,
  },
  {
    id: "approval",
    group: "flow",
    label: "Approval",
    type: "approval",
    hint: "A card in Needs you: Allow or Deny decides the way on.",
    available: true,
    reason: null,
  },
  {
    id: "output",
    group: "flow",
    label: "Output",
    type: "channel-output",
    hint: "Posts a message into a channel.",
    available: true,
    reason: null,
  },
];

export interface WorkflowPaletteSection {
  group: WorkflowPaletteGroup;
  label: string;
  entries: WorkflowPaletteEntry[];
}

/**
 * The picker for the graph as it is now: the trigger is dimmed once there is one, and every entry is dimmed at the step limit.
 * `query` filters by label (case does not matter); groups without a match are left out.
 */
export function workflowPalette(graph: WorkflowGraph, query = ""): WorkflowPaletteSection[] {
  const needle = query.trim().toLowerCase();
  const hasTrigger = graph.nodes.some((node) => node.type === "trigger");
  const full = graph.nodes.length >= WORKFLOW_LIMITS.nodes;
  const sections: WorkflowPaletteSection[] = [];
  for (const group of WORKFLOW_PALETTE_GROUPS) {
    const entries = WORKFLOW_PALETTE.filter(
      (entry) => entry.group === group.id && (needle === "" || entry.label.toLowerCase().includes(needle)),
    ).map((entry): WorkflowPaletteEntry => {
      if (entry.type === null) return { ...entry };
      if (full) return { ...entry, available: false, reason: `At most ${WORKFLOW_LIMITS.nodes} steps.` };
      if (entry.type === "trigger" && hasTrigger) {
        return { ...entry, available: false, reason: "A workflow has exactly one trigger." };
      }
      if (entry.type !== "trigger" && !hasTrigger) {
        return { ...entry, available: false, reason: "Start with a trigger." };
      }
      return { ...entry };
    });
    if (entries.length > 0) sections.push({ group: group.id, label: group.label, entries });
  }
  return sections;
}

/** What the canvas shows in the middle: nothing once there are steps. */
export function workflowCanvasPrompt(graph: WorkflowGraph) {
  if (graph.nodes.length === 0) return { title: "Start with a trigger", action: "Add trigger" };
  if (graph.nodes.length === 1 && graph.nodes[0]?.type === "trigger") {
    return { title: "Add the first step", action: "Add node" };
  }
  return null;
}

/** What the page lists that this version cannot do on the canvas, with a reason (drawing tools of the toolbar). */
export const WORKFLOW_EDITOR_UNAVAILABLE: readonly { id: string; label: string; reason: string }[] = [
  {
    id: "drawing",
    label: "Drawing, shapes, sticky notes and text on the canvas",
    reason: "Only steps and connections are saved with a workflow; marks drawn on the canvas would be lost.",
  },
  {
    id: "versions",
    label: "Workflow versions",
    reason: "A workflow keeps its latest saved state and the last 100 runs; there is no version history.",
  },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// The trigger card
// ---------------------------------------------------------------------------------------------------------------------------------

export const WORKFLOW_TRIGGER_CHOICES = [
  { id: "manual", label: "Manual", hint: "Starts when you press Run.", routineTrigger: null },
  { id: "schedule", label: "Schedule", hint: "Starts when a schedule routine runs.", routineTrigger: "schedule" },
  { id: "webhook", label: "Webhook", hint: "Starts when a webhook routine gets a message.", routineTrigger: "webhook" },
] as const;
export type WorkflowTriggerChoiceId = (typeof WORKFLOW_TRIGGER_CHOICES)[number]["id"];

export interface ScheduleParts {
  /** "Daily", "Every 15 minutes", "Cron". */
  frequency: string;
  /** "Every day", "Mon, Wed", or the cron expression; empty for an interval. */
  on: string;
  /** "9 AM", "5:30 PM"; empty for an interval and for cron. */
  at: string;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "17:30" → "5:30 PM", "09:00" → "9 AM". A value that is not HH:MM comes back as it is. */
export function formatClockTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return time;
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${twelve} ${suffix}` : `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** The three chips of the schedule card ("Daily" on "Every day" at "9 AM"). */
export function describeSchedule(schedule: RoutineSchedule): ScheduleParts {
  if (schedule.type === "interval") {
    const minutes = schedule.everyMinutes;
    if (minutes % 1440 === 0) {
      const days = minutes / 1440;
      return { frequency: days === 1 ? "Every day" : `Every ${days} days`, on: "", at: "" };
    }
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return { frequency: hours === 1 ? "Every hour" : `Every ${hours} hours`, on: "", at: "" };
    }
    return { frequency: minutes === 1 ? "Every minute" : `Every ${minutes} minutes`, on: "", at: "" };
  }
  if (schedule.type === "daily") {
    const days = [...new Set(schedule.weekdays ?? [])].filter((day) => day >= 0 && day <= 6).sort((a, b) => a - b);
    const on = days.length === 0 || days.length === 7 ? "Every day" : days.map((day) => WEEKDAY_NAMES[day]).join(", ");
    return { frequency: "Daily", on, at: formatClockTime(schedule.time) };
  }
  return { frequency: "Cron", on: schedule.expression, at: "" };
}

export interface WorkflowTriggerCard {
  choice: WorkflowTriggerChoiceId;
  /** The routine behind a Schedule or Webhook trigger; null for Manual or when it is gone. */
  routine: Routine | null;
  /** The routine was deleted after the trigger was drawn. */
  routineMissing: boolean;
  /** Schedule triggers only. */
  schedule: ScheduleParts | null;
  /** The routine's next start (ISO), null for manual, paused and webhook triggers. */
  nextRunAt: string | null;
  /** A webhook trigger shows where it listens. */
  webhookUrl: string | null;
  /** "Run now" is for a person starting the workflow; it needs a workflow that can run. */
  canRunNow: boolean;
  /** Why not. */
  reason: string | null;
}

/** The card of a trigger step: pass the workflow's routine list and whether the workflow can run (see `workflowRunState`). */
export function workflowTriggerCard(
  node: Extract<WorkflowNode, { type: "trigger" }>,
  routines: readonly Routine[],
  runState: { canRun: boolean; reason: string | null },
): WorkflowTriggerCard {
  const trigger = node.trigger;
  if (trigger.kind === "manual") {
    return {
      choice: "manual",
      routine: null,
      routineMissing: false,
      schedule: null,
      nextRunAt: null,
      webhookUrl: null,
      canRunNow: runState.canRun,
      reason: runState.reason,
    };
  }
  const routine = routines.find((item) => item.id === trigger.routineId) ?? null;
  const choice: WorkflowTriggerChoiceId = routine?.trigger === "webhook" ? "webhook" : "schedule";
  return {
    choice,
    routine,
    routineMissing: routine === null,
    schedule: routine?.schedule ? describeSchedule(routine.schedule) : null,
    nextRunAt: routine?.paused ? null : (routine?.nextRunAt ?? null),
    webhookUrl: routine?.webhook?.url ?? null,
    canRunNow: runState.canRun,
    reason: runState.reason,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Building the graph (every function returns a new graph and leaves the old one as it was)
// ---------------------------------------------------------------------------------------------------------------------------------

export const NEW_WORKFLOW_NAME = "Untitled workflow";

export function emptyWorkflowGraph(): WorkflowGraph {
  return { nodes: [], edges: [] };
}

const NODE_TITLES: Record<WorkflowNodeType, string> = {
  trigger: "Trigger",
  agent: "Agent",
  approval: "Approval",
  "channel-output": "Output",
  prompt: "Prompt",
  condition: "Condition",
};
const NODE_WIDTH = 280;

function uniqueId(taken: ReadonlySet<string>, base: string): string {
  if (!taken.has(base)) return base;
  for (let number = 2; ; number += 1) {
    const candidate = `${base}-${number}`.slice(0, WORKFLOW_LIMITS.idLength);
    if (!taken.has(candidate)) return candidate;
  }
}

function uniqueTitle(nodes: readonly WorkflowNode[], base: string): string {
  const titles = new Set(nodes.map((node) => node.title));
  if (!titles.has(base)) return base;
  for (let number = 2; ; number += 1) {
    if (!titles.has(`${base} ${number}`)) return `${base} ${number}`;
  }
}

/** The step a new one follows: the last one that has no way on yet (an approval counts until it has Allow, a condition until it has Yes). */
function tailOf(graph: WorkflowGraph): WorkflowNode | null {
  for (let index = graph.nodes.length - 1; index >= 0; index -= 1) {
    const node = graph.nodes[index];
    if (!node) continue;
    const leaving = graph.edges.filter((edge) => edge.from === node.id);
    const first = firstKindOf(node);
    if (first === "next" ? leaving.length === 0 : !leaving.some((edge) => edge.on === first)) return node;
  }
  return null;
}

/** The connection a step needs first: "next", "allow" for an approval, "yes" for a condition. */
function firstKindOf(node: WorkflowNode): WorkflowEdgeKind {
  return connectionKindsOf(node)[0] ?? "next";
}

/** The kind of the next connection drawn from a step that has `existing` ones: Allow then Deny, Yes then No, else Next. */
function nextKindFor(node: WorkflowNode, existing: readonly WorkflowEdge[]): WorkflowEdgeKind {
  const [first, second] = connectionKindsOf(node);
  if (second === undefined) return first ?? "next";
  return existing.some((edge) => edge.from === node.id && edge.on === first) ? second : (first ?? "next");
}

export interface AddWorkflowNodeOptions {
  title?: string;
  x?: number;
  y?: number;
  /** Agent and Approval steps. */
  botId?: string;
  prompt?: string;
  text?: string;
  /** Output step. */
  channelId?: string;
  /** Condition step (defaults: {{previous}} contains an empty value, case does not matter). */
  subject?: string;
  operator?: WorkflowConditionOperator;
  value?: string;
  caseSensitive?: boolean;
  /** Trigger: a Schedule or Webhook trigger names its routine; none = manual. */
  routineId?: string;
  /** The step this one follows (a connection is drawn). Default: the last open end. `null` = do not connect. */
  after?: string | null;
}

/**
 * "Add node": a new step with a free id and title, placed to the right of the one it follows, connected to it. Refused with a plain
 * sentence at the limit, for a second trigger, and for any other step before the trigger.
 */
export function addWorkflowNode(
  graph: WorkflowGraph,
  type: WorkflowNodeType,
  options: AddWorkflowNodeOptions = {},
): WorkflowGraph {
  if (graph.nodes.length >= WORKFLOW_LIMITS.nodes) throw new Error(`At most ${WORKFLOW_LIMITS.nodes} steps.`);
  const hasTrigger = graph.nodes.some((node) => node.type === "trigger");
  if (type === "trigger" && hasTrigger) throw new Error("A workflow has exactly one trigger.");
  if (type !== "trigger" && !hasTrigger) throw new Error("Start with a trigger.");

  const taken = new Set(graph.nodes.map((node) => node.id));
  const id = uniqueId(taken, type === "channel-output" ? "output" : type);
  const title = (options.title ?? "").trim() || uniqueTitle(graph.nodes, NODE_TITLES[type]);
  const follow =
    options.after === null
      ? null
      : options.after === undefined
        ? tailOf(graph)
        : (graph.nodes.find((node) => node.id === options.after) ?? null);
  if (options.after && !follow) throw new Error("The step to follow does not exist.");
  const x = options.x ?? (follow ? follow.x + NODE_WIDTH : 0);
  const y = options.y ?? (follow ? follow.y : 0);

  let node: WorkflowNode;
  switch (type) {
    case "trigger":
      node = {
        id,
        type,
        title,
        x,
        y,
        trigger: options.routineId ? { kind: "routine", routineId: options.routineId } : { kind: "manual" },
      };
      break;
    case "agent":
      node = { id, type, title, x, y, botId: options.botId ?? "", prompt: options.prompt ?? "" };
      break;
    case "approval":
      node = { id, type, title, x, y, botId: options.botId ?? "", text: options.text ?? "" };
      break;
    case "channel-output":
      node = { id, type, title, x, y, channelId: options.channelId ?? "", text: options.text ?? "" };
      break;
    case "prompt":
      node = { id, type, title, x, y, text: options.text ?? "" };
      break;
    case "condition":
      node = {
        id,
        type,
        title,
        x,
        y,
        subject: options.subject ?? "{{previous}}",
        operator: options.operator ?? "contains",
        value: options.value ?? "",
        caseSensitive: options.caseSensitive ?? false,
      };
      break;
  }

  const edges = [...graph.edges];
  if (follow) {
    const on = nextKindFor(follow, edges);
    edges.push({
      id: uniqueId(new Set(edges.map((edge) => edge.id)), `${follow.id}-${id}`),
      from: follow.id,
      to: id,
      on,
    });
  }
  return { nodes: [...graph.nodes, node], edges };
}

/** Takes a step out with its connections; a step with one way in and one way out is bridged so the chain stays whole. */
export function removeWorkflowNode(graph: WorkflowGraph, nodeId: string): WorkflowGraph {
  if (!graph.nodes.some((node) => node.id === nodeId)) throw new Error("This step does not exist.");
  const incoming = graph.edges.filter((edge) => edge.to === nodeId);
  const outgoing = graph.edges.filter((edge) => edge.from === nodeId);
  const edges = graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  const from = incoming[0];
  const to = outgoing[0];
  if (incoming.length === 1 && outgoing.length === 1 && from && to && from.from !== to.to) {
    edges.push({
      id: uniqueId(new Set(edges.map((edge) => edge.id)), `${from.from}-${to.to}`),
      from: from.from,
      to: to.to,
      on: from.on,
    });
  }
  return { nodes: graph.nodes.filter((node) => node.id !== nodeId), edges };
}

/** Draws a connection; a step has one way on per kind, so an existing one of the same kind from that step is replaced. */
export function connectWorkflowNodes(
  graph: WorkflowGraph,
  from: string,
  to: string,
  on?: WorkflowEdgeKind,
): WorkflowGraph {
  const source = graph.nodes.find((node) => node.id === from);
  if (!source || !graph.nodes.some((node) => node.id === to)) throw new Error("This step does not exist.");
  if (from === to) throw new Error("A step cannot lead to itself.");
  const kind: WorkflowEdgeKind = on ?? nextKindFor(source, graph.edges);
  const kept = graph.edges.filter((edge) => !(edge.from === from && edge.on === kind));
  const edge: WorkflowEdge = {
    id: uniqueId(new Set(kept.map((item) => item.id)), `${from}-${to}`),
    from,
    to,
    on: kind,
  };
  return { nodes: graph.nodes, edges: [...kept, edge] };
}

export function moveWorkflowNode(graph: WorkflowGraph, nodeId: string, x: number, y: number): WorkflowGraph {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("The position is not valid.");
  if (!graph.nodes.some((node) => node.id === nodeId)) throw new Error("This step does not exist.");
  return { nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node)), edges: graph.edges };
}

/** Undo and redo of the canvas (the arrows beside the title). Snapshots of the whole graph, newest last. */
export interface WorkflowHistory {
  current: () => WorkflowGraph;
  /** A change the person made; drops what could be redone. */
  push: (graph: WorkflowGraph) => void;
  undo: () => WorkflowGraph;
  redo: () => WorkflowGraph;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export function createWorkflowHistory(initial: WorkflowGraph, limit = 50): WorkflowHistory {
  const frames: WorkflowGraph[] = [structuredClone(initial)];
  let position = 0;
  const at = (): WorkflowGraph => structuredClone(frames[position] ?? initial);
  return {
    current: at,
    push: (graph) => {
      frames.splice(position + 1);
      frames.push(structuredClone(graph));
      if (frames.length > limit) frames.shift();
      position = frames.length - 1;
    },
    undo: () => {
      position = Math.max(0, position - 1);
      return at();
    },
    redo: () => {
      position = Math.min(frames.length - 1, position + 1);
      return at();
    },
    canUndo: () => position > 0,
    canRedo: () => position < frames.length - 1,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Problems shown on the canvas
// ---------------------------------------------------------------------------------------------------------------------------------

export interface KnownWorkflowTargets {
  botIds: readonly string[];
  channelIds: readonly string[];
  routineIds: readonly string[];
}

export interface WorkflowNodeIssue {
  nodeId: string;
  message: string;
}

/**
 * What a step still needs before the workflow can be saved: the same checks and sentences the program makes on save, so the canvas can
 * put a badge on the step while the person types. (`workflowProblems` covers the shape of the whole graph.)
 */
export function workflowNodeIssues(graph: WorkflowGraph, known: KnownWorkflowTargets): WorkflowNodeIssue[] {
  const issues: WorkflowNodeIssue[] = [];
  for (const node of graph.nodes) {
    const title = node.title.trim();
    if (!title || title.length > WORKFLOW_LIMITS.title) {
      issues.push({ nodeId: node.id, message: `Every step needs a title (1–${WORKFLOW_LIMITS.title} characters).` });
    }
    if (
      node.type === "trigger" &&
      node.trigger.kind === "routine" &&
      !known.routineIds.includes(node.trigger.routineId)
    ) {
      issues.push({
        nodeId: node.id,
        message: `The routine "${node.trigger.routineId}" in the trigger does not exist.`,
      });
    }
    if (node.type === "agent" || node.type === "approval") {
      if (!node.botId) {
        issues.push({ nodeId: node.id, message: `Step "${title}" needs an agent.` });
      } else if (!known.botIds.includes(node.botId)) {
        issues.push({ nodeId: node.id, message: `The agent "${node.botId}" in step "${title}" does not exist.` });
      }
      const text = node.type === "agent" ? node.prompt : node.text;
      const limit = node.type === "agent" ? WORKFLOW_LIMITS.prompt : WORKFLOW_LIMITS.text;
      if (!text.trim()) {
        issues.push({
          nodeId: node.id,
          message: `Step "${title}" needs ${node.type === "agent" ? "an instruction" : "a text"}.`,
        });
      } else if (text.length > limit) {
        issues.push({ nodeId: node.id, message: `Step "${title}": the text is longer than ${limit} characters.` });
      }
    }
    if (node.type === "prompt") {
      if (!node.text.trim()) {
        issues.push({ nodeId: node.id, message: `Step "${title}" needs a text.` });
      } else if (node.text.length > WORKFLOW_LIMITS.text) {
        issues.push({
          nodeId: node.id,
          message: `Step "${title}": the text is longer than ${WORKFLOW_LIMITS.text} characters.`,
        });
      }
    }
    if (node.type === "condition") {
      if (!node.subject.trim()) {
        issues.push({ nodeId: node.id, message: `Step "${title}" needs a text to check.` });
      } else if (node.subject.length > WORKFLOW_LIMITS.text) {
        issues.push({
          nodeId: node.id,
          message: `Step "${title}": the text is longer than ${WORKFLOW_LIMITS.text} characters.`,
        });
      }
      if (workflowOperatorNeedsValue(node.operator) && !node.value.trim()) {
        issues.push({ nodeId: node.id, message: `Step "${title}" needs a value to compare with.` });
      } else if (node.value.length > WORKFLOW_LIMITS.conditionValue) {
        issues.push({
          nodeId: node.id,
          message: `Step "${title}": the value is longer than ${WORKFLOW_LIMITS.conditionValue} characters.`,
        });
      }
    }
    if (node.type === "channel-output") {
      if (!node.channelId) {
        issues.push({ nodeId: node.id, message: `Step "${title}" needs a channel.` });
      } else if (!known.channelIds.includes(node.channelId)) {
        issues.push({ nodeId: node.id, message: `The channel "${node.channelId}" in step "${title}" does not exist.` });
      }
      if (!node.text.trim()) {
        issues.push({ nodeId: node.id, message: `Step "${title}" needs a text.` });
      } else if (node.text.length > WORKFLOW_LIMITS.text) {
        issues.push({
          nodeId: node.id,
          message: `Step "${title}": the text is longer than ${WORKFLOW_LIMITS.text} characters.`,
        });
      }
    }
  }
  return issues;
}

export interface WorkflowDraftCheck {
  /** Whole-graph problems (one trigger, loops, unreachable steps). */
  graphProblems: string[];
  /** Per-step problems; draw a badge on the step. */
  nodeIssues: WorkflowNodeIssue[];
  /** Save is allowed: nothing is wrong. */
  canSave: boolean;
}

/** One call for the canvas on every change. An empty canvas is not an error: it shows "Start with a trigger". */
export function checkWorkflowDraft(graph: WorkflowGraph, known: KnownWorkflowTargets): WorkflowDraftCheck {
  const graphProblems = graph.nodes.length === 0 ? [] : workflowProblems(graph);
  const nodeIssues = workflowNodeIssues(graph, known);
  return {
    graphProblems,
    nodeIssues,
    canSave: graph.nodes.length > 0 && graphProblems.length === 0 && nodeIssues.length === 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------------------------------------------

export interface WorkflowRunState {
  canRun: boolean;
  /** Why "Run workflow" is disabled; null when it can run. */
  reason: string | null;
  /** A run is open (running, or waiting for a person). */
  running: boolean;
}

/** The state of the "Run workflow" and "Run now" buttons for a saved workflow. */
export function workflowRunState(workflow: Workflow): WorkflowRunState {
  const status = workflow.lastRun?.status;
  const running = status === "running" || status === "waiting";
  if (workflow.paused) return { canRun: false, reason: "This workflow is paused.", running };
  if (running) return { canRun: false, reason: "This workflow is already running.", running };
  const problems = workflowProblems(workflow);
  const first = problems[0];
  if (first) return { canRun: false, reason: `Fix the canvas first: ${first}`, running };
  return { canRun: true, reason: null, running };
}

export type WorkflowBadgeTone = "neutral" | "active" | "waiting" | "success" | "danger";

const RUN_BADGES: Record<WorkflowRunStatus, { label: string; tone: WorkflowBadgeTone }> = {
  running: { label: "Running", tone: "active" },
  waiting: { label: "Waiting for you", tone: "waiting" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  denied: { label: "Denied", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function workflowRunBadge(status: WorkflowRunStatus): { label: string; tone: WorkflowBadgeTone } {
  return RUN_BADGES[status];
}

export interface WorkflowRunProgress {
  /** Steps that finished (done, failed, denied or skipped). */
  finished: number;
  total: number;
  /** "2 of 4 steps". */
  label: string;
  /** The step a run waits on or is running, null otherwise. */
  current: { nodeId: string; title: string; status: "running" | "waiting" } | null;
}

export function workflowRunProgress(run: WorkflowRun): WorkflowRunProgress {
  const total = run.steps.length;
  const finished = run.steps.filter(
    (step) =>
      step.status === "done" || step.status === "failed" || step.status === "denied" || step.status === "skipped",
  ).length;
  const open = run.steps.find((step) => step.status === "running" || step.status === "waiting");
  return {
    finished,
    total,
    label: `${finished} of ${total} step${total === 1 ? "" : "s"}`,
    current:
      open && (open.status === "running" || open.status === "waiting")
        ? { nodeId: open.nodeId, title: open.title, status: open.status }
        : null,
  };
}

/** The words for the operator picker of a condition step. */
export const WORKFLOW_CONDITION_OPERATOR_LABELS: Record<WorkflowConditionOperator, string> = {
  contains: "contains",
  "not-contains": "does not contain",
  equals: "is exactly",
  "not-equals": "is not",
  "starts-with": "starts with",
  "ends-with": "ends with",
  "is-empty": "is empty",
  "is-not-empty": "is not empty",
};

/** The line on a condition card: `{{previous}} contains "approved"`; an empty-test has no value. */
export function describeWorkflowCondition(node: Extract<WorkflowNode, { type: "condition" }>): string {
  const subject = node.subject.trim() === "" ? "…" : node.subject.trim();
  const label = WORKFLOW_CONDITION_OPERATOR_LABELS[node.operator];
  return workflowOperatorNeedsValue(node.operator) ? `${subject} ${label} "${node.value}"` : `${subject} ${label}`;
}
