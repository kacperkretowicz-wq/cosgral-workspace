// COSGRAL W1: open question and approval cards, kept as one ordered list (oldest first).
//
// The backend keeps open cards until they are resolved. A window reads them with
// `agent.listPendingRequests()` when it starts, adds cards from `prompt` / `approval` events,
// and drops a card when its `prompt-resolved` / `approval-resolved` event arrives. Every function
// here is pure; `App.tsx` owns the signal.

import type {
  AgentApproval,
  AgentEvent,
  PendingAgentRequest,
  DraftPreviewCard,
  BrowserTakeoverRequest,
  BrowserTakeoverPhase,
} from "@openbot/contracts/ipc";

export type PromptEvent = Extract<AgentEvent, { type: "prompt" }>;

export type PendingCardKind = "prompt" | "approval" | "draft-preview" | "browser-takeover";

export type PendingCard =
  | { kind: "prompt"; requestId: string | number; botId: string; createdAt: string; prompt: PromptEvent }
  | { kind: "approval"; requestId: string | number; botId: string; createdAt: string; approval: AgentApproval }
  | { kind: "draft-preview"; requestId: string; botId: string; createdAt: string; card: DraftPreviewCard }
  | {
      kind: "browser-takeover";
      requestId: string;
      botId: string;
      createdAt: string;
      request: BrowserTakeoverRequest;
      phase: BrowserTakeoverPhase;
    };

export function draftCard(card: DraftPreviewCard): PendingCard {
  return { kind: "draft-preview", requestId: card.requestId, botId: card.botId, createdAt: card.createdAt, card };
}
export function takeoverCard(request: BrowserTakeoverRequest, phase: BrowserTakeoverPhase = "requested"): PendingCard {
  return {
    kind: "browser-takeover",
    requestId: request.requestId,
    botId: request.botId,
    createdAt: request.createdAt,
    request,
    phase,
  };
}

/** A number and a string with the same text are one request. */
export function cardKey(kind: PendingCardKind, requestId: string | number): string {
  return `${kind}:${String(requestId)}`;
}

function keyOf(card: PendingCard): string {
  return cardKey(card.kind, card.requestId);
}

export function promptCard(prompt: PromptEvent, createdAt: string): PendingCard {
  return { kind: "prompt", requestId: prompt.requestId, botId: prompt.botId, createdAt, prompt };
}

export function approvalCard(approval: AgentApproval, createdAt: string): PendingCard {
  return { kind: "approval", requestId: approval.requestId, botId: approval.botId, createdAt, approval };
}

/** Questions and approvals from `listPendingRequests()`. Draft previews and browser takeovers are not shown by this window yet. */
export function cardsFromPending(requests: readonly PendingAgentRequest[]): PendingCard[] {
  const cards: PendingCard[] = [];
  for (const request of requests) {
    if (request.kind === "prompt") {
      const { requestId, botId, threadId, turnId, questions } = request;
      cards.push(promptCard({ type: "prompt", requestId, botId, threadId, turnId, questions }, request.createdAt));
    } else if (request.kind === "approval") {
      cards.push(approvalCard(request.approval, request.createdAt));
    } else if (request.kind === "draft-preview") {
      cards.push(draftCard(request.card));
    } else if (request.kind === "browser-takeover") {
      cards.push(takeoverCard(request.request, request.phase));
    }
  }
  return sortOldestFirst(cards);
}

function sortOldestFirst(cards: PendingCard[]): PendingCard[] {
  // `Array.prototype.sort` is stable, so cards with the same time keep the order they came in.
  return [...cards].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/** A card that is already open keeps its place; a new one goes in by time (live cards are the newest). */
export function addCard(cards: readonly PendingCard[], card: PendingCard): PendingCard[] {
  if (cards.some((existing) => keyOf(existing) === keyOf(card))) return [...cards];
  return sortOldestFirst([...cards, card]);
}

export function removeCard(
  cards: readonly PendingCard[],
  kind: PendingCardKind,
  requestId: string | number,
): PendingCard[] {
  const key = cardKey(kind, requestId);
  return cards.filter((card) => keyOf(card) !== key);
}

export function clearBotCards(cards: readonly PendingCard[], botId: string): PendingCard[] {
  return cards.filter((card) => card.botId !== botId);
}

/**
 * The list from the backend is the truth, with two exceptions for events that arrived while it loaded:
 * a card that came in live stays, and a card that was resolved meanwhile does not come back.
 */
export function mergeHydrated(
  current: readonly PendingCard[],
  fetched: readonly PendingCard[],
  seen: { liveKeys: ReadonlySet<string>; resolvedKeys: ReadonlySet<string> },
): PendingCard[] {
  const fromBackend = fetched.filter((card) => !seen.resolvedKeys.has(keyOf(card)));
  const live = current.filter((card) => seen.liveKeys.has(keyOf(card)) && !seen.resolvedKeys.has(keyOf(card)));
  return live.reduce<PendingCard[]>(
    (cards, card) => addCard(removeCard(cards, card.kind, card.requestId), card),
    sortOldestFirst(fromBackend),
  );
}

/** The card the sticky Decision shows for an agent: its oldest open card, question or approval. */
export function oldestCardForBot(cards: readonly PendingCard[], botId: string): PendingCard | undefined {
  return cards.find((card) => card.botId === botId);
}

/** Open questions of each agent, oldest first. */
export function promptsByBot(cards: readonly PendingCard[]): Record<string, PromptEvent[]> {
  const byBot: Record<string, PromptEvent[]> = {};
  for (const card of cards) {
    if (card.kind === "prompt") byBot[card.botId] = [...(byBot[card.botId] ?? []), card.prompt];
  }
  return byBot;
}

/** Open approvals of each agent, oldest first. */
export function approvalsByBot(cards: readonly PendingCard[]): Record<string, AgentApproval[]> {
  const byBot: Record<string, AgentApproval[]> = {};
  for (const card of cards) {
    if (card.kind === "approval") byBot[card.botId] = [...(byBot[card.botId] ?? []), card.approval];
  }
  return byBot;
}
