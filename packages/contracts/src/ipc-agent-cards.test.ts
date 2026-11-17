import { describe, expect, it } from "vitest";
import {
  AGENT_CARD_IDS,
  AGENT_CARD_LIMITS,
  applyAgentPreferenceChanges,
  defaultAgentPreferences,
  effectiveBusyMessage,
  isAgentCardsOverview,
  isAgentPreferences,
  isAgentPreferencesChanged,
  parseAgentCardsBotInput,
  parseUpdateAgentPreferencesInput,
} from "./ipc-agent-cards";
import { isAgentEvent } from "./ipc-conversation";

const overview = {
  botId: "chief",
  cards: AGENT_CARD_IDS.map((id) => ({ id, available: true, count: null, summary: "" })),
};

describe("agent cards contract (W11 BE-B)", () => {
  it("lists the fourteen cards once each", () => {
    expect(AGENT_CARD_IDS).toHaveLength(14);
    expect(new Set(AGENT_CARD_IDS).size).toBe(14);
  });

  it("accepts only a whole overview, in order, with short lines and sane counts", () => {
    expect(isAgentCardsOverview(overview)).toBe(true);
    expect(isAgentCardsOverview({ ...overview, cards: overview.cards.slice(1) })).toBe(false);
    expect(isAgentCardsOverview({ ...overview, cards: [...overview.cards].reverse() })).toBe(false);
    const [first, ...rest] = overview.cards;
    const check = (card: { count?: number; summary?: string }) =>
      isAgentCardsOverview({ ...overview, cards: [{ ...first, ...card }, ...rest] });
    expect(check({ count: -1 })).toBe(false);
    expect(check({ count: 1.5 })).toBe(false);
    expect(check({ summary: "x".repeat(AGENT_CARD_LIMITS.summary + 1) })).toBe(false);
    expect(check({ count: 3 })).toBe(true);
  });

  it("starts every agent with safe defaults", () => {
    const prefs = defaultAgentPreferences("chief");
    expect(isAgentPreferences(prefs)).toBe(true);
    expect(prefs).toMatchObject({ busyMessage: "app-default", localScripts: false, notificationLevel: "all" });
  });

  it("parses a change, keeps only the named fields and refuses the rest", () => {
    expect(parseUpdateAgentPreferencesInput({ botId: "a", chatColor: "blue", localScripts: true })).toEqual({
      botId: "a",
      chatColor: "blue",
      localScripts: true,
    });
    const bad: unknown[] = [
      null,
      {},
      { botId: "a" },
      { botId: "a", chatColor: "purple" },
      { botId: "a", busyMessage: "interrupt" },
      { botId: "a", notificationLevel: "some" },
      { botId: "a", quickAcknowledgement: "yes" },
    ];
    for (const input of bad) expect(() => parseUpdateAgentPreferencesInput(input), JSON.stringify(input)).toThrow();
    expect(() => parseAgentCardsBotInput({ botId: "" })).toThrow();
  });

  it("never lets the person set the provider fact steerSupported", () => {
    const current = { ...defaultAgentPreferences("a"), steerSupported: false };
    const next = applyAgentPreferenceChanges(
      current,
      parseUpdateAgentPreferencesInput({ botId: "a", steerSupported: true, busyMessage: "steer" }),
    );
    expect(next.steerSupported).toBe(false);
    expect(next.busyMessage).toBe("steer");
  });

  it("turns steer into queue when the provider cannot steer, and follows the app default", () => {
    expect(effectiveBusyMessage({ busyMessage: "steer", steerSupported: true }, "queue")).toBe("steer");
    expect(effectiveBusyMessage({ busyMessage: "steer", steerSupported: false }, "queue")).toBe("queue");
    expect(effectiveBusyMessage({ busyMessage: "app-default", steerSupported: true }, "steer")).toBe("steer");
    expect(effectiveBusyMessage({ busyMessage: "app-default", steerSupported: false }, "steer")).toBe("queue");
    expect(effectiveBusyMessage({ busyMessage: "queue", steerSupported: true }, "steer")).toBe("queue");
  });

  it("knows the preferences event as an agent event", () => {
    const event = { type: "agent-preferences-changed", preferences: defaultAgentPreferences("a") };
    expect(isAgentPreferencesChanged(event)).toBe(true);
    expect(isAgentEvent(event)).toBe(true);
    expect(isAgentEvent({ type: "agent-preferences-changed", preferences: { botId: "a" } })).toBe(false);
  });
});
