import type { BotSummary, ThreadList } from "@openbot/contracts/ipc";
import { needsYouItemsFromCards } from "./needs-you";
import type { PendingCard } from "./pending-cards";
import { cardKey } from "./pending-cards";
export function pendingCardThreadId(card: PendingCard): string {
  switch (card.kind) {
    case "plan":
      return card.plan.threadId;
    case "prompt":
      return card.prompt.threadId;
    case "approval":
      return card.approval.threadId;
    case "draft-preview":
      return card.card.threadId;
    default:
      return card.request.threadId;
  }
}
export function cardsInThread(cards: readonly PendingCard[], botId: string, threadId: string | null | undefined) {
  return cards.filter((card) => card.botId === botId && (!threadId || pendingCardThreadId(card) === threadId));
}
export function threadAttentionItems(
  bots: Array<Pick<BotSummary, "id" | "name">>,
  cards: readonly PendingCard[],
  lists: Record<string, ThreadList>,
) {
  const threadIds = new Map(
    cards.map((card) => [`${card.createdAt}:${cardKey(card.kind, card.requestId)}`, pendingCardThreadId(card)]),
  );
  return needsYouItemsFromCards({ bots, cards }).map((item) => {
    const threadId = threadIds.get(item.orderKey);
    const thread = lists[item.botId]?.threads.find((thread) => thread.id === threadId);
    return { ...item, threadId, threadTitle: thread?.title ?? threadId };
  });
}

export function threadRowLabel(list: ThreadList) {
  const active = list.threads.find((thread) => thread.id === list.activeThreadId);
  return `Thread: ${active?.title ?? "None"}; ${list.threads.filter((thread) => thread.state === "running").length} running, ${list.threads.filter((thread) => thread.state === "waiting").length} waiting`;
}
