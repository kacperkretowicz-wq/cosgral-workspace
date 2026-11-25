import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@openbot/contracts/ipc";
import { For, Show } from "solid-js";
import { t } from "../i18n";
import { conditionText } from "../workflow-text";
import "../styles/workflow-preview.css";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 84;

const TYPE_LABELS: Record<WorkflowNode["type"], string> = {
  trigger: "Trigger",
  agent: "Agent",
  approval: "Approval",
  "channel-output": "Channel output",
  prompt: "Prompt",
  condition: "Condition",
};

const EDGE_LABELS: Record<WorkflowEdge["on"], string> = {
  next: "",
  allow: "Allow",
  deny: "Deny",
  yes: "Yes",
  no: "No",
};

/** One line that says what a step does, so the preview reads without opening anything. */
export function describeWorkflowStep(node: WorkflowNode): string {
  switch (node.type) {
    case "trigger":
      return node.trigger.kind === "routine" ? t("Starts from a routine") : t("Starts by hand");
    case "agent":
      return node.prompt;
    case "approval":
    case "channel-output":
    case "prompt":
      return node.text;
    case "condition":
      return conditionText(node);
  }
}

/**
 * A read-only picture of a workflow graph (an older version): the steps where they were, the connections between them with
 * their Yes / No / Allow / Deny labels. Nothing here can be edited or dragged.
 */
export function WorkflowPreviewCanvas(props: { graph: WorkflowGraph; label: string }) {
  const width = () => Math.max(480, ...props.graph.nodes.map((node) => node.x + NODE_WIDTH + 24));
  const height = () => Math.max(240, ...props.graph.nodes.map((node) => node.y + NODE_HEIGHT + 24));
  const find = (id: string) => props.graph.nodes.find((node) => node.id === id);
  return (
    <section class="workflow-preview" aria-label={props.label}>
      <div class="workflow-preview-scroll">
        <div class="workflow-preview-stage" style={{ width: `${width()}px`, height: `${height()}px` }}>
          <svg class="workflow-preview-lines" width={width()} height={height()} aria-hidden="true">
            <For each={props.graph.edges}>
              {(edge) => {
                const start = () => find(edge.from);
                const end = () => find(edge.to);
                return (
                  <Show when={start() && end()}>
                    <line
                      data-edge={edge.on}
                      x1={(start()?.x ?? 0) + NODE_WIDTH / 2}
                      y1={(start()?.y ?? 0) + NODE_HEIGHT / 2}
                      x2={(end()?.x ?? 0) + NODE_WIDTH / 2}
                      y2={(end()?.y ?? 0) + NODE_HEIGHT / 2}
                    />
                  </Show>
                );
              }}
            </For>
          </svg>
          <For each={props.graph.edges.filter((edge) => edge.on !== "next")}>
            {(edge) => {
              const start = () => find(edge.from);
              const end = () => find(edge.to);
              return (
                <Show when={start() && end()}>
                  <span
                    class="workflow-preview-edge"
                    data-edge={edge.on}
                    style={{
                      left: `${((start()?.x ?? 0) + (end()?.x ?? 0)) / 2 + NODE_WIDTH / 2}px`,
                      top: `${((start()?.y ?? 0) + (end()?.y ?? 0)) / 2 + NODE_HEIGHT / 2}px`,
                    }}
                  >
                    {t(EDGE_LABELS[edge.on])}
                  </span>
                </Show>
              );
            }}
          </For>
          <For each={props.graph.nodes}>
            {(node) => (
              <article
                class="workflow-preview-node"
                data-type={node.type}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${NODE_WIDTH}px`,
                  height: `${NODE_HEIGHT}px`,
                }}
              >
                <span class="workflow-preview-type">{t(TYPE_LABELS[node.type])}</span>
                <strong>{node.title}</strong>
                <small>{describeWorkflowStep(node)}</small>
              </article>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
