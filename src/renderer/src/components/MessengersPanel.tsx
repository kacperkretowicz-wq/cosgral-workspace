import {
  type AllowedChat,
  type BotSummary,
  isConversationIdFor,
  isSlackAppToken,
  isSlackBotToken,
  isTelegramToken,
  type MessengerKind,
  type MessengerList,
  type MessengerStatus,
  messengerDescriptor,
  type UnknownChat,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Badge, type BadgeTone, Button, Input, NativeSelect } from "./ui";

const PHASE_VIEW: Record<MessengerStatus["phase"], { label: string; tone: BadgeTone }> = {
  disconnected: { label: "Not connected", tone: "neutral" },
  connecting: { label: "Connecting…", tone: "accent" },
  connected: { label: "Connected", tone: "success" },
  failed: { label: "Problem", tone: "danger" },
};

type Secrets = Partial<Record<MessengerKind, { token: string; appToken: string }>>;

/** The shape check before anything is sent: the service decides if the token is real. */
function secretsLookRight(kind: MessengerKind, secrets: { token: string; appToken: string }): boolean {
  if (kind === "slack") return isSlackBotToken(secrets.token.trim()) && isSlackAppToken(secrets.appToken.trim());
  return isTelegramToken(secrets.token.trim());
}

/**
 * Messengers (window.openbot.messengers): Telegram and Slack. Each card shows the state, takes the token(s) (write-only: the field is
 * cleared after sending and a token never comes back), lists the conversations that may talk to an agent and the unknown ones that wrote,
 * and says plainly that only private conversations are answered and nobody is allowed until you add them.
 */
