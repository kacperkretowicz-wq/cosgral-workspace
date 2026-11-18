import {
  CHANNEL_HISTORY_WINDOWS,
  type ChannelHistoryWindow,
  DEFAULT_CHANNEL_HISTORY_WINDOW,
} from "@openbot/contracts/ipc";
import { createSignal, createUniqueId, For, Show } from "solid-js";
import { t } from "../i18n";
import { NativeSelect, Text } from "./ui";

/**
 * "History window" of a channel: how many of the last messages an agent gets with a task (channels.update, historyWindow).
 * A shorter window means a shorter context, so the task is faster and cheaper; the request of the task is always attached. The change
 * counts from the next task. The program says no to a value outside the list; its sentence is shown as it comes.
 */
export function ChannelHistoryWindowSetting(props: {
  /** The saved value; absent means the default of the program. */
  value?: ChannelHistoryWindow;
  onChange: (value: ChannelHistoryWindow) => Promise<void>;
}) {
  const id = createUniqueId();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saved, setSaved] = createSignal(false);

  async function change(raw: string) {
    const next = CHANNEL_HISTORY_WINDOWS.find((option) => String(option) === raw);
    if (next === undefined || busy()) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await props.onChange(next);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save the history window."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="channel-history-window" aria-label={t("History window")}>
      <label for={id}>{t("History window")}</label>{" "}
      <NativeSelect
        id={id}
        value={String(props.value ?? DEFAULT_CHANNEL_HISTORY_WINDOW)}
        disabled={busy()}
        onChange={(event) => void change(event.currentTarget.value)}
      >
        <For each={CHANNEL_HISTORY_WINDOWS}>
          {(option) => <option value={String(option)}>{t("Last {count} messages", { count: option })}</option>}
        </For>
      </NativeSelect>
      <Text as="p" tone="muted" variant="caption">
        {t(
          "Fewer messages mean a shorter context for the agent, so tasks are faster and cheaper. The request of the task is always attached. A change counts from the next task.",
        )}
      </Text>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={saved() && !error()}>
        <p role="status">{t("History window saved.")}</p>
      </Show>
    </section>
  );
}
