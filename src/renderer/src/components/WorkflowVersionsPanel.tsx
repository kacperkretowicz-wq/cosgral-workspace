import {
  diffWorkflowGraphs,
  type Workflow,
  type WorkflowGraph,
  type WorkflowVersionSummary,
} from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { errorText } from "../errors";
import { appLocale, t, tn } from "../i18n";
import { workflowDiffText } from "../workflow-text";
import { Badge, Button } from "./ui";

function savedLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(appLocale());
}

function reasonLabel(version: WorkflowVersionSummary): string {
  switch (version.reason) {
    case "created":
      return t("Created");
    case "restored":
      return version.restoredFrom === null
        ? t("Restored")
        : t("Restored from version {number}", { number: version.restoredFrom });
    default:
      return t("Edited");
  }
}

/**
 * The versions of one workflow (window.openbot.workflows listVersions / getVersion / restoreVersion): every saved graph,
 * a plain sentence about what changed against the current one, and "Restore", which keeps the restored graph as a new version
 * so a restore can be undone by another restore.
 */
export function WorkflowVersionsPanel(props: {
  workflowId: string;
  onRestored?: (workflow: Workflow) => void;
  /** Called with an older version's graph to draw on the canvas; null closes the preview. */
  onPreview?: (preview: { number: number; graph: WorkflowGraph } | null) => void;
  /** The version shown on the canvas now, if any. */
  previewNumber?: number;
}) {
  const api = untrack(() => window.openbot?.workflows);
  const [versions, setVersions] = createSignal<WorkflowVersionSummary[]>([]);
  const [changes, setChanges] = createSignal<Record<number, string>>({});
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let serial = 0;

  async function load() {
    if (!api || !props.workflowId) return;
    const n = ++serial;
    const workflowId = props.workflowId;
    try {
      const list = await api.listVersions({ workflowId });
      if (n !== serial) return;
      setVersions(list);
      setError("");
      const current = list.find((item) => item.current);
      if (!current) return;
      const base = await api.getVersion({ workflowId, version: current.number });
      const next: Record<number, string> = {};
      for (const item of list) {
        if (item.current) continue;
        const older = await api.getVersion({ workflowId, version: item.number });
        next[item.number] = workflowDiffText(diffWorkflowGraphs(older, base));
      }
      if (n === serial) setChanges(next);
    } catch (cause) {
      if (n === serial) setError(errorText(cause, t("Could not load the versions.")));
    }
  }

  createEffect(
    () => props.workflowId,
    () => {
      setVersions([]);
      setChanges({});
      void load();
    },
  );

  onSettled(() => {
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "workflows-changed") void load();
    });
    return () => {
      serial++;
      off?.();
    };
  });

  async function preview(version: WorkflowVersionSummary) {
    if (!api || !props.onPreview) return;
    if (props.previewNumber === version.number) {
      props.onPreview(null);
      return;
    }
    setError("");
    try {
      const found = await api.getVersion({ workflowId: props.workflowId, version: version.number });
      props.onPreview({ number: version.number, graph: { nodes: found.nodes, edges: found.edges } });
    } catch (cause) {
      setError(errorText(cause, t("Could not load the versions.")));
    }
  }

  async function restore(version: WorkflowVersionSummary) {
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    try {
      const workflow = await api.restoreVersion({ workflowId: props.workflowId, version: version.number });
      props.onRestored?.(workflow);
      await load();
    } catch (cause) {
      setError(errorText(cause, t("Could not restore this version.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="workflow-versions" aria-label={t("Versions")}>
      <h2>{t("Versions")}</h2>
      <Show
        when={api}
        fallback={<p class="workflow-versions-note">{t("Versions are not available in this version.")}</p>}
      >
        <Show when={error()}>
          <p class="workflow-versions-error" role="alert">
            {error()}
          </p>
        </Show>
        <Show when={versions().length === 0 && !error()}>
          <p class="workflow-versions-note">{t("No versions yet.")}</p>
        </Show>
        <ul class="workflow-version-list">
          <For each={versions()}>
            {(version) => (
              <li data-current={version.current ? "true" : "false"}>
                <header>
                  <strong>{t("Version {number}", { number: version.number })}</strong>
                  <Show when={version.current}>
                    <Badge tone="success" dot>
                      {t("Current")}
                    </Badge>
                  </Show>
                  <small>
                    {savedLabel(version.savedAt)} · {reasonLabel(version)}
                  </small>
                </header>
                <p class="workflow-versions-note">{graphSummaryText(version.summary)}</p>
                <Show when={!version.current && changes()[version.number]}>
                  <p class="workflow-versions-note">
                    {t("Against the current one")}: {changes()[version.number]}
                  </p>
                </Show>
                <Show when={!version.current}>
                  <div class="workflow-version-actions">
                    <Show when={props.onPreview}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-pressed={props.previewNumber === version.number ? "true" : "false"}
                        onClick={() => void preview(version)}
                      >
                        {props.previewNumber === version.number ? t("Close preview") : t("Preview on canvas")}
                      </Button>
                    </Show>
                    <Button type="button" size="sm" disabled={busy()} onClick={() => void restore(version)}>
                      {t("Restore this version")}
                    </Button>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

/** The engine's version summary ("1 trigger, 2 agent steps"; see workflowGraphSummary) with the counts in the window language. */
const SUMMARY_PARTS: ReadonlyArray<readonly [string, string]> = [
  ["{count} trigger", "{count} triggers"],
  ["{count} agent step", "{count} agent steps"],
  ["{count} approval", "{count} approvals"],
  ["{count} output", "{count} outputs"],
  ["{count} prompt", "{count} prompts"],
  ["{count} condition", "{count} conditions"],
];

export function graphSummaryText(summary: string): string {
  if (summary === "empty") return t("No steps");
  const parts = summary.split(", ").map((part) => {
    const match = /^(\d+) (.+)$/.exec(part);
    if (!match) return part;
    const count = Number(match[1]);
    const words = match[2];
    const forms = SUMMARY_PARTS.find(([one, other]) => one.slice(8) === words || other.slice(8) === words);
    return forms ? tn(count, forms[0], forms[1]) : part;
  });
  return parts.join(", ");
}
