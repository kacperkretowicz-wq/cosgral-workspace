import { describe, expect, it } from "vitest";
import {
  IPC_CHANNELS,
  isAgentEvent,
  isMarketplaceInstallResult,
  isMarketplaceItem,
  isMarketplaceItemDetails,
  isMarketplaceSuggestion,
  MARKETPLACE_LIMITS,
  marketplaceItemId,
} from "./ipc";

const skillItem = {
  id: "skill:meeting-notes",
  kind: "skill",
  title: "Meeting notes",
  summary: "Turns raw notes into decisions, owners and dates.",
  description: "Reads meeting notes and writes a short summary with decisions and action items.",
  category: "productivity",
  tags: ["meetings", "notes", "actions"],
  featured: true,
  version: 1,
  skillName: "meeting-notes",
  skills: [],
  libraryState: "absent",
  installedBotIds: [],
};
const agentItem = {
  ...skillItem,
  id: "agent:project-coordinator",
  kind: "agent",
  title: "Project coordinator",
  skillName: null,
  skills: ["meeting-notes"],
  libraryState: null,
  installedBotIds: ["bot-1"],
};

describe("W3 marketplace contract", () => {
  it("accepts skill and agent items with their install state", () => {
    expect(isMarketplaceItem(skillItem)).toBe(true);
    expect(isMarketplaceItem({ ...skillItem, libraryState: "outdated", installedBotIds: ["a", "b"] })).toBe(true);
    expect(isMarketplaceItem(agentItem)).toBe(true);
    expect(isMarketplaceItem({ ...skillItem, kind: "plugin" })).toBe(false);
    expect(isMarketplaceItem({ ...skillItem, libraryState: "unknown" })).toBe(false);
    expect(isMarketplaceItem({ ...skillItem, skillName: null })).toBe(false);
    expect(isMarketplaceItem({ ...agentItem, libraryState: "current" })).toBe(false);
    expect(isMarketplaceItem({ ...skillItem, tags: [1] })).toBe(false);
    expect(isMarketplaceItem({ ...skillItem, version: 0 })).toBe(false);
  });

  it("accepts install results and suggestions", () => {
    expect(isMarketplaceInstallResult({ item: skillItem, botId: "bot-1", bot: null, warnings: [] })).toBe(true);
    expect(isMarketplaceInstallResult({ item: agentItem, botId: "bot-2", bot: { id: "bot-2" }, warnings: ["x"] })).toBe(
      true,
    );
    expect(isMarketplaceInstallResult({ item: skillItem, botId: "bot-1", bot: null, warnings: [1] })).toBe(false);
    expect(isMarketplaceSuggestion({ item: skillItem, reason: "Featured", matched: [] })).toBe(true);
    expect(isMarketplaceSuggestion({ item: skillItem, reason: 3, matched: [] })).toBe(false);
    expect(
      isMarketplaceItemDetails({
        item: skillItem,
        skillMd: "---\nname: meeting-notes\n---",
        files: ["SKILL.md"],
        agent: null,
      }),
    ).toBe(true);
    expect(
      isMarketplaceItemDetails({
        item: agentItem,
        skillMd: null,
        files: [],
        agent: { role: "Projects", description: "You keep projects moving.", memories: [] },
      }),
    ).toBe(true);
    expect(isMarketplaceItemDetails({ item: skillItem, skillMd: null, files: [], agent: { role: 1 } })).toBe(false);
  });

  it("builds item ids from kind and slug", () => {
    expect(marketplaceItemId("skill", "meeting-notes")).toBe("skill:meeting-notes");
    expect(marketplaceItemId("agent", "project-coordinator")).toBe("agent:project-coordinator");
    expect(MARKETPLACE_LIMITS.suggestions).toBeGreaterThan(0);
  });

  it("adds IPC channels and the marketplace-changed event", () => {
    expect(IPC_CHANNELS.marketplaceList).toBe("marketplace:list");
    expect(IPC_CHANNELS.marketplaceGet).toBe("marketplace:get");
    expect(IPC_CHANNELS.marketplaceInstallSkill).toBe("marketplace:install-skill");
    expect(IPC_CHANNELS.marketplaceInstallAgent).toBe("marketplace:install-agent");
    expect(IPC_CHANNELS.marketplaceUninstall).toBe("marketplace:uninstall");
    expect(IPC_CHANNELS.marketplaceSuggestions).toBe("marketplace:suggestions");
    expect(isAgentEvent({ type: "marketplace-changed", items: [skillItem, agentItem] })).toBe(true);
    expect(isAgentEvent({ type: "marketplace-changed", items: [{ id: "x" }] })).toBe(false);
    expect(isAgentEvent({ type: "marketplace-changed" })).toBe(false);
  });
});
