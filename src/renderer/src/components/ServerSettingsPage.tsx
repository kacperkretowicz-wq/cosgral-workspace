import type {
  ServerSettings,
  ServerSettingsSection,
  ServerSettingsSectionId,
  StorageReport,
} from "@openbot/contracts/ipc";
import {
  MEMORY_REVIEW_INTERVALS,
  RESPONSE_STYLES,
  SERVER_BUSY_MESSAGE_MODES,
  SERVER_SETTINGS_LIMITS,
  SKILL_LEARNING_MODES,
} from "@openbot/contracts/ipc";
import { createSignal, For, Match, onSettled, Show, Switch as SolidSwitch, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { InstanceTransferPanel } from "./InstanceTransferPanel";
import type { PageId } from "./PageRail";
import { Button, Input, NativeSelect, Switch } from "./ui";

const SECTION_LABELS: Record<ServerSettingsSectionId, string> = {
  general: "General",
  personality: "Personality",
  agents: "Agents",
  vault: "Vault",
  members: "Members",
  "remote-desktop": "Remote desktop",
  mcp: "MCP",
  storage: "Storage",
  sites: "Sites",
  providers: "Providers",
  import: "Import",
  transfer: "Transfer",
  routines: "Routines",
  "browser-profiles": "Browser profiles",
};

/** Sections that live on a page of their own; the others open the settings dialog. */
const PAGE_OF_SECTION: Partial<Record<ServerSettingsSectionId, PageId>> = {
  "remote-desktop": "remote-desktop",
  providers: "providers",
  routines: "schedule",
};

const MEMORY_REVIEW_LABELS: Record<number, string> = {
  0: "Never",
  5: "Every 5 turns",
  10: "Every 10 turns",
  20: "Every 20 turns",
  50: "Every 50 turns",
};

const LEARNING_LABELS = { auto: "Automatically", ask: "Ask first", off: "Off" } as const;
const STYLE_LABELS = { natural: "Natural", classic: "Classic" } as const;
const BUSY_LABELS = { queue: "Queue the message", steer: "Steer the running work" } as const;
const STORAGE_LABELS = {
  "chat-history": "Chat history",
  "provider-environments": "Provider environments",
  "app-data": "Program data",
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function pick<T extends string | number>(options: readonly T[], value: string, fallback: T): T {
  return options.find((option) => String(option) === value) ?? fallback;
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

interface ServerSettingsPageProps {
  /** Opens a page of the window (providers, remote desktop, schedule). */
  onOpenPage?: (page: PageId) => void;
  /** Opens the settings dialog (the sections that live there). */
  onOpenSettings?: () => void;
}

/**
 * The 14 sections of the server settings (window.openbot.serverSettings). General, Personality, Agents and Storage
 * are edited here; the sections that already have a screen point to it; the ones that need an online service say why
 * they are not available.
 */
export function ServerSettingsPage(props: ServerSettingsPageProps) {
  const api = untrack(() => window.openbot?.serverSettings);
  const [sections, setSections] = createSignal<ServerSettingsSection[]>([]);
  const [active, setActive] = createSignal<ServerSettingsSectionId>("general");
  const [saved, setSaved] = createSignal<ServerSettings | null>(null);
  const [draft, setDraft] = createSignal<ServerSettings | null>(null);
  const [storage, setStorage] = createSignal<StorageReport | null>(null);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [confirmClear, setConfirmClear] = createSignal(false);

  async function load() {
    if (!api) return;
    try {
      const [list, settings] = await Promise.all([api.sections(), api.get()]);
      setSections(list);
      setSaved(settings);
      setDraft(settings);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not load the server settings."));
    }
  }
  onSettled(() => {
    void load();
  });

  const dirty = () => JSON.stringify(saved()) !== JSON.stringify(draft());

  async function save() {
    const value = draft();
    if (!api || !value || busy()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.update({ general: value.general, personality: value.personality, agents: value.agents });
      setSaved(next);
      setDraft(next);
      setNotice(t("Saved."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save the server settings."));
    } finally {
      setBusy(false);
    }
  }

  async function measure(clear: boolean) {
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    try {
      setStorage(clear ? await api.clearLogs() : await api.measureStorage());
      setConfirmClear(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not measure the storage."));
    } finally {
      setBusy(false);
    }
  }

  const patch = <K extends keyof ServerSettings>(group: K, changes: Partial<ServerSettings[K]>) =>
    setDraft((current) => (current ? { ...current, [group]: { ...current[group], ...changes } } : current));

  const current = () => sections().find((section) => section.id === active());

  return (
    <main class="server-settings" aria-label={t("Server settings")}>
      <header class="server-settings-header">
        <h1>{t("Server settings")}</h1>
      </header>
      <Show
        when={api}
        fallback={<p class="server-settings-note">{t("Server settings are not available in this version.")}</p>}
      >
        <div class="server-settings-body">
          <nav class="server-settings-nav" aria-label={t("Sections")}>
            <For each={sections()}>
              {(section) => (
                <Button
                  type="button"
                  variant="ghost"
                  class="server-settings-nav-item"
                  aria-current={section.id === active() ? "page" : undefined}
                  onClick={() => {
                    setActive(section.id);
                    setNotice("");
                    if (section.id === "storage" && !storage()) void measure(false);
                  }}
                >
                  {t(SECTION_LABELS[section.id])}
                  <Show when={section.source.kind === "unavailable"}>
                    <small>{t("Unavailable")}</small>
                  </Show>
                </Button>
              )}
            </For>
          </nav>
          <section class="server-settings-panel" aria-label={t(SECTION_LABELS[active()])}>
            <h2>{t(SECTION_LABELS[active()])}</h2>
            <Show when={error()}>
              <p class="server-settings-error" role="alert">
                {error()}
                <Button type="button" variant="ghost" onClick={() => void load()}>
                  {t("Retry")}
                </Button>
              </p>
            </Show>
            <Show when={!current() && !error()}>
              <CosgralLoadingSkeleton label={t("Loading…")} />
            </Show>
            <Show when={current()}>
              {(section) => (
                <SolidSwitch>
                  <Match when={section().source.kind === "unavailable" ? section().source : undefined} keyed>
                    {(source) => (
                      <p class="server-settings-note">
                        {t("Not available on this computer")}
                        {source.kind === "unavailable" ? `: ${source.reason}` : ""}
                      </p>
                    )}
                  </Match>
                  <Match
                    when={section().id === "import" || section().id === "transfer" ? section().id : undefined}
                    keyed
                  >
                    {(id) => (
                      <InstanceTransferPanel
                        mode={id === "import" ? "import" : "transfer"}
                        onOpenTransfer={() => {
                          setActive("transfer");
                          setNotice("");
                        }}
                      />
                    )}
                  </Match>
                  <Match when={section().source.kind === "api"}>
                    <p class="server-settings-note">{t("This section has its own screen.")}</p>
                    <Button
                      type="button"
                      onClick={() => {
                        const page = PAGE_OF_SECTION[section().id];
                        if (page) props.onOpenPage?.(page);
                        else props.onOpenSettings?.();
                      }}
                    >
                      {t("Open")}
                    </Button>
                  </Match>
                  <Match when={draft()} keyed>
                    {(value) => (
                      <SolidSwitch>
                        <Match when={active() === "general"}>
                          <label class="server-settings-field">
                            <span>{t("Name")}</span>
                            <Input
                              value={value.general.name}
                              maxlength={SERVER_SETTINGS_LIMITS.nameMax}
                              onInput={(event) => patch("general", { name: event.currentTarget.value })}
                            />
                          </label>
                          <label class="server-settings-field">
                            <span>{t("Time zone")}</span>
                            <Input
                              value={value.general.timezone ?? ""}
                              placeholder={t("This computer")}
                              onInput={(event) =>
                                patch("general", { timezone: event.currentTarget.value.trim() || null })
                              }
                            />
                          </label>
                          <label class="server-settings-field">
                            <span>{t("Threads running at once (empty: no limit)")}</span>
                            <Input
                              inputmode="numeric"
                              value={value.general.maxThreads ?? ""}
                              onInput={(event) =>
                                patch("general", { maxThreads: numberOrNull(event.currentTarget.value) })
                              }
                            />
                          </label>
                          <label class="server-settings-field">
                            <span>{t("Threads per agent")}</span>
                            <Input
                              inputmode="numeric"
                              value={value.general.threadsPerAgent}
                              onInput={(event) =>
                                patch("general", {
                                  threadsPerAgent:
                                    numberOrNull(event.currentTarget.value) ??
                                    SERVER_SETTINGS_LIMITS.defaultThreadsPerAgent,
                                })
                              }
                            />
                          </label>
                          <label class="server-settings-field">
                            <span>{t("Memories per agent")}</span>
                            <Input
                              inputmode="numeric"
                              value={value.general.memoriesPerAgent}
                              onInput={(event) =>
                                patch("general", {
                                  memoriesPerAgent:
                                    numberOrNull(event.currentTarget.value) ?? SERVER_SETTINGS_LIMITS.defaultMemories,
                                })
                              }
                            />
                          </label>
                          <label class="server-settings-field">
                            <span>{t("Review memories")}</span>
                            <NativeSelect
                              value={String(value.general.memoryReviewEvery)}
                              onChange={(event) =>
                                patch("general", {
                                  memoryReviewEvery: pick(MEMORY_REVIEW_INTERVALS, event.currentTarget.value, 20),
                                })
                              }
                            >
                              <For each={MEMORY_REVIEW_INTERVALS}>
                                {(interval) => (
                                  <option value={String(interval)}>{t(MEMORY_REVIEW_LABELS[interval] ?? "")}</option>
                                )}
                              </For>
                            </NativeSelect>
                          </label>
                          <label class="server-settings-field">
                            <span>{t("Learn skills")}</span>
                            <NativeSelect
                              value={value.general.skillLearning}
                              onChange={(event) =>
                                patch("general", {
                                  skillLearning: pick(SKILL_LEARNING_MODES, event.currentTarget.value, "auto"),
                                })
                              }
                            >
                              <For each={SKILL_LEARNING_MODES}>
                                {(mode) => <option value={mode}>{t(LEARNING_LABELS[mode])}</option>}
                              </For>
                            </NativeSelect>
                          </label>
                          <Switch
                            size="sm"
                            aria-label={t("Learn from browsing")}
                            label={t("Learn from browsing")}
                            checked={value.general.learnFromBrowsing}
                            onChange={(next) => patch("general", { learnFromBrowsing: next })}
                          />
                        </Match>
                        <Match when={active() === "personality"}>
                          <label class="server-settings-field">
                            <span>{t("Response style")}</span>
                            <NativeSelect
                              value={value.personality.responseStyle}
                              onChange={(event) =>
                                patch("personality", {
                                  responseStyle: pick(RESPONSE_STYLES, event.currentTarget.value, "natural"),
                                })
                              }
                            >
                              <For each={RESPONSE_STYLES}>
                                {(style) => <option value={style}>{t(STYLE_LABELS[style])}</option>}
                              </For>
                            </NativeSelect>
                          </label>
                        </Match>
                        <Match when={active() === "agents"}>
                          <Switch
                            size="sm"
                            aria-label={t("Local scripts may message agents")}
                            label={t("Local scripts may message agents")}
                            checked={value.agents.localScripts}
                            onChange={(next) => patch("agents", { localScripts: next })}
                          />
                          <Switch
                            size="sm"
                            aria-label={t("Agents may start new chats")}
                            label={t("Agents may start new chats")}
                            checked={value.agents.agentStartsNewChats}
                            onChange={(next) => patch("agents", { agentStartsNewChats: next })}
                          />
                          <Switch
                            size="sm"
                            aria-label={t("Show the plan before long tasks")}
                            label={t("Show the plan before long tasks")}
                            checked={value.agents.showPlanBeforeLongTasks}
                            onChange={(next) => patch("agents", { showPlanBeforeLongTasks: next })}
                          />
                          <Switch
                            size="sm"
                            aria-label={t("Agents credit the program in commits")}
                            label={t("Agents credit the program in commits")}
                            checked={value.agents.mentionInCommits}
                            onChange={(next) => patch("agents", { mentionInCommits: next })}
                          />
                          <label class="server-settings-field">
                            <span>{t("When I write while an agent works")}</span>
                            <NativeSelect
                              value={value.agents.busyMessage}
                              onChange={(event) =>
                                patch("agents", {
                                  busyMessage: pick(SERVER_BUSY_MESSAGE_MODES, event.currentTarget.value, "queue"),
                                })
                              }
                            >
                              <For each={SERVER_BUSY_MESSAGE_MODES}>
                                {(mode) => <option value={mode}>{t(BUSY_LABELS[mode])}</option>}
                              </For>
                            </NativeSelect>
                          </label>
                        </Match>
                        <Match when={active() === "storage"}>
                          <Show when={storage()} fallback={<p role="status">{t("Measuring…")}</p>}>
                            {(report) => (
                              <>
                                <p>
                                  {t("The program keeps")} <strong>{formatBytes(report().totalBytes)}</strong>
                                  <Show when={report().freeBytes !== null}>
                                    {" · "}
                                    {t("Free on the disk")}: {formatBytes(report().freeBytes ?? 0)}
                                  </Show>
                                </p>
                                <ul class="server-settings-storage">
                                  <For each={report().items}>
                                    {(item) => (
                                      <li>
                                        <span>{t(STORAGE_LABELS[item.id])}</span>
                                        <span>{formatBytes(item.bytes)}</span>
                                      </li>
                                    )}
                                  </For>
                                </ul>
                                <p class="server-settings-note">
                                  {t("Cleaning logs would free")} {formatBytes(report().reclaimableBytes)}
                                </p>
                              </>
                            )}
                          </Show>
                          <div class="server-settings-actions">
                            <Button type="button" disabled={busy()} onClick={() => void measure(false)}>
                              {t("Measure again")}
                            </Button>
                            <Show
                              when={confirmClear()}
                              fallback={
                                <Button type="button" onClick={() => setConfirmClear(true)}>
                                  {t("Clear diagnostic logs…")}
                                </Button>
                              }
                            >
                              <Button
                                type="button"
                                variant="primary"
                                disabled={busy()}
                                onClick={() => void measure(true)}
                              >
                                {t("Clear diagnostic logs")}
                              </Button>
                              <Button type="button" variant="ghost" onClick={() => setConfirmClear(false)}>
                                {t("Cancel")}
                              </Button>
                            </Show>
                          </div>
                        </Match>
                      </SolidSwitch>
                    )}
                  </Match>
                </SolidSwitch>
              )}
            </Show>
            <Show
              when={["general", "personality", "agents"].includes(active()) && current()?.source.kind === "settings"}
            >
              <div class="server-settings-actions">
                <Button type="button" variant="primary" disabled={!dirty() || busy()} onClick={() => void save()}>
                  {busy() ? t("Saving…") : t("Save")}
                </Button>
                <Show when={dirty()}>
                  <Button type="button" variant="ghost" onClick={() => setDraft(saved())}>
                    {t("Discard changes")}
                  </Button>
                </Show>
              </div>
            </Show>
            <Show when={notice()}>
              <p role="status">{notice()}</p>
            </Show>
          </section>
        </div>
      </Show>
    </main>
  );
}
