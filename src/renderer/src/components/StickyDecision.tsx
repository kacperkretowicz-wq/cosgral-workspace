import type { AgentApproval, AgentEvent, ApprovalRuleScope } from "@openbot/contracts/ipc";
import { Show } from "solid-js";
import { stickyDecisionForBot } from "../needs-you";
import { ApprovalCard } from "./ConversationPrompts";

type PromptEvent = Extract<AgentEvent, { type: "prompt" }>;

interface StickyDecisionProps {
  prompt: PromptEvent | undefined;
  approval: AgentApproval | undefined;
  onAnswerPrompt: (answers: Record<string, string[]>) => Promise<boolean>;
  onRespondToApproval: (decision: "accept" | "decline", always?: ApprovalRuleScope) => Promise<boolean>;
}

/**
 * Oldest open question/approval, pinned above the composer so it stays visible while scrolling.
 */
export function StickyDecision(props: StickyDecisionProps) {
  const decision = () => stickyDecisionForBot({ prompt: props.prompt, approval: props.approval });

  return (
    <Show when={decision()}>
      {(active) => (
        <section class="sticky-decision" data-kind={active().kind} aria-label="Decision">
          <div class="sticky-decision-kicker">Decision · pinned</div>
          <Show when={active().kind === "question" && active().prompt}>
            {(prompt) => (
              <ApprovalCard variant="questions" questions={prompt().questions} onSubmit={props.onAnswerPrompt} />
            )}
          </Show>
          <Show when={active().kind === "approval" && active().approval}>
            {(approval) => (
              <ApprovalCard
                variant="approval"
                approval={approval()}
                onApprove={() => props.onRespondToApproval("accept")}
                onReject={() => props.onRespondToApproval("decline")}
                onAlways={(scope) => props.onRespondToApproval("accept", scope)}
              />
            )}
          </Show>
        </section>
      )}
    </Show>
  );
}
