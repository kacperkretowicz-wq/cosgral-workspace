import type { AgentApproval, AgentEvent, BotSummary } from "@openbot/contracts/ipc";

export type PromptEvent = Extract<AgentEvent, { type: "prompt" }>;

export type NeedsYouKind = "question" | "approval";

export interface NeedsYouItem {
  botId: string;
  botName: string;
  kind: NeedsYouKind;
  /** Stable sort key: earlier pending wins for sticky decision. */
  orderKey: string;
  summary: string;
}

export function collectNeedsYouItems(input: {
  bots: Array<Pick<BotSummary, "id" | "name">>;
  prompts: Record<string, PromptEvent | undefined>;
  approvals: Record<string, AgentApproval | undefined>;
}): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  for (const bot of input.bots) {
    const prompt = input.prompts[bot.id];
    if (prompt) {
      const first = prompt.questions[0];
      items.push({
        botId: bot.id,
        botName: bot.name,
        kind: "question",
        orderKey: `p:${String(prompt.requestId)}`,
        summary: first?.question ?? "Pytanie od agenta",
      });
    }
    const approval = input.approvals[bot.id];
    if (approval) {
      items.push({
        botId: bot.id,
        botName: bot.name,
        kind: "approval",
        orderKey: `a:${String(approval.requestId)}`,
        summary: approvalSummary(approval),
      });
    }
  }
  return items.sort((left, right) => left.orderKey.localeCompare(right.orderKey));
}

export function stickyDecisionForBot(input: {
  prompt: PromptEvent | undefined;
  approval: AgentApproval | undefined;
}): { kind: NeedsYouKind; prompt?: PromptEvent; approval?: AgentApproval } | null {
  // Oldest open card in this conversation: prefer prompt when both exist
  // (prompt typically arrives before command approval in a turn).
  if (input.prompt) return { kind: "question", prompt: input.prompt };
  if (input.approval) return { kind: "approval", approval: input.approval };
  return null;
}

function approvalSummary(approval: AgentApproval): string {
  if (approval.kind === "command" && approval.command) return approval.command;
  if (approval.kind === "file-change") return approval.reason ?? "Zmiana plików";
  if (approval.kind === "permissions") return approval.reason ?? "Uprawnienia";
  return approval.reason ?? "Zatwierdzenie";
}
