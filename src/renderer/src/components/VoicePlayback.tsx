import { VOICE_LIMITS } from "@openbot/contracts/ipc";
import { createEffect, createSignal, onSettled, Show } from "solid-js";
import type { BotMessage } from "../data";

export function VoicePlayback(props: { text: string }) {
  const [enabled, setEnabled] = createSignal(false);
  const [error, setError] = createSignal("");
  onSettled(() => {
    const api = window.openbot.voice;
    if (!api) return;
    void api
      .getState()
      .then((state) => setEnabled(state.settings.enabled && state.speech.available))
      .catch(() => setEnabled(false));
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "voice-changed") setEnabled(event.state.settings.enabled && event.state.speech.available);
    });
  });
  return (
    <Show when={enabled()}>
      <span>
        <button
          type="button"
          onClick={() =>
            void window.openbot.voice
              ?.speak({ text: props.text.slice(0, VOICE_LIMITS.speakText) })
              .catch((e) => setError(String(e)))
          }
        >
          Read aloud
        </button>{" "}
        <button type="button" onClick={() => void window.openbot.voice?.stop().catch((e) => setError(String(e)))}>
          Stop reading
        </button>
        <Show when={error()}>
          <span role="alert">{error()}</span>
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
