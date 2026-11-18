import type { PendingThreadDelete } from "@openbot/contracts/ipc";
import { pendingDeleteSecondsLeft } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { Button } from "./ui";
import "../styles/thread-undo.css";

function formatLeft(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The "Deleted <title>. Undo" bar (window.openbot.threadUndo): one line per deleted thread that can still be brought back,
 * with a countdown to `expiresAt`. It does not hold the list itself; the owner passes it and handles `onUndo`.
 */
export function ThreadUndoBar(props: {
  pending: PendingThreadDelete[];
  busy?: boolean;
  now?: () => Date;
  onUndo: (item: PendingThreadDelete) => void;
}) {
  const clock = () => props.now?.() ?? new Date();
  const [tick, setTick] = createSignal(clock());
  onSettled(() => {
    const timer = setInterval(() => setTick(clock()), 1000);
    return () => clearInterval(timer);
  });
  const left = (item: PendingThreadDelete) => pendingDeleteSecondsLeft(item, tick());
  const open = () => props.pending.filter((item) => left(item) > 0);
  return (
    <Show when={open().length > 0}>
      <section class="thread-undo-bar" aria-label={t("Deleted threads")}>
        <For each={open()}>
          {(item) => (
            <div class="thread-undo-row" role="status">
              <span class="thread-undo-text">{t("Deleted “{title}”", { title: item.title })}</span>
              <span class="thread-undo-left" aria-hidden="true">
                {formatLeft(left(item))}
              </span>
              <span class="sr-only">{t("{seconds} s left to undo", { seconds: left(item) })}</span>
              <Button type="button" variant="primary" disabled={props.busy} onClick={() => props.onUndo(item)}>
                {t("Undo")}
              </Button>
              <span class="thread-undo-progress" aria-hidden="true">
                <span
                  class="thread-undo-progress-fill"
                  style={{
                    width: `${Math.min(100, (left(item) / Math.max(1, (Date.parse(item.expiresAt) - Date.parse(item.deletedAt)) / 1000)) * 100)}%`,
                  }}
                />
              </span>
            </div>
          )}
        </For>
      </section>
    </Show>
  );
}