export function MessengersPanel() {
  const api = untrack(() => window.openbot?.messengers);
  const [list, setList] = createSignal<MessengerList | null>(null);
  const [bots, setBots] = createSignal<BotSummary[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal<MessengerKind | null>(null);
  const [secrets, setSecrets] = createSignal<Secrets>({});
  const [editing, setEditing] = createSignal<Partial<Record<MessengerKind, boolean>>>({});
  const [chatIds, setChatIds] = createSignal<Partial<Record<MessengerKind, string>>>({});
  const [labels, setLabels] = createSignal<Partial<Record<MessengerKind, string>>>({});
  const [agents, setAgents] = createSignal<Partial<Record<MessengerKind, string>>>({});
  const [formError, setFormError] = createSignal<Partial<Record<MessengerKind, string>>>({});

  const botName = (botId: string) => bots().find((bot) => bot.id === botId)?.name ?? botId;
  const agentFor = (kind: MessengerKind) => agents()[kind] ?? bots()[0]?.id ?? "";
  const secretsOf = (kind: MessengerKind) => secrets()[kind] ?? { token: "", appToken: "" };
  const setFormMessage = (kind: MessengerKind, message: string) => setFormError({ ...formError(), [kind]: message });

  // An event is newer than any read that started before it, so such a read is dropped.
  let serial = 0;
  async function load() {
    if (!api) return;
    const mine = ++serial;
    try {
      const [messengers, agentList] = await Promise.all([
        api.list(),
        window.openbot?.agent?.listBots({ includeHidden: false }) ?? Promise.resolve([]),
      ]);
      if (mine !== serial) return;
      setList(messengers);
      setBots(agentList);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not load the messengers."));
    } finally {
      setLoaded(true);
    }
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "messengers-changed") {
        serial += 1;
        setList({ spaceId: event.spaceId, messengers: event.messengers });
      }
    });
    return () => off?.();
  });

  async function run(kind: MessengerKind, work: () => Promise<unknown>, failure: string) {
    if (busy()) return;
    setBusy(kind);
    setError("");
    try {
      await work();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setBusy(null);
    }
  }

  function connect(kind: MessengerKind) {
    const value = secretsOf(kind);
    if (!secretsLookRight(kind, value)) {
      setFormMessage(
        kind,
        t("That does not look like a token of {name}. Check it and paste it again.", {
          name: messengerDescriptor(kind).label,
        }),
      );
      return;
    }
    setFormMessage(kind, "");
    void run(
      kind,
      async () => {
        try {
          await api?.connect({
            kind,
            token: value.token.trim(),
            ...(kind === "slack" ? { appToken: value.appToken.trim() } : {}),
          });
          setEditing({ ...editing(), [kind]: false });
        } finally {
          setSecrets({ ...secrets(), [kind]: { token: "", appToken: "" } });
        }
      },
      t("Could not connect."),
    );
  }

  function allow(kind: MessengerKind) {
    const chatId = (chatIds()[kind] ?? "").trim();
    const botId = agentFor(kind);
    if (!isConversationIdFor(kind, chatId)) {
      setFormMessage(kind, t(messengerDescriptor(kind).conversationIdHint));
      return;
    }
    if (!botId) {
      setFormMessage(kind, t("Choose the agent that answers."));
      return;
    }
    setFormMessage(kind, "");
    const label = (labels()[kind] ?? "").trim();
    void run(
      kind,
      async () => {
        await api?.allowChat({ kind, chatId, botId, ...(label ? { label } : {}) });
        setChatIds({ ...chatIds(), [kind]: "" });
        setLabels({ ...labels(), [kind]: "" });
      },
      t("Could not allow the conversation."),
    );
  }

  function prefill(kind: MessengerKind, chat: UnknownChat) {
    setChatIds({ ...chatIds(), [kind]: chat.chatId });
    setLabels({ ...labels(), [kind]: chat.label });
    setFormMessage(kind, "");
  }

  const showForm = (status: MessengerStatus) =>
    status.phase === "disconnected" || status.phase === "failed" || editing()[status.kind] === true;

  return (
    <section class="vault-connectors messengers" aria-label={t("Messengers")}>
      <h2>{t("Messengers")}</h2>
      <p class="vault-connectors-note">
        {t(
          "Talk to an agent from Telegram or Slack. Only private conversations are answered, and nobody is allowed until you add them.",
        )}
      </p>
      <Show
        when={api}
        fallback={<p class="vault-connectors-note">{t("Messengers are not available in this version.")}</p>}
      >
        <Show when={error()}>
          <p class="vault-connectors-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={loaded()} fallback={<p role="status">{t("Loading…")}</p>}>
          <ul class="vault-connector-list">
            <For each={list()?.messengers ?? []}>
              {(status) => {
                const descriptor = messengerDescriptor(status.kind);
                return (
                  <li class="vault-connector-card" data-state={status.phase} data-kind={status.kind}>
                    <header>
                      <strong>{status.label}</strong>
                      <Badge tone={PHASE_VIEW[status.phase].tone} dot>
                        {t(PHASE_VIEW[status.phase].label)}
                      </Badge>
                    </header>

                    <Show when={status.phase === "connected"}>
                      <p class="vault-connectors-note">
                        {status.botUsername ? t("Connected as {name}.", { name: status.botUsername }) : t("Connected.")}{" "}
                        {t(
                          "Since the program started: {forwarded} passed to an agent, {replied} answered, {ignored} ignored.",
                          {
                            forwarded: status.counts.forwarded,
                            replied: status.counts.replied,
                            ignored: status.counts.ignored,
                          },
                        )}
                      </p>
                    </Show>
                    <Show when={status.phase === "failed" && status.reason}>
                      <p class="vault-connectors-error" role="alert">
                        {t(status.reason ?? "")}
                      </p>
                    </Show>
                    <Show when={status.phase === "connecting"}>
                      <p class="vault-connectors-note" role="status">
                        {t("Checking the token…")}
                      </p>
                    </Show>

                    <Show when={showForm(status)}>
                      <div class="messenger-form">
                        <For each={descriptor.secrets}>
                          {(field) => (
                            <label class="messenger-field">
                              <span>{t(field.label)}</span>
                              <Input
                                type="password"
                                autocomplete="off"
                                aria-label={`${t(field.label)} (${status.label})`}
                                value={
                                  field.id === "token" ? secretsOf(status.kind).token : secretsOf(status.kind).appToken
                                }
                                onInput={(event) =>
                                  setSecrets({
                                    ...secrets(),
                                    [status.kind]: { ...secretsOf(status.kind), [field.id]: event.currentTarget.value },
                                  })
                                }
                              />
                              <small>{t(field.hint)}</small>
                            </label>
                          )}
                        </For>
                        <div class="vault-connector-actions">
                          <Button
                            type="button"
                            disabled={busy() !== null}
                            onClick={() => connect(status.kind)}
                            aria-label={`${status.phase === "connected" ? t("Replace the token") : t("Connect")} (${status.label})`}
                          >
                            {status.phase === "connected" ? t("Replace the token") : t("Connect")}
                          </Button>
                          <Show when={status.phase === "connected"}>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setEditing({ ...editing(), [status.kind]: false })}
                            >
                              {t("Cancel")}
                            </Button>
                          </Show>
                        </div>
                        <small>{t("The token is saved encrypted on this computer and is never shown again.")}</small>
                      </div>
                    </Show>

                    <Show when={status.phase === "connected" && !editing()[status.kind]}>
                      <div class="vault-connector-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setEditing({ ...editing(), [status.kind]: true })}
                        >
                          {t("Replace the token")}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busy() !== null}
                          aria-label={`${t("Disconnect")} (${status.label})`}
                          onClick={() =>
                            void run(
                              status.kind,
                              async () => api?.disconnect({ kind: status.kind }),
                              t("Could not disconnect."),
                            )
                          }
                        >
                          {t("Disconnect")}
                        </Button>
                      </div>
                    </Show>

                    <details class="messenger-steps">
                      <summary>{t("How to set it up")}</summary>
                      <ol>
                        <For each={descriptor.setupSteps}>{(step) => <li>{t(step)}</li>}</For>
                      </ol>
                    </details>

                    <h3 class="messenger-subtitle">{t("Who may talk to an agent")}</h3>
                    <Show
                      when={status.allowedChats.length > 0}
                      fallback={<p class="vault-connectors-note">{t("Nobody is allowed yet.")}</p>}
                    >
                      <ul class="vault-connector-logins">
                        <For each={status.allowedChats}>
                          {(chat: AllowedChat) => (
                            <li>
                              <span>
                                {chat.label || chat.chatId} · {botName(chat.botId)}
                              </span>
                              <small>{chat.chatId}</small>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={busy() !== null}
                                aria-label={`${t("Remove")} ${chat.label || chat.chatId}`}
                                onClick={() =>
                                  void run(
                                    status.kind,
                                    async () => api?.removeChat({ kind: status.kind, chatId: chat.chatId }),
                                    t("Could not remove the conversation."),
                                  )
                                }
                              >
                                {t("Remove")}
                              </Button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>

                    <Show when={status.unknownChats.length > 0}>
                      <p class="vault-connectors-note">
                        {t("These conversations wrote to the bot and are not allowed. What they wrote is never shown.")}
                      </p>
                      <ul class="vault-connector-logins">
                        <For each={status.unknownChats}>
                          {(chat: UnknownChat) => (
                            <li>
                              <span>{chat.label || chat.chatId}</span>
                              <small>
                                {t("{count} messages", { count: chat.count })} · {chat.chatId}
                              </small>
                              <Button
                                type="button"
                                variant="ghost"
                                aria-label={`${t("Allow")} ${chat.label || chat.chatId}`}
                                onClick={() => prefill(status.kind, chat)}
                              >
                                {t("Allow")}
                              </Button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>

                    <div class="messenger-form">
                      <label class="messenger-field">
                        <span>{t("Conversation id")}</span>
                        <Input
                          aria-label={`${t("Conversation id")} (${status.label})`}
                          value={chatIds()[status.kind] ?? ""}
                          onInput={(event) => setChatIds({ ...chatIds(), [status.kind]: event.currentTarget.value })}
                        />
                        <small>{t(descriptor.conversationIdHint)}</small>
                      </label>
                      <label class="messenger-field">
                        <span>{t("Name (optional)")}</span>
                        <Input
                          aria-label={`${t("Name (optional)")} (${status.label})`}
                          value={labels()[status.kind] ?? ""}
                          onInput={(event) => setLabels({ ...labels(), [status.kind]: event.currentTarget.value })}
                        />
                      </label>
                      <label class="messenger-field">
                        <span>{t("Agent that answers")}</span>
                        <NativeSelect
                          aria-label={`${t("Agent that answers")} (${status.label})`}
                          value={agentFor(status.kind)}
                          onChange={(event) => setAgents({ ...agents(), [status.kind]: event.currentTarget.value })}
                        >
                          <For each={bots()}>{(bot) => <option value={bot.id}>{bot.name}</option>}</For>
                        </NativeSelect>
                      </label>
                      <Show when={formError()[status.kind]}>
                        <p class="vault-connectors-error" role="alert">
                          {formError()[status.kind]}
                        </p>
                      </Show>
                      <div class="vault-connector-actions">
                        <Button
                          type="button"
                          disabled={busy() !== null}
                          aria-label={`${t("Allow this conversation")} (${status.label})`}
                          onClick={() => allow(status.kind)}
                        >
                          {t("Allow this conversation")}
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}
