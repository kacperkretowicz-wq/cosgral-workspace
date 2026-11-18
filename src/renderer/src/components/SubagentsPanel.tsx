import { SUBAGENT_LIMITS, type Subagent, type SubagentState, subagentIsActive } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Badge, type BadgeTone, Button, Text } from "./ui";

const STATE_VIEW: Record<SubagentState, { label: string; tone: BadgeTone }> = {
  starting: { label: "Starting…", tone: "accent" },
  working: { label: "Working", tone: "accent" },
  waiting: { label: "Waiting for you", tone: "warning" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  stopped: { label: "Stopped", tone: "neutral" },
};

/**
 * The helpers an agent started in the thread you look at (window.openbot.subagents): what each was asked, how far it is, its answer,
 * and "Stop". Only the agent starts a subagent; you watch it and can stop it. A question of a subagent is a card in "Needs you".
 * Nothing is shown while the thread has none.
 */
export function SubagentsPanel(props: { botId: string }) {
  const api = untrack(() => window.openbot?.subagents);
  const [items, setItems] = createSignal<Subagent[]>([]);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal<string | null>(null);

  // The newest read wins: an older read that finishes late is dropped.
  let serial = 0;
  async function load() {
    if (!api) return;
    const mine = ++serial;
    const botId = props.botId;
    try {
      const next = await api.list({ botId });
      if (mine === serial && botId === props.botId) {
        setItems(next);
        setError("");
      }
    } catch (cause) {
      if (mine === serial) setError(cause instanceof Error ? cause.message : t("Could not load the subagents."));
    }
  }

  createEffect(
    () => props.botId,
    () => {
      setItems([]);
      setError("");
      void load();
    },
  );

  onSettled(() => {
    const off = window.openbot?.agent?.onEvent((event) => {
      // A switch of thread or any change of a subagent of this agent: read the list of the thread on screen again.
      if (event.type === "threads-changed" && event.botId === props.botId) void load();
      if (event.type === "subagent-changed" && event.subagent.botId === props.botId) void load();
    });
    return () => off?.();
  });

  async function stop(item: Subagent) {
    if (!api || busy()) return;
    setBusy(item.id);
    setError("");
    try {
      await api.stop({ subagentId: item.id });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not stop the subagent."));
    } finally {
      setBusy(null);
    }
  }

  const working = () => items().filter(subagentIsActive).length;

  return (
    <Show when={api && (items().length > 0 || error())}>
      <details class="subagents-panel" open={working() > 0}>
        <summary>
          {t("Subagents: {working} working of {total}", { working: working(), total: items().length })}
        </summary>
        <Show when={error()}>
          <p class="vault-connectors-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Text as="p" tone="muted" variant="caption">
          {t("Only the agent starts a subagent. You can stop one at any time. At most {max} work at once.", {
            max: SUBAGENT_LIMITS.parallel,
          })}
        </Text>
        <ul class="subagents-list">
          <For each={items()}>
            {(item) => (
              <li class="subagent-card" data-state={item.state}>
                <header>
                  <strong>{item.title}</strong>
                  <Badge tone={STATE_VIEW[item.state].tone} dot>
                    {t(STATE_VIEW[item.state].label)}
                  </Badge>
                </header>
                <Text as="p" tone="muted" variant="caption" class="subagent-task">
                  {item.task}
                </Text>
                <Show when={item.state === "waiting"}>
                  <p class="vault-connectors-note" role="status">
                    {t("It asks you something: answer the card in Needs you.")}
                  </p>
                </Show>
                <Show when={subagentIsActive(item) && item.preview}>
                  {(preview) => <p class="subagent-preview">{preview()}</p>}
                </Show>
                <Show when={item.state === "done" && item.result}>
                  {(result) => (
                    <details class="subagent-result">
                      <summary>{t("Its answer")}</summary>
                      <p>{result()}</p>
                    </details>
                  )}
                </Show>
                <Show when={(item.state === "failed" || item.state === "stopped") && item.error}>
                  {(reason) => (
                    <p class="vault-connectors-note" role="status">
                      {t(reason())}
                    </p>
                  )}
                </Show>
                <Show when={subagentIsActive(item)}>
                  <div class="vault-connector-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      aria-label={t("Stop {title}", { title: item.title })}
                      disabled={busy() !== null}
                      onClick={() => void stop(item)}
                    >
                      {t("Stop")}
                    </Button>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </details>
    </Show>
  );
}
