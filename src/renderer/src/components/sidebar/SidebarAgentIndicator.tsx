import { Show } from "solid-js";
import { t } from "../../i18n";
import type { SidebarAgentState } from "../../row-activity";
import { TypingDots } from "../TypingDots";

/** The small status mark at the end of an agent row: working, limit, error, responded, needs you or unread count. */
export function SidebarAgentIndicator(props: { state: SidebarAgentState }) {
  const unreadCount = () => (props.state.kind === "unread" ? props.state.count : 0);
  return (
    <span class={`bot-row-agent-status bot-row-agent-status-${props.state.kind}`} aria-hidden="true">
      <Show when={props.state.kind === "working"}>
        <TypingDots class="bot-row-thinking-dots" />
      </Show>
      <Show when={props.state.kind === "limited"}>
        <svg viewBox="0 0 12 12">
          <title>{t("Limit")}</title>
          <circle cx="6" cy="6" r="3.8" />
          <path d="M6 4.1V6l1.3.8" />
        </svg>
      </Show>
      <Show when={props.state.kind === "error"}>
        <svg viewBox="0 0 12 12">
          <title>{t("Error")}</title>
          <path d="M6 3.2v3.4M6 8.6v.2" />
        </svg>
      </Show>
      <Show when={props.state.kind === "responded"}>
        <svg viewBox="0 0 12 12">
          <title>{t("Responded")}</title>
          <path d="m3 6.2 1.8 1.8L9 3.8" />
        </svg>
      </Show>
      <Show when={props.state.kind === "needs-you"}>
        <span class="bot-row-needs-you-dot" title={t("Needs you")} />
      </Show>
      <Show when={props.state.kind === "unread"}>
        <span>{unreadCount()}</span>
      </Show>
    </span>
  );
}
