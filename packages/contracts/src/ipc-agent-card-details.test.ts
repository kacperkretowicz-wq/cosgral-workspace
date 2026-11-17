import { describe, expect, it } from "vitest";
import {
  AGENT_DETAIL_CARD_IDS,
  AGENT_DETAIL_LIMITS,
  isAgentCardDetails,
  parseAgentCardDetailsInput,
  parsePublishAgentTemplateInput,
  parseUnpublishAgentTemplateInput,
} from "./ipc-agent-card-details";
import { defaultAgentPreferences } from "./ipc-agent-cards";
import { AGENT_TEMPLATE_LIMITS, defaultNotificationPreferences } from "./ipc-agent-settings";

const usage = {
  card: "usage",
  status: {
    scope: { kind: "agent", botId: "a" },
    budget: null,
    usage: { periodStart: "x", periodEnd: "y", tokens: 1, turns: 1, costUsd: 0, pricedTurns: 0, costComplete: false },
    state: "ok",
    tokenPercent: null,
    costPercent: null,
    blocked: false,
    reason: null,
    enforceable: true,
  },
};

describe("agent card details contract (W12 BE-G)", () => {
  it("names the six cards that open with a detail", () => {
    expect([...AGENT_DETAIL_CARD_IDS]).toEqual(["files", "folders", "usage", "publish", "advanced", "notifications"]);
  });

  it("parses the request of a detail and refuses a card that has none", () => {
    expect(parseAgentCardDetailsInput({ botId: "a", card: "files" })).toEqual({ botId: "a", card: "files" });
    for (const input of [null, {}, { botId: "a" }, { botId: "", card: "files" }, { botId: "a", card: "memory" }]) {
      expect(() => parseAgentCardDetailsInput(input), JSON.stringify(input)).toThrow();
    }
  });

  it("parses publishing: a short name, a short summary, a plain switch", () => {
    expect(
      parsePublishAgentTemplateInput({ botId: "a", name: "  Writer ", summary: " Drafts ", includeMemories: true }),
    ).toEqual({
      botId: "a",
      name: "Writer",
      summary: "Drafts",
      includeMemories: true,
    });
    expect(parsePublishAgentTemplateInput({ botId: "a" })).toEqual({ botId: "a" });
    const bad: unknown[] = [
      null,
      { name: "x" },
      { botId: "a", name: "   " },
      { botId: "a", name: "x".repeat(AGENT_TEMPLATE_LIMITS.name + 1) },
      { botId: "a", summary: "x".repeat(AGENT_TEMPLATE_LIMITS.summary + 1) },
      { botId: "a", includeMemories: "yes" },
    ];
    for (const input of bad) expect(() => parsePublishAgentTemplateInput(input), JSON.stringify(input)).toThrow();
    expect(() => parseUnpublishAgentTemplateInput({ botId: "" })).toThrow();
  });

  it("accepts a well-formed detail of each card and refuses a broken one", () => {
    const good = [
      {
        card: "files",
        items: [{ id: "1", name: "a.md", size: 3, origin: "agent", createdAt: "t" }],
        total: 1,
        truncated: false,
      },
      { card: "folders", workspace: "C:/w", level: "ask-first", additional: [], excluded: ["C:/x"] },
      usage,
      { card: "publish", template: null, savedTemplates: 0, maxTemplates: 100 },
      {
        card: "publish",
        template: { id: "t", name: "n", summary: "", createdAt: null },
        savedTemplates: 1,
        maxTemplates: 100,
      },
      { card: "advanced", preferences: defaultAgentPreferences("a"), hasSession: false, messages: 0 },
      { card: "notifications", level: "mentions", muted: false, matrix: defaultNotificationPreferences().matrix },
    ];
    for (const detail of good) expect(isAgentCardDetails(detail), JSON.stringify(detail).slice(0, 60)).toBe(true);
    const bad = [
      null,
      { card: "memory" },
      { card: "files", items: [], total: -1, truncated: false },
      {
        card: "files",
        items: [{ id: "1", name: "a", size: 1.5, origin: "agent", createdAt: "t" }],
        total: 1,
        truncated: false,
      },
      {
        card: "files",
        items: Array.from({ length: AGENT_DETAIL_LIMITS.files + 1 }, () => ({
          id: "1",
          name: "a",
          size: 1,
          origin: "agent",
          createdAt: "t",
        })),
        total: 99,
        truncated: true,
      },
      { card: "folders", workspace: "C:/w", level: "root", additional: [], excluded: [] },
      { card: "publish", template: {}, savedTemplates: 0, maxTemplates: 1 },
      { card: "advanced", preferences: { botId: "a" }, hasSession: false, messages: 0 },
      { card: "notifications", level: "all", muted: false, matrix: { finished: { desktop: true } } },
    ];
    for (const detail of bad) expect(isAgentCardDetails(detail), JSON.stringify(detail)?.slice(0, 60)).toBe(false);
  });
});
