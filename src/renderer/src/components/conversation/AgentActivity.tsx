import { For, Show } from "solid-js";
import type { BotMessage, BotProfile } from "../../data";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { ChevronIcon, ThinkingIcon } from "./ConversationIcons";

export function AgentActivityIndicator(props: { bot: BotProfile | undefined; state: "Queued" | "Working" | null }) {
  return (
    <Show when={props.state !== null}>
      <div
        class="agent-activity-entry agent-activity-entry-visible"
        role="status"
        aria-label={t("{name} is {state}", {
          name: props.bot?.name ?? t("Agent"),
          state: props.state === "Working" ? t("working") : t("queued"),
        })}
      >
        <Show when={props.state !== "Working"}>
          <AgentAvatar bot={props.bot} class="agent-activity-avatar" />
        </Show>
        <div class="agent-activity-bubble" aria-hidden="true">
          <span>{props.state === "Working" ? t("Working") : t("Queued")}</span>
          <span class="agent-activity-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </Show>
  );
}

export function ThinkingDisclosure(props: { message: BotMessage }) {
  const stepCount = () => props.message.items?.length ?? 0;
  const finished = () => !props.message.streaming && stepCount() > 0;
  return (
    <article class="thinking-entry">
      <details class="thinking-disclosure">
        <summary aria-label={t("Show thinking details")}>
          <span class="thinking-mark" aria-hidden="true">
            <ThinkingIcon />
          </span>
          <span>
            {finished()
              ? t(stepCount() === 1 ? "{count} step" : "{count} steps", { count: stepCount() })
              : t("Thinking")}
          </span>
          <Show when={props.message.streaming}>
            <span class="thinking-live-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </Show>
          <span class="thinking-chevron" aria-hidden="true">
            <ChevronIcon />
          </span>
        </summary>
        <div class="thinking-details">
          <For each={props.message.items ?? []}>{(item) => <p>{item}</p>}</For>
        </div>
      </details>
    </article>
  );
}
