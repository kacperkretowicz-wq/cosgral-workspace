import { describe, expect, it } from "vitest";
import { selectIslandCard } from "./island-selection";

describe("island card selection", () => {
  it("selects the requested card only for the given agent, otherwise falls back to the oldest", () => {
    const cards = [
      { kind: "prompt", requestId: 1, botId: "a", createdAt: "2026-01-01", prompt: { type: "prompt", requestId: 1, botId: "a", threadId: "t", turnId: "t", questions: [] } },
      { kind: "prompt", requestId: 2, botId: "a", createdAt: "2026-01-02", prompt: { type: "prompt", requestId: 2, botId: "a", threadId: "t", turnId: "t", questions: [] } },
    ] as const;
    expect(selectIslandCard(cards, "a", { kind: "prompt", requestId: 2 })?.requestId).toBe(2);
    expect(selectIslandCard(cards, "a", { kind: "prompt", requestId: 3 })?.requestId).toBe(1);
    expect(selectIslandCard(cards, "b", { kind: "prompt", requestId: 2 })).toBeUndefined();
  });
});
