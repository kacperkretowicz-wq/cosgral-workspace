import {
  type ApplyTransferResult,
  type ExportInstanceResult,
  type ImportSourceInfo,
  type InstanceTransferSummary,
  TRANSFER_NOT_MOVED,
  TRANSFER_STEPS,
  type TransferPreview,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { errorText } from "../errors";
import { appLocale, t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Badge, Button, Switch } from "./ui";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Import and Transfer of agents (window.openbot.instanceTransfer), the two sections of the server settings.
 * Transfer: three steps, an export of chosen agents to a .zip, and an import of such a file. Import: the cards of what can be read.
 * A chosen file is only STAGED and shown (nothing changes until you confirm); imported agents are always NEW (a taken name gets a
 * numbered copy name) and routines come back paused. What a transfer never carries is listed under the buttons.
 */
export function InstanceTransferPanel(props: { mode: "import" | "transfer"; onOpenTransfer?: () => void }) {
  const api = untrack(() => window.openbot?.instanceTransfer);
  const [summary, setSummary] = createSignal<InstanceTransferSummary | null>(null);
  const [sources, setSources] = createSignal<ImportSourceInfo[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [picked, setPicked] = createSignal<Set<string>>(new Set());
  const [withSettings, setWithSettings] = createSignal(true);
  const [exported, setExported] = createSignal<ExportInstanceResult | null>(null);
  const [preview, setPreview] = createSignal<TransferPreview | null>(null);
  const [importKeys, setImportKeys] = createSignal<Set<string>>(new Set());
  const [importSettings, setImportSettings] = createSignal(true);
  const [result, setResult] = createSignal<ApplyTransferResult | null>(null);

  async function load() {
    if (!api) return;
    try {
      const [info, cards] = await Promise.all([api.summary(), api.importSources()]);
      setSummary(info);
      setSources(cards);
      setPicked(new Set(info.agents.map((agent) => agent.id)));
      setWithSettings(info.capabilities.settings);
      setError("");
    } catch (cause) {
      setError(errorText(cause, t("Could not load the transfer page.")));
    } finally {
      setLoaded(true);
    }
  }

  onSettled(() => {
    void load();
    // A staged file that is still open when the page closes is dropped, so nothing stays staged.
    return () => {
      const open = preview();
      if (open) void api?.discard({ token: open.token });
    };
  });

  async function run(work: () => Promise<void>, failure: string) {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(errorText(cause, failure));
    } finally {
      setBusy(false);
    }
  }

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  function exportAgents() {
    const info = summary();
    if (!info) return;
    void run(async () => {
      setExported(null);
      const outcome = await api?.exportAgents({ agentIds: [...picked()], includeSettings: withSettings() });
      if (outcome) setExported(outcome);
    }, t("Could not export the agents."));
  }

  function chooseFile() {
    void run(async () => {
      setResult(null);
      const staged = await api?.choose();
      if (!staged) return;
      setPreview(staged);
      setImportKeys(new Set(staged.agents.map((agent) => agent.key)));
      setImportSettings(staged.hasSettings);
    }, t("Could not read the file."));
  }

  function discard() {
    const open = preview();
    setPreview(null);
    if (open) void api?.discard({ token: open.token });
  }

  function apply() {
    const open = preview();
    if (!open) return;
    void run(async () => {
      const outcome = await api?.apply({
        token: open.token,
        keys: [...importKeys()],
        includeSettings: importSettings() && open.hasSettings,
      });
      setPreview(null);
      if (outcome) setResult(outcome);
    }, t("Could not import the agents."));
  }

  const importNothing = () => importKeys().size === 0 && !(importSettings() && preview()?.hasSettings);

  const importArea = () => (
    <div class="transfer-import">
      <Show when={!preview()}>
        <Button type="button" disabled={busy()} onClick={chooseFile}>
          {t("Choose a .zip file")}
        </Button>
      </Show>
      <Show when={preview()}>
        {(staged) => (
          <fieldset class="transfer-preview" aria-label={t("What is in the file")}>
            <p class="server-settings-note">
              {t("From {app}", { app: staged().sourceApp })}
              <Show when={staged().exportedAt}>
                {" · "}
                {new Date(staged().exportedAt ?? "").toLocaleString(appLocale())}
              </Show>
              {". "}
              {t("Nothing changes until you import.")}
            </p>
            <ul class="transfer-agents">
              <For each={staged().agents}>
                {(agent) => (
                  <li>
                    <Switch
                      checked={importKeys().has(agent.key)}
                      onChange={() => setImportKeys(toggle(importKeys(), agent.key))}
                      label={
                        <>
                          <strong>{agent.name}</strong>
                          <Show when={agent.title}> · {agent.title}</Show>
                        </>
                      }
                    />
                    <small>
                      {t("{skills} skills, {memories} memories, {routines} routines", {
                        skills: agent.skillNames.length,
                        memories: agent.memoryCount,
                        routines: agent.routineNames.length,
                      })}
                      <Show when={agent.nameTaken}>
                        {" · "}
                        {t("This name exists here: a numbered copy is made, nothing is overwritten.")}
                      </Show>
                    </small>
                  </li>
                )}
              </For>
            </ul>
            <Show when={staged().hasSettings}>
              <Switch
                checked={importSettings()}
                onChange={setImportSettings}
                label={t("Also import the server settings")}
              />
            </Show>
            <For each={staged().warnings}>{(warning) => <p class="server-settings-note">{t(warning)}</p>}</For>
            <div class="vault-connector-actions">
              <Button type="button" disabled={busy() || importNothing()} onClick={apply}>
                {t("Import")}
              </Button>
              <Button type="button" variant="ghost" disabled={busy()} onClick={discard}>
                {t("Cancel")}
              </Button>
            </div>
          </fieldset>
        )}
      </Show>
      <Show when={result()}>
        {(done) => (
          <div class="transfer-result" role="status">
            <p>
              {done().agents.length > 0
                ? t("Imported {count} agents as new ones:", { count: done().agents.length })
                : t("No agent was imported.")}
            </p>
            <ul>
              <For each={done().agents}>{(agent) => <li>{agent.name}</li>}</For>
            </ul>
            <Show when={done().settingsApplied}>
              <p>{t("The server settings were imported.")}</p>
            </Show>
            <Show when={done().skipped.some((entry) => entry.reason !== "unselected")}>
              <p class="server-settings-note">
                {t("{count} could not be imported.", {
                  count: done().skipped.filter((entry) => entry.reason !== "unselected").length,
                })}
              </p>
            </Show>
            <For each={done().warnings}>{(warning) => <p class="server-settings-note">{t(warning)}</p>}</For>
          </div>
        )}
      </Show>
    </div>
  );

  return (
    <div class="instance-transfer" data-mode={props.mode}>
      <Show
        when={api}
        fallback={<p class="server-settings-note">{t("Import and Transfer are not available in this version.")}</p>}
      >
        <Show when={error()}>
          <p class="server-settings-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={loaded()} fallback={<CosgralLoadingSkeleton label={t("Loading…")} />}>
          <Show when={props.mode === "import"}>
            <ul class="vault-connector-list import-cards">
              <For each={sources()}>
                {(source) => (
                  <li
                    class="vault-connector-card"
                    data-state={source.available ? "connected" : "disconnected"}
                    data-source={source.id}
                  >
                    <header>
                      <strong>{t(source.label)}</strong>
                      <Show when={!source.available}>
                        <Badge tone="neutral">{t("Not available")}</Badge>
                      </Show>
                    </header>
                    <p class="vault-connectors-note">{t(source.description)}</p>
                    <Show when={source.note && source.id !== "other-computer"}>
                      <p class="vault-connectors-note">{t(source.note ?? "")}</p>
                    </Show>
                    <Show when={source.id === "agent-zip" && source.available}>{importArea()}</Show>
                    <Show when={source.id === "other-computer" && source.available}>
                      <div class="vault-connector-actions">
                        <Button type="button" variant="secondary" onClick={() => props.onOpenTransfer?.()}>
                          {t("Open Transfer")}
                        </Button>
                      </div>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>

          <Show when={props.mode === "transfer"}>
            <ol class="transfer-steps">
              <For each={TRANSFER_STEPS}>{(step) => <li>{t(step)}</li>}</For>
            </ol>
            <h3 class="messenger-subtitle">{t("Export agents")}</h3>
            <Show when={summary()}>
              {(info) => (
                <>
                  <Show
                    when={info().agents.length > 0}
                    fallback={<p class="server-settings-note">{t("There are no agents to export yet.")}</p>}
                  >
                    <ul class="transfer-agents">
                      <For each={info().agents}>
                        {(agent) => (
                          <li>
                            <Switch
                              checked={picked().has(agent.id)}
                              onChange={() => setPicked(toggle(picked(), agent.id))}
                              label={
                                <>
                                  <strong>{agent.name}</strong>
                                  <Show when={agent.title}> · {agent.title}</Show>
                                </>
                              }
                            />
                            <small>
                              {t("{skills} skills, {memories} memories, {routines} routines", {
                                skills: agent.skillCount,
                                memories: agent.memoryCount,
                                routines: agent.routineCount,
                              })}
                            </small>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                  <Show when={info().capabilities.settings}>
                    <Switch
                      checked={withSettings()}
                      onChange={setWithSettings}
                      label={t("Also export the server settings")}
                    />
                  </Show>
                  <div class="vault-connector-actions">
                    <Button
                      type="button"
                      disabled={busy() || (picked().size === 0 && !(withSettings() && info().capabilities.settings))}
                      onClick={exportAgents}
                    >
                      {t("Export to a .zip file")}
                    </Button>
                  </div>
                  <Show when={exported()}>
                    {(outcome) => {
                      const saved = outcome();
                      return (
                        <div role="status">
                          <p class="server-settings-note">
                            {saved.status === "saved"
                              ? t("Saved {file} ({size}), {count} agents.", {
                                  file: saved.fileName,
                                  size: formatBytes(saved.bytes),
                                  count: saved.agents,
                                })
                              : t("Nothing was saved.")}
                          </p>
                          <Show when={saved.status === "saved" ? saved.warnings : []}>
                            {(warnings) => (
                              <For each={warnings()}>
                                {(warning) => <p class="server-settings-note">{t(warning)}</p>}
                              </For>
                            )}
                          </Show>
                        </div>
                      );
                    }}
                  </Show>
                </>
              )}
            </Show>
            <h3 class="messenger-subtitle">{t("Import agents")}</h3>
            {importArea()}
            <h3 class="messenger-subtitle">{t("What is never moved")}</h3>
            <ul class="transfer-not-moved">
              <For each={TRANSFER_NOT_MOVED}>{(item) => <li>{t(item)}</li>}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
