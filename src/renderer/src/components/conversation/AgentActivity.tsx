import { For, Show } from "solid-js";
import { agentStepsOpen } from "../../appearance";
import type { BotMessage, BotProfile } from "../../data";
import { t, tn } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { Brain, FileText, Globe, Pencil, Search, Terminal } from "../ui/icons";
import { ChevronIcon, ThinkingIcon } from "./ConversationIcons";
import { type LiveStatus, liveStatusText } from "./live-status";

type StepKind = "read" | "search" | "run" | "write" | "web" | "think";

/**
 * What a step was, read from its words (English and Polish): the steps arrive as plain text, so the icon is a hint,
 * and a step that matches nothing is drawn as thinking.
 */
export function stepKind(text: string): StepKind {
  const head = text.trim().toLowerCase();
  if (/^(searched|searching|search|looked|looking|find|found|grep|szuka|wyszuk|przeszuk)/u.test(head)) return "search";
  if (/^(ran|running|run|executed|executing|exec|command|bash|terminal|uruchom|wykona|polecenie)/u.test(head))
    return "run";
  if (/^(read|reading|opened|opening|open|viewed|viewing|loaded|czyta|przeczyta|otworz|otwier)/u.test(head))
    return "read";
  if (
    /^(edited|editing|edit|wrote|writing|write|created|creating|updated|updating|drafted|drafting|saved|edytow|zapis|napisa|utworz|tworz|zaktualiz)/u.test(
      head,
    )
  )
    return "write";
  if (/(https?:\/\/|\bweb\b|browser|browsed|internet|przegląd|stron[aęy])/u.test(head)) return "web";
  return "think";
}

const STEP_ICONS = { read: FileText, search: Search, run: Terminal, write: Pencil, web: Globe, think: Brain } as const;

export function AgentActivityIndicator(props: {
  bot: BotProfile | undefined;
  state: "Queued" | "Working" | null;
  /** What the agent does right now; while it is known it replaces the plain word "Pracuje". */
  liveStatus?: LiveStatus | null;
}) {
  const statusText = () => {
    if (props.state === "Working") {
      return props.liveStatus ? liveStatusText(props.liveStatus.kind, props.liveStatus.detail) : t("Working");
    }
    return t("Queued");
  };
  return (
    <Show when={props.state !== null}>
      <div
        class="agent-activity-entry agent-activity-entry-visible"
        role="status"
        aria-label={t("{name} is {state}", {
          name: props.bot?.name ?? t("Agent"),
          state: props.state === "Working" ? t("working") : t("queued"),
        })}
        title={
          props.state === "Working"
            ? t("This line changes while the agent works. It tells what the agent is doing right now.")
            : undefined
        }
      >
        <Show when={props.state !== "Working"}>
          <AgentAvatar bot={props.bot} class="agent-activity-avatar" />
        </Show>
        <div class="agent-activity-bubble" aria-hidden="true">
          <span class="agent-activity-text" data-live-kind={props.liveStatus?.kind}>
            {statusText()}
          </span>
          <span class="agent-activity-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
        <span class="sr-only">{statusText()}</span>
      </div>
    </Show>
  );
}

export function ThinkingDisclosure(props: { message: BotMessage }) {
  const stepCount = () => props.message.items?.length ?? 0;
  const finished = () => !props.message.streaming && stepCount() > 0;
  return (
    <article class="thinking-entry">
      <details class="thinking-disclosure" open={agentStepsOpen()}>
        <summary aria-label={t("Show thinking details")}>
          <span class="thinking-mark" aria-hidden="true">
            <ThinkingIcon />
          </span>
          <span>{finished() ? tn(stepCount(), "{count} step", "{count} steps") : t("Thinking")}</span>
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
        <ol class="thinking-details thinking-steps">
          <For each={props.message.items ?? []}>
            {(item, index) => {
              const kind = stepKind(item);
              const Icon = STEP_ICONS[kind];
              return (
                <li
                  data-step={kind}
                  data-live={props.message.streaming && index() === stepCount() - 1 ? "true" : undefined}
                >
                  <span class="thinking-step-icon" aria-hidden="true">
                    <Icon size={12} stroke-width={1.75} />
                  </span>
                  <p>{item}</p>
                </li>
              );
            }}
          </For>
        </ol>
      </details>
    </article>
  );
}
