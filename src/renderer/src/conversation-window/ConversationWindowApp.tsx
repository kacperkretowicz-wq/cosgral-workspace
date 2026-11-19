// COSGRAL W6-KK3: the separate conversation window (`#conversation/<agent>/<thread>`). A working minimal view on the
// window contract; the UI Designer owns the final screen. It reads and writes through the usual agent API, like the
// main window: history, the message box and the live updates of the thread. When the agent shows another thread in the
// main window (`live: false`) it says so and shows no messages, so two threads are never mixed (spec-w6 1F).

import {
  type AgentEvent,
  type ConversationMessage,
  type ConversationWindowInfo,
  type ConversationWindowInput,
  conversationWindowId,
} from "@openbot/contracts/ipc";
import { createSignal, For, flush, onSettled, Show } from "solid-js";
import { Button, Textarea } from "../components/ui";
import { t } from "../i18n";

export function ConversationWindowApp(props: { target: ConversationWindowInput }) {
  const api = window.openbot;
  const [info, setInfo] = createSignal<ConversationWindowInfo | null>(null);
  const [messages, setMessages] = createSignal<ConversationMessage[]>([]);
  const [draft, setDraft] = createSignal("");
  const [error, setError] = createSignal("");
  const id = conversationWindowId(props.target.botId, props.target.threadId);

  async function load() {
    const conversation = await api.agent.readConversation(props.target.botId);
    setMessages(conversation.messages);
  }

  function handle(event: AgentEvent) {
    if (event.type === "conversation-windows-changed") {
      const mine = event.windows.find((window) => window.id === id) ?? null;
      const wasLive = info()?.live ?? false;
      setInfo(mine);
      if (mine?.live && !wasLive) void load().catch((cause) => setError(String(cause)));
    } else if (event.type === "conversation" && event.snapshot.botId === props.target.botId && info()?.live) {
      setMessages(event.snapshot.messages);
    }
  }

  onSettled(() => {
    const unsubscribe = api.agent.onEvent((event) => flush(() => handle(event)));
    void (async () => {
      const current = await api.windows?.current();
      setInfo(current ?? null);
      if (current?.live) await load();
    })().catch((cause) => setError(String(cause)));
    return unsubscribe;
  });

  async function send() {
    const text = draft().trim();
    if (!text || !info()?.live) return;
    setDraft("");
    setError("");
    try {
      await api.agent.sendMessage({ botId: props.target.botId, text });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div class="conversation-window" data-testid="conversation-window">
      <header class="conversation-window-header">
        <strong>{info()?.title ?? t("Conversation")}</strong>
      </header>
      <Show when={info() && !info()?.live}>
        <p class="conversation-window-note" role="status">
          {t("This agent shows another thread in the main window. Switch back to this thread there to follow it here.")}
        </p>
      </Show>
      <Show when={info() === null}>
        <p class="conversation-window-note" role="status">
          {t("This window is no longer linked to a conversation. Close it and open the conversation again.")}
        </p>
      </Show>
      <ol class="conversation-window-messages" aria-label={t("Messages")}>
        <For each={messages()}>
          {(message) => (
            <li class="conversation-window-message" data-author={message.author}>
              <span class="conversation-window-author">{message.author}</span>
              <span>{message.text}</span>
            </li>
          )}
        </For>
      </ol>
      <Show when={error()}>
        <p class="conversation-window-error" role="alert">
          {error()}
        </p>
      </Show>
      <form
        class="conversation-window-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          aria-label={t("Message")}
          rows={3}
          value={draft()}
          disabled={!info()?.live}
          onInput={(event) => setDraft(event.currentTarget.value)}
        />
        <Button type="submit" disabled={!info()?.live || draft().trim() === ""}>
          {t("Send")}
        </Button>
      </form>
    </div>
  );
}
