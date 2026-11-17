// @vitest-environment node
import { defaultAgentPreferences, defaultServerSettings } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { policyInstructions, turnLimitReached } from "./agent-policy";

describe("agent policy (W12 BE-E)", () => {
  const server = defaultServerSettings();
  const prefs = defaultAgentPreferences("chief");

  it("adds only the lines the settings ask for", () => {
    const quiet = policyInstructions(
      { ...server, general: { ...server.general, memoryReviewEvery: 0, skillLearning: "off" } },
      prefs,
    );
    expect(quiet).not.toMatch(/memory/i);
    expect(quiet).toMatch(/do not create skills/i);
    expect(quiet).not.toMatch(/co-author|plan first|new chat/i);
  });

  it("tells the agent how often to review its memory and how to treat skills", () => {
    const text = policyInstructions(
      { ...server, general: { ...server.general, memoryReviewEvery: 10, skillLearning: "ask" } },
      prefs,
    );
    expect(text).toContain("about every 10 turns");
    expect(text).toMatch(/ask the person before/i);
    expect(policyInstructions(server, prefs)).toMatch(/save it as a skill/i);
  });

  it("follows the server defaults for the agent and the agent's own choice for new chats", () => {
    const withDefaults = policyInstructions(
      {
        ...server,
        agents: { ...server.agents, showPlanBeforeLongTasks: true, mentionInCommits: true, agentStartsNewChats: true },
      },
      prefs,
    );
    expect(withDefaults).toMatch(/plan first/i);
    expect(withDefaults).toMatch(/co-author/i);
    expect(withDefaults).toMatch(/new chat/i);
    const own = policyInstructions(server, { ...prefs, agentStartsNewChats: true });
    expect(own).toMatch(/new chat/i);
    expect(policyInstructions(server, prefs)).not.toMatch(/new chat/i);
  });

  it("allows learning from browsing only when it is on", () => {
    expect(policyInstructions(server, prefs)).not.toMatch(/browser/i);
    const on = policyInstructions({ ...server, general: { ...server.general, learnFromBrowsing: true } }, prefs);
    expect(on).toMatch(/never the text/i);
  });

  it("limits the turns that run at the same time, with no limit by default", () => {
    expect(turnLimitReached(50, null)).toBe(false);
    expect(turnLimitReached(1, 2)).toBe(false);
    expect(turnLimitReached(2, 2)).toBe(true);
    expect(turnLimitReached(3, 2)).toBe(true);
  });
});
