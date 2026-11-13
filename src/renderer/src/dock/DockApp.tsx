// COSGRAL W3: the dock window (`#dock`). A working minimal view on the dock contract; the UI Designer owns the final
// screen. Mini chats use the usual agent API.

import {
  type AgentActivity,
  type AgentEvent,
  type BotSummary,
  type ConversationMessage,
  DOCK_SIZES,
  type DockState,
  defaultDockState,
} from "@openbot/contracts/ipc";
import { createSignal, For, flush, onSettled, Show } from "solid-js";

const CHAT_MESSAGES = 6;

export function DockApp() {
  const api = window.openbot;
  const [dock, setDock] = createSignal<DockState>(defaultDockState());
  const [bots, setBots] = createSignal<BotSummary[]>([]);
  const [activity, setActivity] = createSignal<Record<string, AgentActivity["kind"]>>({});
  const [messages, setMessages] = createSignal<ConversationMessage[]>([]);
  const [draft, setDraft] = createSignal("");
  const [error, setError] = createSignal("");

  const name = (botId: string) => bots().find((bot) => bot.id === botId)?.name ?? botId;
  const shown = () => dock().pins.filter((pin) => !pin.hidden && bots().some((bot) => bot.id === pin.botId));
  const hidden = () => dock().pins.filter((pin) => pin.hidden);
  const unpinned = () => bots().filter((bot) => !dock().pins.some((pin) => pin.botId === bot.id));

  async function run(action: () => Promise<DockState | undefined>) {
    setError("");
    try {
      const next = await action();
      if (next) setDock(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function loadChat(botId: string | null) {
    if (!botId) return setMessages([]);
    const conversation = await api.agent.readConversation(botId);
    setMessages(conversation.messages.filter((message) => message.status !== "streaming").slice(-CHAT_MESSAGES));
  }

  function move(botId: string, step: number) {
    const ids = dock().pins.map((pin) => pin.botId);
    const from = ids.indexOf(botId);
    const to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    void run(() => api.dock?.reorder({ botIds: ids }) ?? Promise.resolve(undefined));
  }

  async function send(botId: string) {
    const text = draft().trim();
    if (!text) return;
    setDraft("");
    await run(async () => {
      await api.agent.sendMessage({ botId, text });
      return undefined;
    });
  }

  function handle(event: AgentEvent) {
    if (event.type === "dock-changed") {
      const before = dock().openBotId;
      setDock(event.state);
      if (event.state.openBotId !== before) void loadChat(event.state.openBotId);
    } else if (event.type === "bots-changed") setBots(event.bots);
    else if (event.type === "activity-changed") {
      setActivity({ ...activity(), [event.activity.botId]: event.activity.kind });
    } else if (event.type === "conversation" && event.snapshot.botId === dock().openBotId) {
      setMessages(event.snapshot.messages.filter((message) => message.status !== "streaming").slice(-CHAT_MESSAGES));
    }
  }

  onSettled(() => {
    const unsubscribe = api.agent.onEvent((event) => flush(() => handle(event)));
    void (async () => {
      setBots(await api.agent.listBots());
      const rows = await api.agent.listActivity?.();
      if (rows) setActivity(Object.fromEntries(rows.map((row) => [row.botId, row.kind])));
      const state = await api.dock?.getState();
      if (state) {
        setDock(state);
        await loadChat(state.openBotId);
      }
    })().catch((cause) => setError(String(cause)));
    return unsubscribe;
  });

  return (
    <div class="dock-window" data-testid="dock-window">
      <header class="dock-header">
        <strong>Dock</strong>
        <div class="dock-header-actions">
          <For each={DOCK_SIZES}>
            {(size) => (
              <button
                type="button"
                class={`dock-chip${dock().size === size ? " is-active" : ""}`}
                onClick={() => void run(() => api.dock?.setSize({ size }) ?? Promise.resolve(undefined))}
              >
                {size[0]?.toUpperCase()}
              </button>
            )}
          </For>
          <button type="button" class="dock-chip" onClick={() => void api.dock?.showMainWindow()}>
            Open COSGRAL
          </button>
          <button
            type="button"
            class="dock-chip"
            title="Hide the dock"
            onClick={() => void run(() => api.dock?.setVisible({ visible: false }) ?? Promise.resolve(undefined))}
          >
            ×
          </button>
        </div>
      </header>

      <Show when={!dock().mainWindowOpen}>
        <p class="dock-note">The main window is closed. Agents keep working here.</p>
      </Show>

      <Show when={unpinned().length > 0}>
        <label class="dock-pin">
          <span>Pin an agent</span>
          <select
            onChange={(event) => {
              const botId = event.currentTarget.value;
              event.currentTarget.value = "";
              if (botId) void run(() => api.dock?.pin({ botId }) ?? Promise.resolve(undefined));
            }}
          >
            <option value="">Choose…</option>
            <For each={unpinned()}>{(bot) => <option value={bot.id}>{bot.name}</option>}</For>
          </select>
        </label>
      </Show>

      <ul class="dock-list">
        <For each={shown()}>
          {(pin) => (
            <li class={`dock-item${dock().openBotId === pin.botId ? " is-open" : ""}`}>
              <div class="dock-item-row">
                <button
                  type="button"
                  class="dock-item-name"
                  onClick={() =>
                    void run(
                      () =>
                        api.dock?.openChat({ botId: dock().openBotId === pin.botId ? null : pin.botId }) ??
                        Promise.resolve(undefined),
                    )
                  }
                >
                  <span class={`dock-dot is-${activity()[pin.botId] ?? "idle"}`} />
                  {name(pin.botId)}
                </button>
                <button type="button" class="dock-icon" title="Move up" onClick={() => move(pin.botId, -1)}>
                  ↑
                </button>
                <button type="button" class="dock-icon" title="Move down" onClick={() => move(pin.botId, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  class="dock-icon"
                  title="Hide"
                  onClick={() =>
                    void run(
                      () => api.dock?.setPinHidden({ botId: pin.botId, hidden: true }) ?? Promise.resolve(undefined),
                    )
                  }
                >
                  –
                </button>
                <button
                  type="button"
                  class="dock-icon"
                  title="Unpin"
                  onClick={() => void run(() => api.dock?.unpin({ botId: pin.botId }) ?? Promise.resolve(undefined))}
                >
                  ×
                </button>
              </div>
              <Show when={dock().openBotId === pin.botId}>
                <div class="dock-chat">
                  <For each={messages()}>
                    {(message) => (
                      <p class={`dock-message${message.author === "user" ? " is-user" : ""}`}>{message.text}</p>
                    )}
                  </For>
                  <form
                    class="dock-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void send(pin.botId);
                    }}
                  >
                    <input
                      value={draft()}
                      placeholder={`Message ${name(pin.botId)}`}
                      onInput={(event) => setDraft(event.currentTarget.value)}
                    />
                    <button type="submit" class="dock-chip">
                      Send
                    </button>
                  </form>
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>

      <Show when={hidden().length > 0}>
        <div class="dock-hidden">
          <span>Hidden</span>
          <For each={hidden()}>
            {(pin) => (
              <button
                type="button"
                class="dock-chip"
                onClick={() =>
                  void run(
                    () => api.dock?.setPinHidden({ botId: pin.botId, hidden: false }) ?? Promise.resolve(undefined),
                  )
                }
              >
                {name(pin.botId)}
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={error()}>
        <p class="dock-error">{error()}</p>
      </Show>
    </div>
  );
}
