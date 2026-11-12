import type { AgentApproval, BotSummary } from "@openbot/contracts/ipc";
import { cardKey, type PendingCard, type PromptEvent } from "./pending-cards";

export type { PromptEvent };

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
        summary: first?.question ?? "Agent question",
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

/** One row per open card, oldest first (the list order of `PendingCard`s); agents that no longer exist are skipped. */
export function needsYouItemsFromCards(input: {
  bots: Array<Pick<BotSummary, "id" | "name">>;
  cards: readonly PendingCard[];
}): NeedsYouItem[] {
  const names = new Map(input.bots.map((bot) => [bot.id, bot.name]));
  const items: NeedsYouItem[] = [];
  for (const card of input.cards) {
    const botName = names.get(card.botId);
    if (botName === undefined) continue;
    const orderKey = `${card.createdAt}:${cardKey(card.kind, card.requestId)}`;
    if (card.kind === "prompt") {
      items.push({
        botId: card.botId,
        botName,
        kind: "question",
        orderKey,
        summary: card.prompt.questions[0]?.question ?? "Agent question",
      });
    } else {
      items.push({ botId: card.botId, botName, kind: "approval", orderKey, summary: approvalSummary(card.approval) });
    }
  }
  return items;
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
  if (approval.kind === "file-change") return approval.reason ?? "File changes";
  if (approval.kind === "permissions") return approval.reason ?? "Permissions";
  if (approval.kind === "screen") {
    return approval.reason ?? (approval.eyes ? `Screen access: ${approval.eyes.targetLabel}` : "Screen access");
  }
  if (approval.kind === "camera") {
    return approval.reason ?? (approval.eyes ? `Camera ${approval.eyes.live ? "live preview" : "photo"}` : "Camera");
  }
  return approval.reason ?? "Approval";
}
