import { VOICE_LIMITS } from "@openbot/contracts/ipc";
import { createEffect, createSignal, Show } from "solid-js";
import type { BotMessage } from "../data";

/** The reply that is being read right now (one at a time: speaking a new one stops the old one). */
const [readingMessageId, setReadingMessageId] = createSignal<string | null>(null);

/** "Read aloud" as a message action beside the reply; while it reads, the same button stops it. */
export function VoicePlayback(props: { messageId: string; text: string; enabled: boolean }) {
  const [error, setError] = createSignal("");
  const reading = () => readingMessageId() === props.messageId;
  async function read() {
    const api = window.openbot.voice;
    if (!api) return;
    setError("");
    setReadingMessageId(props.messageId);
    try {
      await api.speak({ text: props.text.slice(0, VOICE_LIMITS.speakText) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (readingMessageId() === props.messageId) setReadingMessageId(null);
    }
  }
  async function stop() {
    try {
      await window.openbot.voice?.stop();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <Show when={props.enabled}>
      <span class={["message-actions", "voice-playback", { "message-actions-open": reading() || Boolean(error()) }]}>
        <button
          type="button"
          class="message-action-button"
          aria-label={reading() ? "Stop reading" : "Read aloud"}
          title={reading() ? "Stop reading" : "Read aloud"}
          aria-pressed={reading() ? "true" : "false"}
          onClick={() => void (reading() ? stop() : read())}
        >
          <Show
            when={reading()}
            fallback={
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M3.5 8v4h3l4 3.5v-11l-4 3.5h-3Z" />
                <path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.4 6.4 0 0 1 0 9" />
              </svg>
            }
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
            </svg>
          </Show>
        </button>
        <Show when={error()}>
          <span class="voice-playback-error" role="alert">
            {error()}
          </span>
        </Show>
      </span>
    </Show>
  );
}
export function VoiceAutoRead(props: { botId: string; messages: BotMessage[] }) {
  let botId = "",
    initialized = false;
  const seen = new Set<string>();
  createEffect(
    () => ({
      bot: props.botId,
      messages: props.messages.map((message) => ({
        id: message.id,
        body: message.body,
        author: message.author,
        streaming: message.streaming,
        animate: message.animate,
        kind: message.kind,
        itemType: message.itemType,
      })),
    }),
    ({ bot, messages }) => {
      if (bot !== botId) {
        botId = bot;
        seen.clear();
        initialized = false;
      }
      if (!initialized) {
        for (const message of messages) if (!message.streaming) seen.add(message.id);
        initialized = true;
        return;
      }
      for (const message of messages) {
        if (
          message.author !== "bot" ||
          message.kind === "thinking" ||
          message.kind === "exchange" ||
          message.itemType === "commentary" ||
          message.streaming ||
          seen.has(message.id) ||
          !message.body.trim() ||
          message.animate !== true
        )
          continue;
        seen.add(message.id);
        const api = window.openbot.voice;
        if (api)
          void api
            .getState()
            .then((state) => {
              if (state.settings.enabled && state.settings.autoRead && state.speech.available)
                return api.speak({ text: message.body.slice(0, VOICE_LIMITS.speakText) });
            })
            .catch(() => undefined);
      }
    },
  );
  return null;
}
