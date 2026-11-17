import type { AgentEvent, SideQuestionState } from "@openbot/contracts/ipc";
import { COMPOSER_LIMITS } from "@openbot/contracts/ipc";
import { createEffect, createSignal, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Button, Textarea } from "./ui";
import { X } from "./ui/icons";

interface SideQuestionPanelProps {
  botId: string;
  /** The thread the answer may read for context; left out = the agent's active thread. */
  threadId?: string;
  onClose: () => void;
}

/**
 * A short question to the agent in a context of its own. The answer is shown here and is never written into the
 * conversation. Every state is drawn: idle, running (with Stop), done, failed (with the reason), cancelled.
 */
export function SideQuestionPanel(props: SideQuestionPanelProps) {
  const api = untrack(() => window.openbot?.composer);
  const [text, setText] = createSignal("");
  const [state, setState] = createSignal<SideQuestionState | null>(null);
  const [error, setError] = createSignal("");
  let input: HTMLTextAreaElement | undefined;

  // A different agent is a different question.
  createEffect(
    () => props.botId,
    () => {
      setState(null);
      setError("");
    },
  );

  onSettled(() => {
    requestAnimationFrame(() => input?.focus());
    const listen = window.openbot?.agent?.onEvent;
    if (!listen) return;
    return listen((event: AgentEvent) => {
      if (event.type !== "side-question-changed") return;
      const next = event.state;
      if (next.botId !== props.botId) return;
      const current = state();
      if (current && current.questionId !== next.questionId) return;
      setState(next);
    });
  });

  const running = () => state()?.status === "running";

  async function ask(event: Event) {
    event.preventDefault();
    const question = text().trim();
    if (!api || !question || running()) return;
    setError("");
    try {
      const first = await api.askSideQuestion({
        botId: props.botId,
        text: question,
        ...(props.threadId ? { threadId: props.threadId } : {}),
      });
      setState(first);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not ask the side question."));
    }
  }

  async function stop() {
    const current = state();
    if (!api || !current) return;
    try {
      setState(await api.cancelSideQuestion({ questionId: current.questionId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not stop the side question."));
    }
  }

  return (
    <section class="side-question" aria-label={t("Side question")}>
      <header class="side-question-header">
        <strong>{t("Side question")}</strong>
        <span class="side-question-hint">{t("The answer stays here and is not added to the conversation.")}</span>
        <Button
          type="button"
          variant="ghost"
          class="side-question-close"
          aria-label={t("Close")}
          onClick={props.onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <Show when={!api}>
        <p class="side-question-note" role="status">
          {t("Side questions are not available in this version.")}
        </p>
      </Show>
      <Show when={api}>
        <form class="side-question-form" onSubmit={ask}>
          <Textarea
            ref={(element) => (input = element)}
            rows={2}
            value={text()}
            maxlength={COMPOSER_LIMITS.sideQuestion}
            placeholder={t("Ask something quick…")}
            aria-label={t("Side question")}
            onInput={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.isComposing) void ask(event);
            }}
          />
          <Show
            when={running()}
            fallback={
              <Button type="submit" variant="primary" disabled={text().trim().length === 0}>
                {t("Ask")}
              </Button>
            }
          >
            <Button type="button" onClick={() => void stop()}>
              {t("Stop")}
            </Button>
          </Show>
        </form>
      </Show>
      <Show when={error()}>
        <p class="side-question-error" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={state()}>
        {(current) => (
          <div class="side-question-result" data-status={current().status}>
            <Show when={current().status === "running"}>
              <p role="status">{t("Thinking…")}</p>
            </Show>
            <Show when={current().status === "cancelled"}>
              <p role="status">{t("Stopped.")}</p>
            </Show>
            <Show when={current().status === "failed"}>
              <p role="alert">{current().error ?? t("The side question failed.")}</p>
            </Show>
            <Show when={current().answer}>
              <p class="side-question-answer">{current().answer}</p>
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
}
