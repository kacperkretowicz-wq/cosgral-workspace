import {
  describeWorkflowDiff,
  diffWorkflowGraphs,
  type Workflow,
  type WorkflowVersionSummary,
} from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Badge, Button } from "./ui";

function savedLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
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
export function WorkflowVersionsPanel(props: { workflowId: string; onRestored?: (workflow: Workflow) => void }) {
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
        next[item.number] = describeWorkflowDiff(diffWorkflowGraphs(older, base));
      }
      if (n === serial) setChanges(next);
    } catch (cause) {
      if (n === serial) setError(cause instanceof Error ? cause.message : t("Could not load the versions."));
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

  async function restore(version: WorkflowVersionSummary) {
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    try {
      const workflow = await api.restoreVersion({ workflowId: props.workflowId, version: version.number });
      props.onRestored?.(workflow);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not restore this version."));
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
                <p class="workflow-versions-note">{version.summary}</p>
                <Show when={!version.current && changes()[version.number]}>
                  <p class="workflow-versions-note">
                    {t("Against the current one")}: {changes()[version.number]}
                  </p>
                </Show>
                <Show when={!version.current}>
                  <Button type="button" size="sm" disabled={busy()} onClick={() => void restore(version)}>
                    {t("Restore this version")}
                  </Button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
