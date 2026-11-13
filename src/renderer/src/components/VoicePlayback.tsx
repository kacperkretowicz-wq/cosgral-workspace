import { VOICE_LIMITS } from "@openbot/contracts/ipc";
import { createEffect, createSignal, Show } from "solid-js";
import type { BotMessage } from "../data";

export function VoicePlayback(props: { text: string; enabled: boolean }) {
  const [error, setError] = createSignal("");
  return (
    <Show when={props.enabled}>
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
