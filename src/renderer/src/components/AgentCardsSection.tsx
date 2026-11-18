import type {
  AgentBusyMessageMode,
  AgentCardId,
  AgentCardsOverview,
  AgentDetailCardId,
  AgentEvent,
  AgentNotificationLevel,
  AgentPreferenceChanges,
  AgentPreferences,
} from "@openbot/contracts/ipc";
import { AGENT_BUSY_MESSAGE_MODES, AGENT_DETAIL_CARD_IDS, AGENT_NOTIFICATION_LEVELS } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { AgentCardDetail } from "./AgentCardDetail";
import { AgentCardPage, type AgentPageCardId, isAgentPageCard } from "./AgentCardPage";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Button, NativeSelect, Switch } from "./ui";
import {
  Bell,
  Brain,
  ChevronRight,
  Clock,
  FileText,
  Folder,
  FolderTree,
  Gauge,
  Layers,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Upload,
} from "./ui/icons";
import "../styles/agent-cards-grid.css";

/** Groups like OpenBot 0.71 agent settings (059): Brain, Knows, then the rest. */
const CARD_GROUPS: Array<{ title: string; ids: AgentCardId[] }> = [
  { title: "Brain", ids: ["backup-models", "chat-color"] },
  { title: "Knows", ids: ["instructions", "memory", "skills", "files"] },
  {
    title: "More",
    ids: ["tables", "routines", "usage", "publish", "permissions", "advanced", "folders", "notifications"],
  },
];

const CARD_LABELS: Record<AgentCardId, string> = {
  "chat-color": "Chat color",
  instructions: "Instructions",
  memory: "Memories",
  skills: "Skills",
  files: "Files",
  tables: "Tables",
  routines: "Routines",
  usage: "Usage",
  publish: "Publish",
  permissions: "Permissions",
  advanced: "Advanced",
  folders: "Folders",
  notifications: "Notify",
  "backup-models": "Backup models",
};

/** One own icon per card (20px, 1.5px line), drawn from the shared icon set. */
const CARD_ICONS: Record<AgentCardId, typeof Palette> = {
  "chat-color": Palette,
  instructions: FileText,
  memory: Brain,
  skills: Sparkles,
  files: Folder,
  tables: Table2,
  routines: Clock,
  usage: Gauge,
  publish: Upload,
  permissions: ShieldCheck,
  advanced: SlidersHorizontal,
  folders: FolderTree,
  notifications: Bell,
  "backup-models": Layers,
};

const BUSY_LABELS: Record<AgentBusyMessageMode, string> = {
  "app-default": "Follow the app setting",
  queue: "Queue the message",
  steer: "Steer the running work",
};

const NOTIFY_LABELS: Record<AgentNotificationLevel, string> = {
  all: "Everything",
  mentions: "Only when I am needed",
  none: "Nothing",
};

const SUMMARY_LABELS: Record<string, string> = {
  default: "None",
  "app-default": "Follow the app setting",
  queue: "Queue the message",
  steer: "Steer the running work",
  all: "Everything",
  mentions: "Only when I am needed",
  none: "Nothing",
  "working-folder": "Working folder",
};

function summaryText(summary: string): string {
  const key = SUMMARY_LABELS[summary];
  return key ? t(key) : summary;
}

function detailId(id: string): AgentDetailCardId | null {
  return AGENT_DETAIL_CARD_IDS.find((item) => item === id) ?? null;
}

function canOpenCard(id: AgentCardId): boolean {
  return isAgentPageCard(id) || detailId(id) !== null;
}

