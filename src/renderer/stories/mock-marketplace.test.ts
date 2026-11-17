// @vitest-environment node
import {
  type AgentEvent,
  type BotSummary,
  isMarketplaceInstallResult,
  isMarketplaceItem,
  isMarketplaceItemDetails,
  isMarketplaceSuggestion,
  layoutMarketplace,
  marketplaceAction,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { STORY_BOT_SUMMARIES } from "./fixtures";
import { createMockMarketplace } from "./mock-marketplace";

function setup() {
  const events: AgentEvent[] = [];
  const bots: { id: string; name: string }[] = [
    { id: "chief", name: "Chief" },
    { id: "writer", name: "Writer" },
  ];
  let counter = 0;
  const mock = createMockMarketplace((event) => events.push(event), {
    bots: () => bots,
    createAgent: (name) => {
      counter += 1;
      const template = STORY_BOT_SUMMARIES[0];
      if (!template) throw new Error("no template agent");
      const bot: BotSummary = { ...template, id: `new-${counter}`, name };
      bots.push({ id: bot.id, name });
      return bot;
    },
    removeAgent: (botId) => {
      bots.splice(
        bots.findIndex((bot) => bot.id === botId),
        1,
      );
    },
  });
  return { mock, events, bots };
}

describe("mock marketplace: what the tabs show", () => {
  it("lists skills and agents (valid items), featured first, filtered by kind, category and words", async () => {
    const { mock } = setup();
    const all = await mock.api.list();
    expect(all.every(isMarketplaceItem)).toBe(true);
    expect(all.slice(0, 5).every((item) => item.featured)).toBe(true);
    const skills = await mock.api.list({ kind: "skill" });
    expect(skills.every((item) => item.kind === "skill")).toBe(true);
    expect((await mock.api.list({ kind: "agent", category: "research" })).map((item) => item.title)).toEqual([
      "Research analyst",
    ]);
    expect((await mock.api.list({ query: "meetings" })).map((item) => item.id)).toEqual(["skill:meeting-notes"]);
    await expect(mock.api.list({ query: "x".repeat(201) })).rejects.toThrow(/at most 200/);
  });

  it("the layout of each tab has featured cards and category sections (what the page draws)", async () => {
    const { mock } = setup();
    const items = await mock.api.list();
    const agents = layoutMarketplace(items, { kind: "agent" });
    expect(agents.featured.length).toBeGreaterThan(0);
    expect(agents.sections.length).toBeGreaterThan(0);
    const skills = layoutMarketplace(items, { kind: "skill" });
    expect(skills.sections.map((section) => section.label)).toContain("Travel");
  });

  it("details: a skill shows SKILL.md and its files, an agent shows its role and memories", async () => {
    const { mock } = setup();
    const skill = await mock.api.get({ itemId: "skill:meeting-notes" });
    expect(isMarketplaceItemDetails(skill)).toBe(true);
    expect(skill.skillMd).toMatch(/^---\nname: meeting-notes/);
    expect(skill.files).toContain("SKILL.md");
    const agent = await mock.api.get({ itemId: "agent:project-coordinator" });
    expect(agent.agent?.role).toBe("Project coordinator");
    expect(agent.agent?.memories).toHaveLength(1);
    await expect(mock.api.get({ itemId: "skill:nope" })).rejects.toThrow(/not in the catalog/);
  });
});

describe("mock marketplace: installing", () => {
  it("a skill goes to one agent: Add → Added, and the event carries the catalog", async () => {
    const { mock, events } = setup();
    const result = await mock.api.installSkill({ itemId: "skill:meeting-notes", botId: "chief" });
    expect(isMarketplaceInstallResult(result)).toBe(true);
    expect(result.item).toMatchObject({ libraryState: "current", installedBotIds: ["chief"] });
    expect(events.at(-1)).toMatchObject({ type: "marketplace-changed" });
    expect(marketplaceAction(result.item, "chief").kind).toBe("added");
    expect(marketplaceAction(result.item, "writer").kind).toBe("add");
    await mock.api.installSkill({ itemId: "skill:meeting-notes", botId: "writer" });
    expect((await mock.api.get({ itemId: "skill:meeting-notes" })).item.installedBotIds).toEqual(["chief", "writer"]);
  });

  it("an outdated skill is updated with a warning for the copies that stay; a local skill of the same name is refused", async () => {
    const { mock } = setup();
    const updated = await mock.api.installSkill({ itemId: "skill:code-review-checklist", botId: "chief" });
    expect(updated.item.libraryState).toBe("current");
    expect(updated.warnings[0]).toMatch(/keep their version/);
    await expect(mock.api.installSkill({ itemId: "skill:post-drafts", botId: "chief" })).rejects.toThrow(
      /did not come from the Marketplace/,
    );
    mock.simulate.outdateSkill("meeting-notes");
    expect((await mock.api.get({ itemId: "skill:meeting-notes" })).item.libraryState).toBe("outdated");
    mock.simulate.localSkill("trip-planner");
    await expect(mock.api.installSkill({ itemId: "skill:trip-planner", botId: "chief" })).rejects.toThrow(
      /did not come/,
    );
  });

  it("an agent item makes a NEW agent every time; uninstalling an agent deletes it, uninstalling a skill keeps the library copy", async () => {
    const { mock, bots } = setup();
    const first = await mock.api.installAgent({ itemId: "agent:research-analyst" });
    const second = await mock.api.installAgent({ itemId: "agent:research-analyst", name: "Analyst 2" });
    expect(first.bot?.name).toBe("Research analyst");
    expect(second.bot?.name).toBe("Analyst 2");
    expect(first.botId).not.toBe(second.botId);
    expect(bots.some((bot) => bot.id === first.botId)).toBe(true);
    expect(marketplaceAction(second.item, null).reason).toBe("2 already created from this item.");
    await mock.api.uninstall({ itemId: "agent:research-analyst", botId: first.botId });
    expect(bots.some((bot) => bot.id === first.botId)).toBe(false);

    await mock.api.installSkill({ itemId: "skill:research-brief", botId: "chief" });
    await mock.api.uninstall({ itemId: "skill:research-brief", botId: "chief" });
    expect((await mock.api.get({ itemId: "skill:research-brief" })).item).toMatchObject({
      libraryState: "current",
      installedBotIds: [],
    });
    await expect(mock.api.uninstall({ itemId: "skill:research-brief", botId: "chief" })).rejects.toThrow(
      /not installed for that agent/,
    );
    await expect(mock.api.installAgent({ itemId: "skill:research-brief" })).rejects.toThrow(/not an agent/);
    await expect(mock.api.installSkill({ itemId: "agent:research-analyst", botId: "chief" })).rejects.toThrow(
      /not a skill/,
    );
    await expect(mock.api.installSkill({ itemId: "skill:research-brief", botId: "ghost" })).rejects.toThrow(
      /no longer exists/,
    );
    await expect(mock.api.installAgent({ itemId: "agent:research-analyst", name: "x".repeat(81) })).rejects.toThrow(
      /at most 80/,
    );
  });

  it("a failing install says why and changes nothing", async () => {
    const { mock, bots } = setup();
    mock.simulate.failNext("Could not write the skill files.");
    await expect(mock.api.installSkill({ itemId: "skill:inbox-triage", botId: "chief" })).rejects.toThrow(
      /Could not write/,
    );
    expect((await mock.api.get({ itemId: "skill:inbox-triage" })).item.libraryState).toBe("absent");
    mock.simulate.failNext("The agent creator is busy.");
    await expect(mock.api.installAgent({ itemId: "agent:inbox-assistant" })).rejects.toThrow(/creator is busy/);
    expect(bots).toHaveLength(2);
    await expect(mock.api.installSkill({ itemId: "skill:inbox-triage", botId: "chief" })).resolves.toBeDefined();
  });
});

describe("mock marketplace: suggestions and the empty page", () => {
  it("suggests at most six items the agent does not have, with a reason", async () => {
    const { mock } = setup();
    const featured = await mock.api.suggestions();
    expect(featured.length).toBeLessThanOrEqual(6);
    expect(featured.every(isMarketplaceSuggestion)).toBe(true);
    expect(featured[0]?.reason).toBe("Featured");
    await mock.api.installSkill({
      itemId: featured.find((entry) => entry.item.kind === "skill")?.item.id ?? "",
      botId: "chief",
    });
    const forChief = await mock.api.suggestions({ botId: "chief" });
    expect(forChief.some((entry) => entry.item.installedBotIds.includes("chief"))).toBe(false);
    await expect(mock.api.suggestions({ botId: "ghost" })).rejects.toThrow(/no longer exists/);
  });

  it("an empty catalog is the empty state", async () => {
    const { mock, events } = setup();
    mock.simulate.empty();
    expect(await mock.api.list()).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: "marketplace-changed", items: [] });
  });
});
