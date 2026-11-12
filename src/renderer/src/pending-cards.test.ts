import type { AgentApproval, PendingAgentRequest } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  addCard,
  approvalCard,
  approvalsByBot,
  cardKey,
  cardsFromPending,
  clearBotCards,
  mergeHydrated,
  oldestCardForBot,
  type PendingCard,
  promptCard,
  promptsByBot,
  removeCard,
} from "./pending-cards";

function approval(requestId: string | number, botId = "chief", overrides: Partial<AgentApproval> = {}): AgentApproval {
  return {
    requestId,
    botId,
    threadId: `thread-${botId}`,
    turnId: "turn-1",
    kind: "command",
    command: "bun run build",
    cwd: null,
    reason: null,
    grantRoot: null,
    permissions: null,
    ...overrides,
  };
}

function prompt(requestId: string | number, botId = "research") {
  return {
    type: "prompt" as const,
    requestId,
    botId,
    threadId: `thread-${botId}`,
    turnId: "turn-1",
    questions: [],
  };
}

function pendingPrompt(requestId: string | number, botId: string, createdAt: string): PendingAgentRequest {
  const { requestId: id, threadId, turnId, questions } = prompt(requestId, botId);
  return { kind: "prompt", requestId: id, botId, threadId, turnId, questions, createdAt };
}

// The backend lists them oldest first: p1, a1, a2.
const pending: PendingAgentRequest[] = [
  pendingPrompt("p1", "research", "2026-11-12T10:00:01.000Z"),
  { kind: "approval", approval: approval("a1", "chief"), createdAt: "2026-11-12T10:00:02.000Z" },
  { kind: "approval", approval: approval("a2", "chief"), createdAt: "2026-11-12T10:00:03.000Z" },
];

describe("cardsFromPending (after a window reload)", () => {
  it("keeps prompts and approvals, oldest first, and drops card kinds this window cannot show", () => {
    const cards = cardsFromPending([
      ...pending,
      {
        kind: "browser-takeover",
        phase: "requested",
        request: {
          requestId: "b1",
          botId: "chief",
          threadId: "thread-chief",
          turnId: "turn-1",
          tabId: "tab-1",
          url: "https://example.com",
          reason: "Sign in",
          createdAt: "2026-11-12T10:00:04.000Z",
        },
      },
    ]);
    expect(cards.map((card) => cardKey(card.kind, card.requestId))).toEqual([
      "prompt:p1",
      "approval:a1",
      "approval:a2",
    ]);
  });

  it("builds the same prompt event the live `prompt` event carries", () => {
    const [card] = cardsFromPending(pending);
    expect(card?.kind).toBe("prompt");
    expect(card?.kind === "prompt" ? card.prompt : null).toEqual(prompt("p1", "research"));
  });
});

describe("per-agent lists", () => {
  it("groups several cards of one agent, oldest first, so the next one shows after an answer", () => {
    const cards = cardsFromPending(pending);
    expect(approvalsByBot(cards).chief?.map((item) => item.requestId)).toEqual(["a1", "a2"]);
    expect(promptsByBot(cards).research?.map((item) => item.requestId)).toEqual(["p1"]);
    expect(promptsByBot(cards).chief).toBeUndefined();
  });
});

describe("oldestCardForBot", () => {
  it("is the oldest open card of that agent, question or approval", () => {
    const cards = cardsFromPending([
      ...pending,
      { kind: "approval", approval: approval("a0", "research"), createdAt: "2026-11-12T10:00:00.500Z" },
    ]);
    expect(oldestCardForBot(cards, "research")?.requestId).toBe("a0");
    expect(oldestCardForBot(cards, "chief")?.requestId).toBe("a1");
    expect(oldestCardForBot(cards, "sales")).toBeUndefined();
  });

  it("moves on to the next card once the oldest is resolved", () => {
    const cards = removeCard(cardsFromPending(pending), "approval", "a1");
    expect(oldestCardForBot(cards, "chief")?.requestId).toBe("a2");
  });
});

describe("addCard / removeCard", () => {
  it("adds a live card after older ones and ignores a repeated request", () => {
    let cards = cardsFromPending(pending);
    cards = addCard(cards, approvalCard(approval("a3"), "2026-11-12T10:00:04.000Z"));
    cards = addCard(cards, approvalCard(approval("a3"), "2026-11-12T10:00:09.000Z"));
    expect(cards.map((card) => card.requestId)).toEqual(["p1", "a1", "a2", "a3"]);
  });

  it("removes one card by request id, not the whole agent", () => {
    const cards = removeCard(cardsFromPending(pending), "approval", "a1");
    expect(approvalsByBot(cards).chief?.map((item) => item.requestId)).toEqual(["a2"]);
    expect(promptsByBot(cards).research).toHaveLength(1);
  });

  it("treats a number and a string request id of the same value as one card", () => {
    const cards = addCard([], promptCard(prompt(7), "2026-11-12T10:00:00.000Z"));
    expect(removeCard(cards, "prompt", "7")).toEqual([]);
  });

  it("clears every card of one agent when its turn ends", () => {
    const cards = clearBotCards(cardsFromPending(pending), "chief");
    expect(cards.map((card) => card.requestId)).toEqual(["p1"]);
  });
});

describe("mergeHydrated", () => {
  const fetched = cardsFromPending(pending);
  const none = new Set<string>();

  it("replaces what the window had with what the backend still holds", () => {
    const stale: PendingCard[] = [approvalCard(approval("old"), "2026-11-12T09:00:00.000Z")];
    const merged = mergeHydrated(stale, fetched, { liveKeys: none, resolvedKeys: none });
    expect(merged.map((card) => card.requestId)).toEqual(["p1", "a1", "a2"]);
  });

  it("keeps a card that arrived live while the list was loading", () => {
    const live = approvalCard(approval("a9"), "2026-11-12T10:00:09.000Z");
    const merged = mergeHydrated([live], fetched, {
      liveKeys: new Set([cardKey("approval", "a9")]),
      resolvedKeys: none,
    });
    expect(merged.map((card) => card.requestId)).toEqual(["p1", "a1", "a2", "a9"]);
  });

  it("does not bring back a card that was resolved while the list was loading", () => {
    const merged = mergeHydrated([], fetched, { liveKeys: none, resolvedKeys: new Set([cardKey("approval", "a1")]) });
    expect(merged.map((card) => card.requestId)).toEqual(["p1", "a2"]);
  });
});
