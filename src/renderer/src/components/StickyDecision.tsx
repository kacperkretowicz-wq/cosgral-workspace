import type { AgentApproval, AgentEvent } from "@openbot/contracts/ipc";
import { Show } from "solid-js";
import { ApprovalCard } from "./ConversationPrompts";
import { stickyDecisionForBot } from "../needs-you";

type PromptEvent = Extract<AgentEvent, { type: "prompt" }>;

interface StickyDecisionProps {
  prompt: PromptEvent | undefined;
  approval: AgentApproval | undefined;
  onAnswerPrompt: (answers: Record<string, string[]>) => Promise<boolean>;
  onRespondToApproval: (decision: "accept" | "decline") => Promise<boolean>;
}

/**
 * Oldest open question/approval, pinned above the composer so it stays visible while scrolling.
 */
export function StickyDecision(props: StickyDecisionProps) {
  const decision = () => stickyDecisionForBot({ prompt: props.prompt, approval: props.approval });

  return (
    <Show when={decision()}>
      {(active) => (
        <div class="sticky-decision" data-kind={active().kind} role="region" aria-label="Decyzja">
          <div class="sticky-decision-kicker">Decyzja · przypięta</div>
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
              />
            )}
          </Show>
        </div>
      )}
    </Show>
  );
}
