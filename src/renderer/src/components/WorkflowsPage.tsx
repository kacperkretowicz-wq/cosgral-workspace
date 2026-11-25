import type {
  KnownWorkflowTargets,
  Workflow,
  WorkflowDraftCheck,
  WorkflowEdgeKind,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowRun,
} from "@openbot/contracts/ipc";
import {
  checkWorkflowDraft,
  connectionKindsOf,
  WORKFLOW_CONDITION_OPERATORS,
  WORKFLOW_EDGE_KINDS,
  workflowOperatorNeedsValue,
  workflowProblems,
} from "@openbot/contracts/ipc";
import type { JSX } from "@solidjs/web";
import { createSignal, For, onCleanup, onSettled, Show } from "solid-js";
import { appLocale, t, tn } from "../i18n";
import { canRedo, canUndo, emptyHistory, type History, record, redo, undo } from "../workflow-history";
import { workflowProblemText } from "../workflow-problems";
import { conditionOperatorLabel, conditionText } from "../workflow-text";
import { Button, Input, NativeSelect, Switch, Textarea } from "./ui";
import {
  Bot,
  Check,
  FileText,
  GitBranch,
  MessageCircle,
  Play,
  Plus,
  Redo2,
  ShieldCheck,
  Trash2,
  Undo2,
  Workflow as WorkflowIcon,
  Zap,
} from "./ui/icons";
import { WorkPage } from "./WorkPage";
import "../styles/workflow-editor.css";
import { WorkflowPreviewCanvas } from "./WorkflowPreviewCanvas";
import { WorkflowVersionsPanel } from "./WorkflowVersionsPanel";

const NODE_TYPE_LABELS: Record<WorkflowNode["type"], string> = {
  trigger: "Trigger",
  agent: "Agent",
  approval: "Approval",
  "channel-output": "Channel output",
  prompt: "Prompt",
  condition: "Condition",
};

const PATH_LABELS: Record<WorkflowEdgeKind, string> = {
  next: "Next",
  allow: "Allow",
  deny: "Deny",
  yes: "Yes",
  no: "No",
};

type StepIcon = (props: { size: number; "stroke-width": number; "aria-hidden": "true" }) => JSX.Element;

/** One icon per step type, the same in the palette, on the step card and in the run history. */
const STEP_ICONS: Record<WorkflowNodeType, StepIcon> = {
  trigger: Zap,
  agent: Bot,
  approval: ShieldCheck,
  "channel-output": MessageCircle,
  prompt: FileText,
  condition: GitBranch,
};

function StepGlyph(props: { type: WorkflowNodeType; size?: number }) {
  const Icon = STEP_ICONS[props.type];
  return <Icon size={props.size ?? 15} stroke-width={1.75} aria-hidden="true" />;
}

const RUN_STATUS_LABELS: Record<WorkflowRun["status"], string> = {
  running: "Running",
  waiting: "Waiting for approval",
  done: "Done",
  failed: "Failed",
  denied: "Denied",
  cancelled: "Cancelled",
};

const STEP_STATUS_LABELS: Record<WorkflowRun["steps"][number]["status"], string> = {
  pending: "Pending",
  running: "Running",
  waiting: "Waiting",
  done: "Done",
  failed: "Failed",
  denied: "Denied",
  skipped: "Skipped",
};

function formatRunTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(appLocale(), { dateStyle: "medium", timeStyle: "short" });
}

const NODE_WIDTH = 260;
const PORT_Y = 28;

function nodePreview(node: WorkflowNode): string {
  if (node.type === "prompt") {
    const text = node.text.trim();
    if (!text) return t("Empty prompt — type the fixed text for the next step.");
    return text.length > 96 ? `${text.slice(0, 93)}…` : text;
  }
  if (node.type === "condition") return conditionText(node);
  return "";
}