function pick<T extends string>(options: readonly T[], value: string, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

/**
 * The cards of one agent (window.openbot.agentCards): an overview with a count or one line each, and the small
 * per-agent choices of the Chat, Advanced and Notify cards. Cards without an engine say so instead of pretending.
 */
export function AgentCardsSection(props: { botId: string }) {
  const api = untrack(() => window.openbot?.agentCards);
  const [overview, setOverview] = createSignal<AgentCardsOverview | null>(null);
  const [prefs, setPrefs] = createSignal<AgentPreferences | null>(null);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [confirmReset, setConfirmReset] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [openDetail, setOpenDetail] = createSignal<AgentDetailCardId | null>(null);
  const [openPage, setOpenPage] = createSignal<AgentPageCardId | null>(null);
  const [botName, setBotName] = createSignal(t("Agent"));
  let generation = 0;

  async function load() {
    if (!api) return;
    const serial = ++generation;
    const botId = props.botId;
    try {
      const [cards, preferences] = await Promise.all([api.overview({ botId }), api.getPreferences({ botId })]);
      if (serial !== generation || botId !== props.botId) return;
      setOverview(cards);
      setPrefs(preferences);
      setError("");
    } catch (cause) {
      if (serial === generation)
        setError(cause instanceof Error ? cause.message : t("Could not load the agent cards."));
    }
  }

  createEffect(
    () => props.botId,
    () => {
      setOverview(null);
      setPrefs(null);
      setError("");
      setNotice("");
      setConfirmReset(false);
      setOpenDetail(null);
      setOpenPage(null);
      void load();
      void window.openbot?.agentSettings?.get(props.botId).then(
        (settings) => setBotName(settings.bot.name || t("Agent")),
        () => undefined,
      );
    },
  );

  function openCard(id: AgentCardId) {
    if (isAgentPageCard(id)) {
      setOpenDetail(null);
      setOpenPage((current) => (current === id ? null : id));
      return;
    }
    const detail = detailId(id);
    if (!detail) return;
    setOpenPage(null);
    setOpenDetail((current) => (current === detail ? null : detail));
  }

  onSettled(() => {
    const listen = window.openbot?.agent?.onEvent;
    if (!listen) return;
    return listen((event: AgentEvent) => {
      if (event.type === "agent-preferences-changed" && event.preferences.botId === props.botId) {
        setPrefs(event.preferences);
      }
    });
  });

  async function change(changes: AgentPreferenceChanges) {
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setPrefs(await api.updatePreferences({ botId: props.botId, ...changes }));
      setOverview(await api.overview({ botId: props.botId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save the agent preferences."));
    } finally {
      setBusy(false);
    }
  }

  async function resetSession() {
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    try {
      setOverview(await api.resetSession({ botId: props.botId }));
      setNotice(t("The next message starts with a fresh context. History stays."));
      setConfirmReset(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not reset the session."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="agent-cards" aria-label={t("Agent cards")}>
      <Show when={openPage()}>
        {(card) => (
          <AgentCardPage
            botId={props.botId}
            botName={botName()}
            card={card()}
            title={t(CARD_LABELS[card()])}
            chatColor={prefs()?.chatColor ?? "default"}
            prefsBusy={busy()}
            onChatColor={(color) => void change({ chatColor: color })}
            onBack={() => setOpenPage(null)}
          />
        )}
      </Show>
      <Show when={!openPage()}>
        <h3>{t("Agent cards")}</h3>
        <Show
          when={api}
          fallback={<p class="agent-cards-note">{t("Agent cards are not available in this version.")}</p>}
        >
          <Show when={error()}>
            <p class="agent-cards-error" role="alert">
              {error()}
              <Button type="button" variant="ghost" onClick={() => void load()}>
                {t("Retry")}
              </Button>
            </p>
          </Show>
          <Show
            when={overview()}
            fallback={
              <Show when={!error()}>
                <CosgralLoadingSkeleton label={t("Loading cards…")} />
              </Show>
            }
          >
            {(cards) => (
              <div class="agent-cards-groups">
                <For each={CARD_GROUPS}>
                  {(group) => {
                    const rows = () => cards().cards.filter((card) => group.ids.includes(card.id));
                    return (
                      <section class="agent-cards-group" aria-label={t(group.title)}>
                        <h4 class="agent-cards-group-title">{t(group.title)}</h4>
                        <ul class="agent-cards-list">
                          <For each={rows()}>
                            {(card) => (
                              <li
                                class="agent-card-row"
                                data-card={card.id}
                                data-available={card.available ? "true" : "false"}
                              >
                                <span class="agent-card-icon" aria-hidden="true">
                                  {(() => {
                                    const Icon = CARD_ICONS[card.id];
                                    return <Icon size={20} stroke-width={1.5} />;
                                  })()}
                                </span>
                                <strong>{t(CARD_LABELS[card.id])}</strong>
                                <span class="agent-card-summary">
                                  {card.available
                                    ? summaryText(card.summary)
                                    : `${t("Unavailable in this version")}${card.summary ? `: ${card.summary}` : ""}`}
                                </span>
                                <Show when={card.available && card.count !== null}>
                                  <span class="agent-card-count">{card.count}</span>
                                </Show>
                                <Show when={card.available && canOpenCard(card.id)}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    class="agent-card-open"
                                    aria-pressed={
                                      openPage() === card.id || openDetail() === detailId(card.id) ? "true" : "false"
                                    }
                                    aria-label={t("Open {title}", { title: t(CARD_LABELS[card.id]) })}
                                    onClick={() => openCard(card.id)}
                                  >
                                    <ChevronRight size={16} stroke-width={1.5} aria-hidden="true" />
                                  </Button>
                                </Show>
                              </li>
                            )}
                          </For>
                        </ul>
                      </section>
                    );
                  }}
                </For>
              </div>
            )}
          </Show>
          <Show when={openDetail()}>
            {(card) => (
              <AgentCardDetail
                botId={props.botId}
                card={card()}
                title={t(CARD_LABELS[card()])}
                onClose={() => setOpenDetail(null)}
              />
            )}
          </Show>
          <Show when={prefs()}>
            {(value) => (
              <div class="agent-cards-prefs">
                <label class="agent-cards-field">
                  <span>{t("When I write while the agent works")}</span>
                  <NativeSelect
                    value={value().busyMessage}
                    disabled={busy()}
                    onChange={(event) =>
                      void change({
                        busyMessage: pick(AGENT_BUSY_MESSAGE_MODES, event.currentTarget.value, "app-default"),
                      })
                    }
                  >
                    <For each={AGENT_BUSY_MESSAGE_MODES}>
                      {(mode) => <option value={mode}>{t(BUSY_LABELS[mode])}</option>}
                    </For>
                  </NativeSelect>
                </label>
                <Show when={!value().steerSupported && value().busyMessage === "steer"}>
                  <p class="agent-cards-note">
                    {t("This provider cannot steer a running turn: the message waits in the queue.")}
                  </p>
                </Show>
                <Switch
                  size="sm"
                  aria-label={t("Quick acknowledgement")}
                  label={t("Quick acknowledgement")}
                  checked={value().quickAcknowledgement}
                  disabled={busy()}
                  onChange={(next) => void change({ quickAcknowledgement: next })}
                />
                <label class="agent-cards-field">
                  <span>{t("Notify")}</span>
                  <NativeSelect
                    value={value().notificationLevel}
                    disabled={busy()}
                    onChange={(event) =>
                      void change({
                        notificationLevel: pick(AGENT_NOTIFICATION_LEVELS, event.currentTarget.value, "all"),
                      })
                    }
                  >
                    <For each={AGENT_NOTIFICATION_LEVELS}>
                      {(level) => <option value={level}>{t(NOTIFY_LABELS[level])}</option>}
                    </For>
                  </NativeSelect>
                </label>
                <Switch
                  size="sm"
                  aria-label={t("Agent may start new chats")}
                  label={t("Agent may start new chats")}
                  checked={value().agentStartsNewChats}
                  disabled={busy()}
                  onChange={(next) => void change({ agentStartsNewChats: next })}
                />
                <Switch
                  size="sm"
                  aria-label={t("Local scripts may message this agent")}
                  label={t("Local scripts may message this agent")}
                  checked={value().localScripts}
                  disabled={busy()}
                  onChange={(next) => void change({ localScripts: next })}
                />
                <div class="agent-cards-reset">
                  <Show
                    when={confirmReset()}
                    fallback={
                      <Button type="button" onClick={() => setConfirmReset(true)}>
                        {t("Reset session…")}
                      </Button>
                    }
                  >
                    <p>{t("Start the next message with a fresh context? The history stays.")}</p>
                    <Button type="button" variant="primary" disabled={busy()} onClick={() => void resetSession()}>
                      {t("Reset session")}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmReset(false)}>
                      {t("Cancel")}
                    </Button>
                  </Show>
                </div>
              </div>
            )}
          </Show>
          <Show when={notice()}>
            <p role="status">{notice()}</p>
          </Show>
        </Show>
      </Show>
    </section>
  );
}
