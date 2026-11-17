import type {
  AgentBusyMessageMode,
  AgentCardId,
  AgentCardsOverview,
  AgentChatColor,
  AgentEvent,
  AgentNotificationLevel,
  AgentPreferenceChanges,
  AgentPreferences,
} from "@openbot/contracts/ipc";
import { AGENT_BUSY_MESSAGE_MODES, AGENT_CHAT_COLORS, AGENT_NOTIFICATION_LEVELS } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Button, NativeSelect, Switch } from "./ui";

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

const COLOR_LABELS: Record<AgentChatColor, string> = {
  default: "None",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  red: "Red",
  violet: "Violet",
  pink: "Pink",
  teal: "Teal",
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
      void load();
    },
  );

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
      <h3>{t("Agent cards")}</h3>
      <Show when={api} fallback={<p class="agent-cards-note">{t("Agent cards are not available in this version.")}</p>}>
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
              <p role="status">{t("Loading cards…")}</p>
            </Show>
          }
        >
          {(cards) => (
            <ul class="agent-cards-list">
              <For each={cards().cards}>
                {(card) => (
                  <li class="agent-card-row" data-available={card.available ? "true" : "false"}>
                    <strong>{t(CARD_LABELS[card.id])}</strong>
                    <span class="agent-card-summary">
                      {card.available
                        ? card.summary
                        : `${t("Unavailable in this version")}${card.summary ? `: ${card.summary}` : ""}`}
                    </span>
                    <Show when={card.available && card.count !== null}>
                      <span class="agent-card-count">{card.count}</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          )}
        </Show>
        <Show when={prefs()}>
          {(value) => (
            <div class="agent-cards-prefs">
              <label class="agent-cards-field">
                <span>{t("Chat color")}</span>
                <NativeSelect
                  value={value().chatColor}
                  disabled={busy()}
                  onChange={(event) =>
                    void change({ chatColor: pick(AGENT_CHAT_COLORS, event.currentTarget.value, "default") })
                  }
                >
                  <For each={AGENT_CHAT_COLORS}>
                    {(color) => <option value={color}>{t(COLOR_LABELS[color])}</option>}
                  </For>
                </NativeSelect>
              </label>
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
    </section>
  );
}
