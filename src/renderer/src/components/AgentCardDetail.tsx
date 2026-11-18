import type { AgentCardDetails, AgentDetailCardId, AgentPublishDetails } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { formatFileSize } from "./conversation/AttachmentCards";
import { Button } from "./ui";

const ACCESS_LABELS: Record<string, string> = {
  "working-folder": "Working folder only",
  "ask-first": "Ask first",
  full: "Full access",
};

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

/**
 * What one agent card shows when it is opened (window.openbot.agentCards.details): Files, Folders, Usage, Publish, Advanced and
 * Notifications. One read per card; Publish can save or remove the template of this agent. Read-only otherwise.
 */
export function AgentCardDetail(props: { botId: string; card: AgentDetailCardId; title: string; onClose: () => void }) {
  const api = untrack(() => window.openbot?.agentCards);
  const [details, setDetails] = createSignal<AgentCardDetails | null>(null);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let serial = 0;

  async function load() {
    if (!api) return;
    const n = ++serial;
    try {
      const next = await api.details({ botId: props.botId, card: props.card });
      if (n === serial) {
        setDetails(next);
        setError("");
      }
    } catch (cause) {
      if (n === serial) setError(cause instanceof Error ? cause.message : t("Could not open the card."));
    }
  }

  onSettled(() => {
    void load();
    return () => {
      serial++;
    };
  });

  async function publish(action: "publish" | "unpublish") {
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    try {
      const next: AgentPublishDetails =
        action === "publish"
          ? await api.publishTemplate({ botId: props.botId })
          : await api.unpublishTemplate({ botId: props.botId });
      setDetails(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change the template."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="agent-card-detail" aria-label={t("{card} details", { card: props.title })}>
      <header>
        <h4>{props.title}</h4>
        <Button type="button" variant="ghost" onClick={props.onClose}>
          {t("Close")}
        </Button>
      </header>
      <Show when={error()}>
        <p class="agent-cards-error" role="alert">
          {error()}
          <Button type="button" variant="ghost" onClick={() => void load()}>
            {t("Retry")}
          </Button>
        </p>
      </Show>
      <Show
        when={details()}
        fallback={
          <Show when={!error()}>
            <p role="status">{t("Loading…")}</p>
          </Show>
        }
      >
        {(value) => {
          const d = value();
          switch (d.card) {
            case "files":
              return (
                <>
                  <p class="agent-cards-note">{t("{count} files", { count: d.total })}</p>
                  <Show when={d.items.length === 0}>
                    <p class="agent-cards-note">{t("This agent has not saved any files.")}</p>
                  </Show>
                  <ul class="agent-card-detail-list">
                    <For each={d.items}>
                      {(item) => (
                        <li>
                          <strong>{item.name}</strong>
                          <small>
                            {formatFileSize(item.size)} · {when(item.createdAt)}
                          </small>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Show when={d.truncated}>
                    <p class="agent-cards-note">{t("Only the newest files are listed.")}</p>
                  </Show>
                </>
              );
            case "folders":
              return (
                <dl class="agent-card-detail-facts">
                  <dt>{t("Working folder")}</dt>
                  <dd>{d.workspace}</dd>
                  <dt>{t("Access")}</dt>
                  <dd>{t(ACCESS_LABELS[d.level] ?? d.level)}</dd>
                  <dt>{t("Extra folders")}</dt>
                  <dd>{d.additional.length ? d.additional.join(", ") : t("None")}</dd>
                  <dt>{t("Excluded")}</dt>
                  <dd>{d.excluded.length ? d.excluded.join(", ") : t("None")}</dd>
                </dl>
              );
            case "usage":
              return (
                <dl class="agent-card-detail-facts">
                  <dt>{t("Tokens")}</dt>
                  <dd>{d.status.usage.tokens.toLocaleString()}</dd>
                  <dt>{t("Turns")}</dt>
                  <dd>{d.status.usage.turns}</dd>
                  <dt>{t("Cost")}</dt>
                  <dd>
                    {d.status.usage.pricedTurns === 0
                      ? t("No price reported")
                      : `${d.status.usage.costComplete ? "" : "≥ "}$${d.status.usage.costUsd.toFixed(2)}`}
                  </dd>
                  <dt>{t("Budget")}</dt>
                  <dd>
                    {d.status.budget
                      ? d.status.tokenPercent !== null
                        ? t("{percent}% of the token limit", { percent: d.status.tokenPercent })
                        : t("Set")
                      : t("No budget set")}
                  </dd>
                  <Show when={d.status.reason}>
                    <dt>{t("Note")}</dt>
                    <dd>{d.status.reason}</dd>
                  </Show>
                </dl>
              );
            case "publish":
              return (
                <>
                  <Show
                    when={d.template}
                    fallback={<p class="agent-cards-note">{t("This agent is not saved as a template.")}</p>}
                  >
                    {(template) => (
                      <p class="agent-cards-note">
                        {t("Saved as “{name}”", { name: template().name })}
                        {template().createdAt ? ` · ${when(template().createdAt)}` : ""}
                      </p>
                    )}
                  </Show>
                  <p class="agent-cards-note">
                    {t("{count} of {max} templates saved", { count: d.savedTemplates, max: d.maxTemplates })}
                  </p>
                  <div class="agent-card-detail-actions">
                    <Show
                      when={d.template}
                      fallback={
                        <Button
                          type="button"
                          variant="primary"
                          disabled={busy() || d.savedTemplates >= d.maxTemplates}
                          onClick={() => void publish("publish")}
                        >
                          {t("Save as template")}
                        </Button>
                      }
                    >
                      <Button type="button" disabled={busy()} onClick={() => void publish("unpublish")}>
                        {t("Remove the template")}
                      </Button>
                    </Show>
                  </div>
                </>
              );
            case "advanced":
              return (
                <dl class="agent-card-detail-facts">
                  <dt>{t("Provider session")}</dt>
                  <dd>{d.hasSession ? t("Open") : t("None")}</dd>
                  <dt>{t("Messages in this thread")}</dt>
                  <dd>{d.messages}</dd>
                </dl>
              );
            case "notifications":
              return (
                <dl class="agent-card-detail-facts">
                  <dt>{t("Level")}</dt>
                  <dd>{d.level}</dd>
                  <dt>{t("Muted")}</dt>
                  <dd>{d.muted ? t("Yes") : t("No")}</dd>
                </dl>
              );
          }
        }}
      </Show>
    </section>
  );
}
