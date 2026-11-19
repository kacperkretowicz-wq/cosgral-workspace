import type {
  Workflow,
  WorkflowEdgeKind,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowRun,
} from "@openbot/contracts/ipc";
import {
  describeWorkflowCondition,
  WORKFLOW_CONDITION_OPERATOR_LABELS,
  WORKFLOW_CONDITION_OPERATORS,
  WORKFLOW_EDGE_KINDS,
  workflowOperatorNeedsValue,
  workflowProblems,
} from "@openbot/contracts/ipc";
import { createSignal, For, onCleanup, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { Button, Input, NativeSelect, Switch, Textarea } from "./ui";
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

const NODE_WIDTH = 260;
const PORT_Y = 28;

function nodePreview(node: WorkflowNode): string {
  if (node.type === "prompt") {
    const text = node.text.trim();
    if (!text) return t("Empty prompt — type the fixed text for the next step.");
    return text.length > 96 ? `${text.slice(0, 93)}…` : text;
  }
  if (node.type === "condition") return describeWorkflowCondition(node);
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
export function WorkflowCanvas(
  props: WorkflowGraph & {
    onChange: (graph: WorkflowGraph) => void;
    bots?: ResourceOption[];
    channels?: ResourceOption[];
    routines?: ResourceOption[];
  },
) {
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
      title: type,
      x: 24 + (props.nodes.length % 3) * 250,
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
              {t(item.label)}
            </Button>
          )}
        </For>
      </div>
      <section ref={canvas} class="workflow-canvas" aria-label={t("Workflow canvas")}>
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
                aria-label={`Move ${node.title}; use X and Y fields with a keyboard`}
                onPointerDown={(event) => startDrag(event, node)}
              >
                <span class="workflow-node-type">{t(NODE_TYPE_LABELS[node.type])}</span>
                <span class="workflow-node-move">{t("Move")}</span>
              </Button>
              <Button
                type="button"
                class="workflow-port"
                onPointerDown={(event) => startConnection(event, node)}
                aria-label={`Drag connection from ${node.title}; use Connections controls for keyboard`}
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
                          {(operator) => (
                            <option value={operator}>{WORKFLOW_CONDITION_OPERATOR_LABELS[operator]}</option>
                          )}
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
      <fieldset>
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
          onClick={() =>
            props.onChange({
              nodes: props.nodes,
              edges: [...props.edges, { id: `edge-${Date.now()}`, from: from(), to: to(), on: edgeKind() }],
            })
          }
        >
          {t("Connect")}
        </Button>
        <ul>
          <For each={props.edges}>
            {(edge) => (
              <li>
                {props.nodes.find((n) => n.id === edge.from)?.title} →{" "}
                {props.nodes.find((n) => n.id === edge.to)?.title} ({t(PATH_LABELS[edge.on])}){" "}
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
      <Show when={workflowProblems(props).length}>
        <div role="status">
          <h3>{t("Fix before saving")}</h3>
          <ul>
            <For each={workflowProblems(props)}>{(problem) => <li>{problem}</li>}</For>
          </ul>
        </div>
      </Show>
    </section>
  );
}

export function WorkflowsPage() {
  const [items, setItems] = createSignal<Workflow[]>([]);
  const [bots, setBots] = createSignal<ResourceOption[]>([]);
  const [channels, setChannels] = createSignal<ResourceOption[]>([]);
  const [routines, setRoutines] = createSignal<ResourceOption[]>([]);
  const [selected, setSelected] = createSignal<string>("");
  const [name, setName] = createSignal("New workflow");
  const [graph, setGraph] = createSignal<WorkflowGraph>({ nodes: [], edges: [] });
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
      setItems(await api.list());
      if (selected()) setRuns(await api.listRuns({ workflowId: selected() }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not load workflows."));
    }
  }
  function choose(item: Workflow) {
    setSelected(item.id);
    setPreview(null);
    setName(item.name);
    setGraph({ nodes: item.nodes, edges: item.edges });
    void window.openbot.workflows
      ?.listRuns({ workflowId: item.id })
      .then(setRuns)
      .catch((e) => setError(String(e)));
  }
  async function save() {
    const api = window.openbot.workflows;
    if (!api) return;
    try {
      const item = selected()
        ? await api.update({ workflowId: selected(), name: name(), ...graph() })
        : await api.create({ name: name(), ...graph() });
      choose(item);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not save workflow."));
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
  return (
    <main class="w2-library">
      <h1>{t("Workflows")}</h1>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Button
        type="button"
        onClick={() => {
          setSelected("");
          setName("New workflow");
          setGraph({ nodes: [], edges: [] });
          setRuns([]);
        }}
      >
        {t("New workflow")}
      </Button>
      <ul class="workflow-list">
        <For each={items()}>
          {(item) => (
            <li>
              <Button
                type="button"
                aria-current={selected() === item.id ? "true" : undefined}
                onClick={() => choose(item)}
              >
                {item.name}
              </Button>
            </li>
          )}
        </For>
      </ul>
      <label>
        {t("Name")} <Input value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <WorkflowCanvas
        nodes={graph().nodes}
        edges={graph().edges}
        onChange={setGraph}
        bots={bots()}
        channels={channels()}
        routines={routines()}
      />
      <Button
        type="button"
        disabled={!name().trim() || workflowProblems(graph()).length > 0}
        onClick={() => void save()}
      >
        {t("Save workflow")}
      </Button>
      <Show when={selected()}>
        <Button
          type="button"
          onClick={() => {
            if (window.confirm(t("Delete this workflow and its history?")))
              void window.openbot.workflows
                ?.delete({ workflowId: selected() })
                .then(() => {
                  setSelected("");
                  setGraph({ nodes: [], edges: [] });
                  setRuns([]);
                  return refresh();
                })
                .catch((e) => setError(String(e)));
          }}
        >
          {t("Delete workflow")}
        </Button>
        <label>
          {t("Run input")} <Textarea value={input()} onInput={(e) => setInput(e.currentTarget.value)} />
        </label>
        <Button
          type="button"
          onClick={() =>
            void window.openbot.workflows
              ?.run({ workflowId: selected(), input: input() })
              .then(refresh)
              .catch((e) => setError(String(e)))
          }
        >
          {t("Run now")}
        </Button>
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
            setGraph({ nodes: workflow.nodes, edges: workflow.edges });
          }}
        />
        <h2>{t("Run history")}</h2>
        <ul>
          <For each={runs()}>
            {(run) => (
              <li>
                {run.status} · {run.startedAt}{" "}
                <Show when={run.status === "running" || run.status === "waiting"}>
                  <Button
                    type="button"
                    onClick={() =>
                      void window.openbot.workflows
                        ?.cancelRun({ runId: run.id })
                        .then(refresh)
                        .catch((e) => setError(String(e)))
                    }
                  >
                    {t("Cancel run")}
                  </Button>
                </Show>
                <Show when={run.error}>
                  <p>{run.error}</p>
                </Show>
                <ul>
                  <For each={run.steps}>
                    {(step) => (
                      <li>
                        {step.title}: {step.status}
                      </li>
                    )}
                  </For>
                </ul>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </main>
  );
}
