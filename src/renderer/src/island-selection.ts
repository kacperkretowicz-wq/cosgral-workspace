import type { IslandRequestRef } from "@openbot/contracts/ipc";
import { oldestCardForBot, type PendingCard } from "./pending-cards";

export function selectIslandCard(cards: readonly PendingCard[], botId: string, request: IslandRequestRef | null) {
  return (
    (request &&
      cards.find(
        (card) =>
          card.botId === botId && card.kind === request.kind && String(card.requestId) === String(request.requestId),
      )) ||
    oldestCardForBot(cards, botId)
  );
}