const PALETTE: ReadonlyArray<{ type: WorkflowNodeType; label: string }> = [
  { type: "trigger", label: "Add trigger" },
  { type: "agent", label: "Add agent" },
  { type: "approval", label: "Add approval" },
  { type: "channel-output", label: "Add channel output" },
  { type: "prompt", label: "Add prompt" },
  { type: "condition", label: "Add condition" },
];

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const reach = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`;
}

function routineId(node: Extract<WorkflowNode, { type: "trigger" }>): string {
  return node.trigger.kind === "routine" ? node.trigger.routineId : "";
}

type ResourceOption = { id: string; name: string };

/** What a failed call says, in the window language and without Electron's "Error invoking remote method" in front. */
function errorText(error: unknown): string {
  return workflowProblemText(error instanceof Error ? error.message : String(error));
}
export function WorkflowCanvas(
  props: WorkflowGraph & {
    onChange: (graph: WorkflowGraph) => void;
    bots?: ResourceOption[];
    channels?: ResourceOption[];
    routines?: ResourceOption[];
    /**
     * What the page found wrong with the draft (`checkWorkflowDraft`): a step that still needs an agent or a channel, a
     * condition without a value. Without it the canvas only checks the shape of the graph.
     */
    check?: WorkflowDraftCheck;
  },
) {
  // The whole-graph problems and what each step still needs, in one list under the canvas.
  const listedProblems = () =>
    props.check
      ? [...props.check.graphProblems, ...props.check.nodeIssues.map((issue) => issue.message)]
      : workflowProblems(props);
  const [from, setFrom] = createSignal("");
  const [to, setTo] = createSignal("");
  const [edgeKind, setEdgeKind] = createSignal<WorkflowEdgeKind>("next");
  const [connecting, setConnecting] = createSignal<{ from: string; x: number; y: number }>();
  let canvas: HTMLElement | undefined;
  let cancelPointer: (() => void) | undefined;
  onCleanup(() => cancelPointer?.());
  function startDrag(event: PointerEvent, node: WorkflowNode) {
    if (event.button !== 0) return;
    cancelPointer?.();
    event.preventDefault();
    const startX = event.clientX,
      startY = event.clientY,
      initialX = node.x,
      initialY = node.y;
    const move = (e: PointerEvent) => {
      const current = props.nodes.find((item) => item.id === node.id);
      if (current)
        update({
          ...current,
          x: Math.max(0, Math.round(initialX + e.clientX - startX)),
          y: Math.max(0, Math.round(initialY + e.clientY - startY)),
        });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      cancelPointer = undefined;
    };
    cancelPointer = end;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }
  function startConnection(event: PointerEvent, node: WorkflowNode) {
    if (event.button !== 0 || !canvas) return;
    cancelPointer?.();
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const position = (e: PointerEvent) => ({
      x: e.clientX - rect.left + (canvas?.scrollLeft ?? 0),
      y: e.clientY - rect.top + (canvas?.scrollTop ?? 0),
    });
    setConnecting({ from: node.id, ...position(event) });
    const move = (e: PointerEvent) => setConnecting({ from: node.id, ...position(e) });
    const end = (e: PointerEvent) => {
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-workflow-node]")
        ?.getAttribute("data-workflow-node");
      if (target && target !== node.id && props.nodes.some((item) => item.id === target)) {
        props.onChange({
          nodes: props.nodes,
          edges: [
            ...props.edges,
            {
              id: `edge-${Date.now()}`,
              from: node.id,
              to: target,
              on:
                node.type === "approval"
                  ? edgeKind() === "deny"
                    ? "deny"
                    : "allow"
                  : node.type === "condition"
                    ? edgeKind() === "no"
                      ? "no"
                      : "yes"
                    : "next",
            },
          ],
        });
      }
      cancel();
    };
    const cancel = () => {
      setConnecting(undefined);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      cancelPointer = undefined;
    };
    cancelPointer = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
  }
  function update(node: WorkflowNode) {
    props.onChange({ nodes: props.nodes.map((n) => (n.id === node.id ? node : n)), edges: props.edges });
  }
  function add(type: WorkflowNodeType) {
    const base = {
      id: `step-${Date.now()}`,
      // The title is the person's own text; it starts as the step kind in the window language.
      title: t(NODE_TYPE_LABELS[type]),
      // A step card is 260 px wide (workflow-editor.css): 280 px apart leaves a gap, so new steps never cover each other.
      x: 24 + (props.nodes.length % 3) * 280,
      y: 24 + Math.floor(props.nodes.length / 3) * 320,
    };
    const node: WorkflowNode =
      type === "trigger"
        ? { ...base, type, trigger: { kind: "manual" } }
        : type === "agent"
          ? { ...base, type, botId: "", prompt: "" }
          : type === "approval"
            ? { ...base, type, botId: "", text: "" }
            : type === "prompt"
              ? { ...base, type, text: "" }
              : type === "condition"
                ? { ...base, type, subject: "{{previous}}", operator: "contains", value: "", caseSensitive: false }
                : { ...base, type, channelId: "", text: "" };
    props.onChange({ nodes: [...props.nodes, node], edges: props.edges });
  }
  return (
    <section aria-label={t("Workflow editor")}>
      <div class="workflow-palette">
        <For each={PALETTE}>
          {(item) => (
            <Button type="button" class="workflow-palette-button" data-step={item.type} onClick={() => add(item.type)}>
              <StepGlyph type={item.type} />
              {t(item.label)}
            </Button>
          )}
        </For>
      </div>
      <section ref={canvas} class="workflow-canvas" aria-label={t("Workflow canvas")}>
        <Show when={props.nodes.length === 0}>
          <div class="workflow-canvas-empty">
            <span class="workflow-canvas-empty-icon" aria-hidden="true">
              <Zap size={22} stroke-width={1.5} />
            </span>
            <strong>{t("Start with a trigger")}</strong>
            <p>{t("A trigger starts the workflow by hand or on a routine. Then add agents, approvals and outputs.")}</p>
            <Button type="button" variant="primary" onClick={() => add("trigger")}>
              {t("Start with a trigger")}
            </Button>
          </div>
        </Show>
        <svg class="workflow-connections" aria-hidden="true">
          <defs>
            <marker
              id="workflow-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" class="workflow-arrow" />
            </marker>
          </defs>
          <For each={props.edges}>
            {(edge) => {
              const start = () => props.nodes.find((node) => node.id === edge.from);
              const end = () => props.nodes.find((node) => node.id === edge.to);
              return (
                <Show when={start() && end()}>
                  <path
                    data-edge={edge.on}
                    d={edgePath(
                      (start()?.x ?? 0) + NODE_WIDTH,
                      (start()?.y ?? 0) + PORT_Y,
                      end()?.x ?? 0,
                      (end()?.y ?? 0) + PORT_Y,
                    )}
                    marker-end="url(#workflow-arrow)"
                  />
                  <Show when={edge.on !== "next"}>
                    <text
                      class="workflow-edge-label"
                      x={((start()?.x ?? 0) + NODE_WIDTH + (end()?.x ?? 0)) / 2}
                      y={((start()?.y ?? 0) + (end()?.y ?? 0)) / 2 + PORT_Y - 6}
                      text-anchor="middle"
                    >
                      {t(PATH_LABELS[edge.on])}
                    </text>
                  </Show>
                </Show>
              );
            }}
          </For>
          <Show when={connecting()}>
            {(link) => (
              <path
                class="workflow-connecting"
                d={edgePath(
                  (props.nodes.find((node) => node.id === link().from)?.x ?? 0) + NODE_WIDTH,
                  (props.nodes.find((node) => node.id === link().from)?.y ?? 0) + PORT_Y,
                  link().x,
                  link().y,
                )}
              />
            )}
          </Show>
        </svg>
        <For each={props.nodes}>
          {(node) => (
            <article
              class="workflow-node"
              data-type={node.type}
              data-workflow-node={node.id}
              style={{ left: `${node.x}px`, top: `${node.y}px` }}
            >
              <Button
                type="button"
                class="workflow-drag"
                aria-label={t("Move {title}; use X and Y fields with a keyboard", { title: node.title })}
                onPointerDown={(event) => startDrag(event, node)}
              >
                <span class="workflow-node-type">
                  <StepGlyph type={node.type} size={14} />
                  {t(NODE_TYPE_LABELS[node.type])}
                </span>
                <span class="workflow-node-move">{t("Move")}</span>
              </Button>
              <Button
                type="button"
                class="workflow-port"
                onPointerDown={(event) => startConnection(event, node)}
                aria-label={t("Drag connection from {title}; use Connections controls for keyboard", {
                  title: node.title,
                })}
              >
                <span class="sr-only">{t("Connect by drag")}</span>
              </Button>
              <Show when={nodePreview(node)}>
                {(preview) => (
                  <p class="workflow-node-preview" data-workflow-preview={node.type}>
                    {preview()}
                  </p>
                )}
              </Show>
              <label>
                {t("Title")}{" "}
                <Input value={node.title} onInput={(e) => update({ ...node, title: e.currentTarget.value })} />
              </label>
              <For each={(props.check?.nodeIssues ?? []).filter((issue) => issue.nodeId === node.id)}>
                {(issue) => (
                  <p class="workflow-node-issue" role="note">
                    {workflowProblemText(issue.message)}
                  </p>
                )}
              </For>
              <details class="workflow-node-position">
                <summary>{t("Position")}</summary>
                <label>
                  X{" "}
                  <Input
                    type="number"
                    value={node.x}
                    onInput={(e) => update({ ...node, x: Number(e.currentTarget.value) || 0 })}
                  />
                </label>
                <label>
                  Y{" "}
                  <Input
                    type="number"
                    value={node.y}
                    onInput={(e) => update({ ...node, y: Number(e.currentTarget.value) || 0 })}
                  />
                </label>
              </details>
              <Show when={node.type === "trigger" && node.type === "trigger" ? node : undefined}>
                {(trigger) => (
                  <label>
                    {t("Trigger")}{" "}
                    <NativeSelect
                      value={trigger().trigger.kind}
                      onChange={(e) =>
                        update({
                          ...trigger(),
                          trigger:
                            e.currentTarget.value === "routine"
                              ? { kind: "routine", routineId: "" }
                              : { kind: "manual" },
                        })
                      }
                    >
                      <option value="manual">{t("Manual")}</option>
                      <option value="routine">{t("Routine")}</option>
                    </NativeSelect>
                    <Show when={trigger().trigger.kind === "routine"}>
                      <NativeSelect
                        aria-label={t("Routine")}
                        value={routineId(trigger())}
                        onChange={(e) =>
                          update({ ...trigger(), trigger: { kind: "routine", routineId: e.currentTarget.value } })
                        }
                      >
                        <option value="">{t("Choose routine")}</option>
                        <Show
                          when={
                            routineId(trigger()) &&
                            !(props.routines ?? []).some((item) => item.id === routineId(trigger()))
                          }
                        >
                          <option value={routineId(trigger())}>
                            {t("Unavailable: {id}", { id: routineId(trigger()) })}
                          </option>
                        </Show>
                        <For each={props.routines ?? []}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                      </NativeSelect>
                    </Show>
                  </label>
                )}
              </Show>
              <Show when={node.type === "agent" || node.type === "approval" ? node : undefined}>
                {(agent) => (
                  <label>
                    {t("Agent")}{" "}
                    <NativeSelect
                      value={agent().botId}
                      onChange={(e) => update({ ...agent(), botId: e.currentTarget.value })}
                    >
                      <option value="">{t("Choose agent")}</option>
                      <Show when={agent().botId && !(props.bots ?? []).some((item) => item.id === agent().botId)}>
                        <option value={agent().botId}>{t("Unavailable: {id}", { id: agent().botId })}</option>
                      </Show>
                      <For each={props.bots ?? []}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                    </NativeSelect>
                  </label>
                )}
              </Show>
              <Show when={node.type === "channel-output" ? node : undefined}>
                {(channel) => (
                  <label>
                    {t("Channel")}{" "}
                    <NativeSelect
                      value={channel().channelId}
                      onChange={(e) => update({ ...channel(), channelId: e.currentTarget.value })}
                    >
                      <option value="">{t("Choose channel")}</option>
                      <Show
                        when={
                          channel().channelId && !(props.channels ?? []).some((item) => item.id === channel().channelId)
                        }
                      >
                        <option value={channel().channelId}>
                          {t("Unavailable: {id}", { id: channel().channelId })}
                        </option>
                      </Show>
                      <For each={props.channels ?? []}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                    </NativeSelect>
                  </label>
                )}
              </Show>
              <Show when={node.type === "agent" ? node : undefined}>
                {(agent) => (
                  <label>
                    {t("Instruction")}{" "}
                    <Textarea
                      value={agent().prompt}
                      onInput={(e) => update({ ...agent(), prompt: e.currentTarget.value })}
                    />
                  </label>
                )}
              </Show>
              <Show when={node.type === "approval" || node.type === "channel-output" ? node : undefined}>
                {(textNode) => (
                  <label>
                    {t("Text")}{" "}
                    <Textarea
                      value={textNode().text}
                      onInput={(e) => update({ ...textNode(), text: e.currentTarget.value })}
                    />
                  </label>
                )}
              </Show>
              <Show when={node.type === "prompt" ? node : undefined}>
                {(prompt) => (
                  <div class="workflow-field-block">
                    <label>
                      {t("Prompt text")}{" "}
                      <Textarea
                        class="workflow-prompt-text"
                        rows={4}
                        value={prompt().text}
                        onInput={(e) => update({ ...prompt(), text: e.currentTarget.value })}
                        aria-describedby={`prompt-hint-${prompt().id}`}
                      />
                    </label>
                    <p class="workflow-field-hint" id={`prompt-hint-${prompt().id}`}>
                      {t("Fixed text passed to the next step. No model call.")}
                    </p>
                  </div>
                )}
              </Show>
              <Show when={node.type === "condition" ? node : undefined}>
                {(condition) => (
                  <>
                    <div class="workflow-field-block">
                      <label>
                        {t("Subject (text to test)")}{" "}
                        <Textarea
                          class="workflow-condition-subject"
                          rows={2}
                          value={condition().subject}
                          onInput={(e) => update({ ...condition(), subject: e.currentTarget.value })}
                          aria-describedby={`condition-hint-${condition().id}`}
                        />
                      </label>
                      <p class="workflow-field-hint" id={`condition-hint-${condition().id}`}>
                        {t("Usually {{previous}} — the output of the step before this one.")}
                      </p>
                    </div>
                    <label>
                      {t("Operator")}{" "}
                      <NativeSelect
                        value={condition().operator}
                        onChange={(e) => {
                          const operator = WORKFLOW_CONDITION_OPERATORS.find((item) => item === e.currentTarget.value);
                          if (operator) update({ ...condition(), operator });
                        }}
                      >
                        <For each={WORKFLOW_CONDITION_OPERATORS}>
                          {(operator) => <option value={operator}>{conditionOperatorLabel(operator)}</option>}
                        </For>
                      </NativeSelect>
                    </label>
                    <Show when={workflowOperatorNeedsValue(condition().operator)}>
                      <label>
                        {t("Compare with")}{" "}
                        <Input
                          value={condition().value}
                          onInput={(e) => update({ ...condition(), value: e.currentTarget.value })}
                        />
                      </label>
                    </Show>
                    <Switch
                      label={t("Match case")}
                      checked={condition().caseSensitive}
                      onChange={(caseSensitive) => update({ ...condition(), caseSensitive })}
                    />
                    <p class="workflow-condition-paths" role="note">
                      {t("Connect Yes when the test passes, No when it fails.")}
                    </p>
                  </>
                )}
              </Show>
              <Button
                type="button"
                onClick={() =>
                  props.onChange({
                    nodes: props.nodes.filter((n) => n.id !== node.id),
                    edges: props.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id),
                  })
                }
              >
                {t("Remove step")}
              </Button>
            </article>
          )}
        </For>
      </section>
      <fieldset class="workflow-connections-editor">
        <legend>{t("Connections")}</legend>
        <label>
          {t("From")}{" "}
          <NativeSelect value={from()} onChange={(e) => setFrom(e.currentTarget.value)}>
            <option value="">{t("Choose")}</option>
            <For each={props.nodes}>{(n) => <option value={n.id}>{n.title}</option>}</For>
          </NativeSelect>
        </label>
        <label>
          {t("To")}{" "}
          <NativeSelect value={to()} onChange={(e) => setTo(e.currentTarget.value)}>
            <option value="">{t("Choose")}</option>
            <For each={props.nodes}>{(n) => <option value={n.id}>{n.title}</option>}</For>
          </NativeSelect>
        </label>
        <label>
          {t("Path")}{" "}
          <NativeSelect
            value={edgeKind()}
            onChange={(e) => {
              const kind = WORKFLOW_EDGE_KINDS.find((v) => v === e.currentTarget.value);
              if (kind) setEdgeKind(kind);
            }}
          >
            <For each={WORKFLOW_EDGE_KINDS}>{(kind) => <option value={kind}>{t(PATH_LABELS[kind])}</option>}</For>
          </NativeSelect>
        </label>
        <Button
          type="button"
          disabled={!from() || !to()}
          onClick={() => {
            // The path must be one the source step can have: Next for most, Allow/Deny for an approval, Yes/No for a condition.
            const source = props.nodes.find((node) => node.id === from());
            const allowed = source ? connectionKindsOf(source) : [];
            const on = allowed.includes(edgeKind()) ? edgeKind() : (allowed[0] ?? edgeKind());
            props.onChange({
              nodes: props.nodes,
              edges: [...props.edges, { id: `edge-${Date.now()}`, from: from(), to: to(), on }],
            });
          }}
        >
          {t("Connect")}
        </Button>
        <ul class="workflow-edge-list">
          <For each={props.edges}>
            {(edge) => (
              <li data-edge={edge.on}>
                <span class="workflow-edge-text">
                  {props.nodes.find((n) => n.id === edge.from)?.title} →{" "}
                  {props.nodes.find((n) => n.id === edge.to)?.title}{" "}
                  <span class="workflow-edge-kind">{t(PATH_LABELS[edge.on])}</span>
                </span>{" "}
                <Button
                  type="button"
                  onClick={() =>
                    props.onChange({ nodes: props.nodes, edges: props.edges.filter((e) => e.id !== edge.id) })
                  }
                >
                  {t("Remove connection")}
                </Button>
              </li>
            )}
          </For>
        </ul>
      </fieldset>
      <Show when={listedProblems().length}>
        <div role="status">
          <h3>{t("Fix before saving")}</h3>
          <ul>
            <For each={listedProblems()}>{(problem) => <li>{workflowProblemText(problem)}</li>}</For>
          </ul>
        </div>
      </Show>
    </section>
  );
}

// The draft lives outside the page, so leaving the page (to Agents and back) does not throw the work away.
const [selected, setSelected] = createSignal<string>("");
// `undefined` until the person types or opens a workflow: the name then follows the window language ("New workflow").
const [typedName, setName] = createSignal<string | undefined>();
const [graph, setGraphRaw] = createSignal<WorkflowGraph>({ nodes: [], edges: [] });
const [history, setHistory] = createSignal<History<WorkflowGraph>>(emptyHistory<WorkflowGraph>());

/** Forgets the draft (a new workflow, or a fresh start in a test). */
export function resetWorkflowDraft() {
  setSelected("");
  setName(undefined);
  setGraphRaw({ nodes: [], edges: [] });
  setHistory(emptyHistory<WorkflowGraph>());
}

/** A change made by the person: remembered, so it can be undone. */
function changeGraph(next: WorkflowGraph) {
  setHistory(record(history(), graph(), Date.now()));
  setGraphRaw(next);
}

/** Shows another graph (opened, restored or deleted): there is nothing to undo back to. */
function showGraph(next: WorkflowGraph) {
  setHistory(emptyHistory<WorkflowGraph>());
  setGraphRaw(next);
}

function undoGraph() {
  const step = undo(history(), graph());
  if (!step) return;
  setHistory(step.history);
  setGraphRaw(step.value);
}

function redoGraph() {
  const step = redo(history(), graph());
  if (!step) return;
  setHistory(step.history);
  setGraphRaw(step.value);
}

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Ctrl+Z / Cmd+Z undoes, Ctrl+Shift+Z / Ctrl+Y redoes; inside a text field the field keeps its own undo. */
function onEditorKeyDown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || isTextField(event.target)) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) undoGraph();
  else if ((key === "z" && event.shiftKey) || key === "y") redoGraph();
  else return;
  event.preventDefault();
}

export function WorkflowsPage() {
  const [items, setItems] = createSignal<Workflow[]>([]);
  const [bots, setBots] = createSignal<ResourceOption[]>([]);
  const [channels, setChannels] = createSignal<ResourceOption[]>([]);
  const [routines, setRoutines] = createSignal<ResourceOption[]>([]);
  const name = () => typedName() ?? t("New workflow");
  const [preview, setPreview] = createSignal<{ number: number; graph: WorkflowGraph } | null>(null);
  const [runs, setRuns] = createSignal<WorkflowRun[]>([]);
  const [input, setInput] = createSignal("");
  const [error, setError] = createSignal("");
  async function refreshResources() {
    const [nextBots, nextChannels, nextRoutines] = await Promise.allSettled([
      window.openbot.agent.listBots(),
      window.openbot.channels?.list() ?? Promise.resolve([]),
      window.openbot.routines?.list() ?? Promise.resolve([]),
    ]);
    if (nextBots.status === "fulfilled") setBots(nextBots.value.map((bot) => ({ id: bot.id, name: bot.name })));
    if (nextChannels.status === "fulfilled")
      setChannels(
        nextChannels.value
          .filter((channel) => !channel.archived)
          .map((channel) => ({ id: channel.id, name: channel.title || channel.name })),
      );
    if (nextRoutines.status === "fulfilled")
      setRoutines(nextRoutines.value.map((routine) => ({ id: routine.id, name: routine.name })));
    if ([nextBots, nextChannels, nextRoutines].some((result) => result.status === "rejected"))
      setError(t("Could not load all agents, channels or routines."));
  }
  async function refresh() {
    const api = window.openbot.workflows;
    if (!api) {
      setError(t("Workflows are unavailable."));
      return;
    }
    try {
      const list = await api.list();
      setItems(list);
      // The opened workflow was deleted somewhere else: what is on the canvas becomes a new draft.
      if (selected() && !list.some((item) => item.id === selected())) setSelected("");
      if (selected()) setRuns(await api.listRuns({ workflowId: selected() }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? errorText(e) : t("Could not load workflows."));
    }
  }
  function choose(item: Workflow, keepEdits = false) {
    setSelected(item.id);
    setPreview(null);
    setName(item.name);
    // After saving the canvas already shows the saved graph, so the undo steps stay.
    if (!keepEdits) showGraph({ nodes: item.nodes, edges: item.edges });
    void window.openbot.workflows
      ?.listRuns({ workflowId: item.id })
      .then(setRuns)
      .catch((e) => setError(errorText(e)));
  }
  async function save() {
    const api = window.openbot.workflows;
    if (!api) return;
    try {
      const item = selected()
        ? await api.update({ workflowId: selected(), name: name(), ...graph() })
        : await api.create({ name: name(), ...graph() });
      choose(item, true);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? errorText(e) : t("Could not save workflow."));
    }
  }
  onSettled(() => {
    void refresh();
    void refreshResources();
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "workflows-changed" || event.type === "workflow-run-changed") void refresh();
      if (event.type === "bots-changed" || event.type === "channels-changed" || event.type === "routines-changed")
        void refreshResources();
    });
    return off;
  });
  const startNew = () => {
    resetWorkflowDraft();
    setRuns([]);
    setPreview(null);
  };
  // The same checks the program makes on save: the shape of the graph and what each step needs (an agent, a channel, a value).
  const known = (): KnownWorkflowTargets => ({
    botIds: bots().map((bot) => bot.id),
    channelIds: channels().map((channel) => channel.id),
    routineIds: routines().map((routine) => routine.id),
  });
  const draft = () => checkWorkflowDraft(graph(), known());
  const problems = () => [...draft().graphProblems, ...draft().nodeIssues.map((issue) => issue.message)];
  const stepCount = (item: Workflow) => item.nodes.length;
  return (
    <WorkPage
      page="workflows"
      title={t("Workflows")}
      description={t("Chains of steps: a trigger, agents, approvals, conditions and a message to a channel.")}
      class="workflows-page"
      actions={
        <Button type="button" variant="primary" class="work-page-primary" onClick={startNew}>
          <Plus size={16} stroke-width={1.75} aria-hidden="true" />
          {t("New workflow")}
        </Button>
      }
    >
      <div class="workflows-layout">
        <aside class="workflows-list" aria-label={t("Your workflows")}>
          <h2>{t("Your workflows")}</h2>
          <Show
            when={items().length > 0}
            fallback={
              <p class="workflows-list-empty">
                {t("No saved workflows yet. The editor holds a draft until you save it.")}
              </p>
            }
          >
            <ul class="workflow-list">
              <For each={items()}>
                {(item) => (
                  <li>
                    <Button
                      type="button"
                      unstyled
                      class="workflow-list-item"
                      aria-current={selected() === item.id ? "true" : undefined}
                      onClick={() => choose(item)}
                    >
                      <span class="workflow-list-icon" aria-hidden="true">
                        <WorkflowIcon size={16} stroke-width={1.5} />
                      </span>
                      <span class="workflow-list-copy">
                        <strong>{item.name}</strong>
                        <small>{tn(stepCount(item), "{count} step", "{count} steps")}</small>
                      </span>
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </aside>
        <section class="workflows-editor" aria-label={t("Workflow")} onKeyDown={onEditorKeyDown}>
          <Show when={error()}>
            <p role="alert" class="workflows-alert">
              {error()}
            </p>
          </Show>
          <div class="workflows-editor-bar">
            <label class="workflows-name">
              <span class="sr-only">{t("Name")}</span>
              <Input value={name()} aria-label={t("Name")} onInput={(e) => setName(e.currentTarget.value)} />
            </label>
            <Show when={!selected()}>
              <span class="workflows-draft">{t("Draft")}</span>
            </Show>
            <div class="workflows-editor-actions">
              <Button
                type="button"
                variant="ghost"
                class="workflows-history-button"
                aria-label={t("Undo")}
                title={t("Undo the last change (Ctrl+Z)")}
                disabled={!canUndo(history())}
                onClick={undoGraph}
              >
                <Undo2 size={16} stroke-width={1.5} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                class="workflows-history-button"
                aria-label={t("Redo")}
                title={t("Redo the change you undid (Ctrl+Shift+Z)")}
                disabled={!canRedo(history())}
                onClick={redoGraph}
              >
                <Redo2 size={16} stroke-width={1.5} aria-hidden="true" />
              </Button>
              <Show when={selected()}>
                <Button
                  type="button"
                  variant="ghost"
                  class="workflows-delete"
                  aria-label={t("Delete workflow")}
                  title={t("Delete workflow")}
                  onClick={() => {
                    if (window.confirm(t("Delete this workflow and its history?")))
                      void window.openbot.workflows
                        ?.delete({ workflowId: selected() })
                        .then(() => {
                          resetWorkflowDraft();
                          setRuns([]);
                          return refresh();
                        })
                        .catch((e) => setError(errorText(e)));
                  }}
                >
                  <Trash2 size={16} stroke-width={1.5} aria-hidden="true" />
                </Button>
              </Show>
              <Button
                type="button"
                variant="primary"
                disabled={!name().trim() || !draft().canSave}
                title={problems()[0] ? workflowProblemText(problems()[0] ?? "") : undefined}
                onClick={() => void save()}
              >
                <Check size={16} stroke-width={1.75} aria-hidden="true" />
                {t("Save workflow")}
              </Button>
            </div>
          </div>
          <WorkflowCanvas
            nodes={graph().nodes}
            edges={graph().edges}
            onChange={changeGraph}
            bots={bots()}
            channels={channels()}
            routines={routines()}
            check={draft()}
          />
          <Show when={selected()}>
            <div class="workflows-panels">
              <section class="workflows-run" aria-label={t("Run now")}>
                <h3>{t("Run now")}</h3>
                <label>
                  {t("Run input")} <Textarea value={input()} onInput={(e) => setInput(e.currentTarget.value)} />
                </label>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    void window.openbot.workflows
                      ?.run({ workflowId: selected(), input: input() })
                      .then(refresh)
                      .catch((e) => setError(errorText(e)))
                  }
                >
                  <Play size={15} stroke-width={1.75} aria-hidden="true" />
                  {t("Run now")}
                </Button>
              </section>
              <section class="workflows-history" aria-label={t("Run history")}>
                <h3>{t("Run history")}</h3>
                <Show
                  when={runs().length > 0}
                  fallback={
                    <p class="workflows-list-empty">{t("No runs yet. Run the workflow to see each step here.")}</p>
                  }
                >
                  <ul class="workflow-runs">
                    <For each={runs()}>
                      {(run) => (
                        <li class="workflow-run" data-status={run.status}>
                          <div class="workflow-run-head">
                            <span class="workflow-run-status" data-status={run.status}>
                              {t(RUN_STATUS_LABELS[run.status])}
                            </span>
                            <time datetime={run.startedAt}>{formatRunTime(run.startedAt)}</time>
                            <Show when={run.status === "running" || run.status === "waiting"}>
                              <Button
                                type="button"
                                variant="ghost"
                                class="workflow-run-cancel"
                                onClick={() =>
                                  void window.openbot.workflows
                                    ?.cancelRun({ runId: run.id })
                                    .then(refresh)
                                    .catch((e) => setError(errorText(e)))
                                }
                              >
                                {t("Cancel run")}
                              </Button>
                            </Show>
                          </div>
                          <Show when={run.error}>
                            <p class="workflow-run-error">{run.error}</p>
                          </Show>
                          <ol class="workflow-run-steps">
                            <For each={run.steps}>
                              {(step) => (
                                <li data-status={step.status} title={t(STEP_STATUS_LABELS[step.status])}>
                                  <StepGlyph type={step.type} size={13} />
                                  <span>{step.title}</span>
                                  <span class="sr-only">: {t(STEP_STATUS_LABELS[step.status])}</span>
                                </li>
                              )}
                            </For>
                          </ol>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
              <Show when={preview()}>
                {(shown) => (
                  <WorkflowPreviewCanvas
                    graph={shown().graph}
                    label={t("Preview of version {number}", { number: shown().number })}
                  />
                )}
              </Show>
              <WorkflowVersionsPanel
                workflowId={selected()}
                previewNumber={preview()?.number}
                onPreview={setPreview}
                onRestored={(workflow) => {
                  setPreview(null);
                  showGraph({ nodes: workflow.nodes, edges: workflow.edges });
                }}
              />
            </div>
          </Show>
        </section>
      </div>
    </WorkPage>
  );
}
