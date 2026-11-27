import type { ChannelHistoryCleared } from "@openbot/contracts/ipc";
import { createSignal, Show } from "solid-js";
import { errorText } from "../errors";
import { t } from "../i18n";
import { Button, Text } from "./ui";

/**
 * "Clear history" of a channel (window.openbot.channels.clearHistory). It removes the messages and the tasks of the channel; the channel,
 * its members, lead, instructions, memory and routines stay. It cannot be undone, so the person is asked first. The program refuses while
 * a task is queued, running, waiting or paused: its sentence is shown as it comes.
 */
export function ChannelHistoryClear(props: { onClear: () => Promise<ChannelHistoryCleared> }) {
  const [asking, setAsking] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [done, setDone] = createSignal<ChannelHistoryCleared | null>(null);

  async function clear() {
    if (busy()) return;
    setBusy(true);
    setError("");
    setDone(null);
    try {
      setDone(await props.onClear());
      setAsking(false);
    } catch (cause) {
      setError(errorText(cause, t("Could not clear the history.")));
      setAsking(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="channel-history-clear" aria-label={t("Project history")}>
      <Text as="p" tone="muted" variant="caption">
        {t("Removes all messages and tasks of this project. The project, its members, memory and routines stay.")}
      </Text>
      <Show
        when={asking()}
        fallback={
          <Button type="button" variant="danger" disabled={busy()} onClick={() => setAsking(true)}>
            {t("Clear history")}
          </Button>
        }
      >
        <fieldset class="channel-history-confirm" aria-label={t("Confirm clearing the history")}>
          <Text as="p">{t("Clear the whole history of this project? This cannot be undone.")}</Text>
          <Button type="button" variant="danger" disabled={busy()} onClick={() => void clear()}>
            {t("Yes, clear")}
          </Button>
          <Button type="button" variant="ghost" disabled={busy()} onClick={() => setAsking(false)}>
            {t("Keep")}
          </Button>
        </fieldset>
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={done()}>
        {(result) => (
          <p role="status">
            {t("Removed {messages} messages and {tasks} tasks.", {
              messages: result().removedMessages,
              tasks: result().removedTasks,
            })}
          </p>
        )}
      </Show>
    </section>
  );
}
