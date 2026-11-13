import type {
  Workflow,
  WorkflowEdgeKind,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowRun,
} from "@openbot/contracts/ipc";
import { WORKFLOW_EDGE_KINDS, workflowProblems } from "@openbot/contracts/ipc";
import { createSignal, For, onCleanup, onSettled, Show } from "solid-js";

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
              on: node.type === "approval" ? (edgeKind() === "deny" ? "deny" : "allow") : "next",
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
            : { ...base, type, channelId: "", text: "" };
    props.onChange({ nodes: [...props.nodes, node], edges: props.edges });
  }
  return (
    <section aria-label="Workflow editor">
      <div>
        <button type="button" onClick={() => add("trigger")}>
          Add trigger
        </button>{" "}
        <button type="button" onClick={() => add("agent")}>
          Add agent
        </button>{" "}
        <button type="button" onClick={() => add("approval")}>
          Add approval
        </button>{" "}
        <button type="button" onClick={() => add("channel-output")}>
          Add channel output
        </button>
      </div>
      <section ref={canvas} class="workflow-canvas" aria-label="Workflow canvas">
        <svg class="workflow-connections" aria-hidden="true">
          <For each={props.edges}>
            {(edge) => {
              const start = () => props.nodes.find((node) => node.id === edge.from);
              const end = () => props.nodes.find((node) => node.id === edge.to);
              return (
                <Show when={start() && end()}>
                  <line
                    x1={(start()?.x ?? 0) + 110}
                    y1={(start()?.y ?? 0) + 20}
                    x2={(end()?.x ?? 0) + 110}
                    y2={(end()?.y ?? 0) + 20}
                  />
                </Show>
              );
            }}
          </For>
          <Show when={connecting()}>
            {(link) => (
              <line
                x1={(props.nodes.find((node) => node.id === link().from)?.x ?? 0) + 110}
                y1={(props.nodes.find((node) => node.id === link().from)?.y ?? 0) + 20}
                x2={link().x}
                y2={link().y}
                stroke-dasharray="5 4"
              />
            )}
          </Show>
        </svg>
        <For each={props.nodes}>
          {(node) => (
            <article
              class="workflow-node"
              data-workflow-node={node.id}
              style={{ left: `${node.x}px`, top: `${node.y}px` }}
            >
              <button
                type="button"
                class="workflow-drag"
                aria-label={`Move ${node.title}; use X and Y fields with a keyboard`}
                onPointerDown={(event) => startDrag(event, node)}
              >
                {node.type} · Move
              </button>
              <button
                type="button"
                onPointerDown={(event) => startConnection(event, node)}
                aria-label={`Drag connection from ${node.title}; use Connections controls for keyboard`}
              >
                Connect by drag
              </button>
              <label>
                Title <input value={node.title} onInput={(e) => update({ ...node, title: e.currentTarget.value })} />
              </label>
              <label>
                X{" "}
                <input
                  type="number"
                  value={node.x}
                  onInput={(e) => update({ ...node, x: Number(e.currentTarget.value) || 0 })}
                />
              </label>
              <label>
                Y{" "}
                <input
                  type="number"
                  value={node.y}
                  onInput={(e) => update({ ...node, y: Number(e.currentTarget.value) || 0 })}
                />
              </label>
              <Show when={node.type === "trigger" && node.type === "trigger" ? node : undefined}>
                {(trigger) => (
                  <label>
                    Trigger{" "}
                    <select
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
                      <option value="manual">Manual</option>
                      <option value="routine">Routine</option>
                    </select>
                    <Show when={trigger().trigger.kind === "routine"}>
                      <select
                        aria-label="Routine"
                        value={routineId(trigger())}
                        onChange={(e) =>
                          update({ ...trigger(), trigger: { kind: "routine", routineId: e.currentTarget.value } })
                        }
                      >
                        <option value="">Choose routine</option>
                        <Show
                          when={
                            routineId(trigger()) &&
                            !(props.routines ?? []).some((item) => item.id === routineId(trigger()))
                          }
                        >
                          <option value={routineId(trigger())}>Unavailable: {routineId(trigger())}</option>
                        </Show>
                        <For each={props.routines ?? []}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                      </select>
                    </Show>
                  </label>
                )}
              </Show>
              <Show when={node.type === "agent" || node.type === "approval" ? node : undefined}>
                {(agent) => (
                  <label>
                    Agent{" "}
                    <select
                      value={agent().botId}
                      onChange={(e) => update({ ...agent(), botId: e.currentTarget.value })}
                    >
                      <option value="">Choose agent</option>
                      <Show when={agent().botId && !(props.bots ?? []).some((item) => item.id === agent().botId)}>
                        <option value={agent().botId}>Unavailable: {agent().botId}</option>
                      </Show>
                      <For each={props.bots ?? []}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                    </select>
                  </label>
                )}
              </Show>
              <Show when={node.type === "channel-output" ? node : undefined}>
                {(channel) => (
                  <label>
                    Channel{" "}
                    <select
                      value={channel().channelId}
                      onChange={(e) => update({ ...channel(), channelId: e.currentTarget.value })}
                    >
                      <option value="">Choose channel</option>
                      <Show
                        when={
                          channel().channelId && !(props.channels ?? []).some((item) => item.id === channel().channelId)
                        }
                      >
                        <option value={channel().channelId}>Unavailable: {channel().channelId}</option>
                      </Show>
                      <For each={props.channels ?? []}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                    </select>
                  </label>
                )}
              </Show>
              <Show when={node.type === "agent" ? node : undefined}>
                {(agent) => (
                  <label>
                    Instruction{" "}
                    <textarea
                      value={agent().prompt}
                      onInput={(e) => update({ ...agent(), prompt: e.currentTarget.value })}
                    />
                  </label>
                )}
              </Show>
              <Show when={node.type === "approval" || node.type === "channel-output" ? node : undefined}>
                {(textNode) => (
                  <label>
                    Text{" "}
                    <textarea
                      value={textNode().text}
                      onInput={(e) => update({ ...textNode(), text: e.currentTarget.value })}
                    />
                  </label>
                )}
              </Show>
              <button
                type="button"
                onClick={() =>
                  props.onChange({
                    nodes: props.nodes.filter((n) => n.id !== node.id),
                    edges: props.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id),
                  })
                }
              >
                Remove step
              </button>
            </article>
          )}
        </For>
      </section>
      <fieldset>
        <legend>Connections</legend>
        <label>
          From{" "}
          <select value={from()} onChange={(e) => setFrom(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={props.nodes}>{(n) => <option value={n.id}>{n.title}</option>}</For>
          </select>
        </label>
        <label>
          To{" "}
          <select value={to()} onChange={(e) => setTo(e.currentTarget.value)}>
            <option value="">Choose</option>
            <For each={props.nodes}>{(n) => <option value={n.id}>{n.title}</option>}</For>
          </select>
        </label>
        <label>
          Path{" "}
          <select
            value={edgeKind()}
            onChange={(e) => {
              const kind = WORKFLOW_EDGE_KINDS.find((v) => v === e.currentTarget.value);
              if (kind) setEdgeKind(kind);
            }}
          >
            <For each={WORKFLOW_EDGE_KINDS}>{(kind) => <option value={kind}>{kind}</option>}</For>
          </select>
        </label>
        <button
          type="button"
          disabled={!from() || !to()}
          onClick={() =>
            props.onChange({
              nodes: props.nodes,
              edges: [...props.edges, { id: `edge-${Date.now()}`, from: from(), to: to(), on: edgeKind() }],
            })
          }
        >
          Connect
        </button>
        <ul>
          <For each={props.edges}>
            {(edge) => (
              <li>
                {props.nodes.find((n) => n.id === edge.from)?.title} →{" "}
                {props.nodes.find((n) => n.id === edge.to)?.title} ({edge.on}){" "}
                <button
                  type="button"
                  onClick={() =>
                    props.onChange({ nodes: props.nodes, edges: props.edges.filter((e) => e.id !== edge.id) })
                  }
                >
                  Remove connection
                </button>
              </li>
            )}
          </For>
        </ul>
      </fieldset>
      <Show when={workflowProblems(props).length}>
        <div role="status">
          <h3>Fix before saving</h3>
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
      setError("Could not load all agents, channels or routines.");
  }
  async function refresh() {
    const api = window.openbot.workflows;
    if (!api) {
      setError("Workflows are unavailable.");
      return;
    }
    try {
      setItems(await api.list());
      if (selected()) setRuns(await api.listRuns({ workflowId: selected() }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workflows.");
    }
  }
  function choose(item: Workflow) {
    setSelected(item.id);
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
      setError(e instanceof Error ? e.message : "Could not save workflow.");
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
      <h1>Workflows</h1>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <button
        type="button"
        onClick={() => {
          setSelected("");
          setName("New workflow");
          setGraph({ nodes: [], edges: [] });
          setRuns([]);
        }}
      >
        New workflow
      </button>
      <ul>
        <For each={items()}>
          {(item) => (
            <li>
              <button type="button" onClick={() => choose(item)}>
                {item.name}
              </button>
            </li>
          )}
        </For>
      </ul>
      <label>
        Name <input value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <WorkflowCanvas
        nodes={graph().nodes}
        edges={graph().edges}
        onChange={setGraph}
        bots={bots()}
        channels={channels()}
        routines={routines()}
      />
      <button
        type="button"
        disabled={!name().trim() || workflowProblems(graph()).length > 0}
        onClick={() => void save()}
      >
        Save workflow
      </button>
      <Show when={selected()}>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Delete this workflow and its history?"))
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
          Delete workflow
        </button>
        <label>
          Run input <textarea value={input()} onInput={(e) => setInput(e.currentTarget.value)} />
        </label>
        <button
          type="button"
          onClick={() =>
            void window.openbot.workflows
              ?.run({ workflowId: selected(), input: input() })
              .then(refresh)
              .catch((e) => setError(String(e)))
          }
        >
          Run now
        </button>
        <h2>Run history</h2>
        <ul>
          <For each={runs()}>
            {(run) => (
              <li>
                {run.status} · {run.startedAt}{" "}
                <Show when={run.status === "running" || run.status === "waiting"}>
                  <button
                    type="button"
                    onClick={() =>
                      void window.openbot.workflows
                        ?.cancelRun({ runId: run.id })
                        .then(refresh)
                        .catch((e) => setError(String(e)))
                    }
                  >
                    Cancel run
                  </button>
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
