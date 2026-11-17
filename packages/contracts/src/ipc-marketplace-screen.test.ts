import { describe, expect, it } from "vitest";
import {
  BOT_AVATAR_HUES,
  isMarketplaceSourceFilter,
  layoutMarketplace,
  MARKETPLACE_CATEGORY_LABELS,
  MARKETPLACE_SOURCE_FILTERS,
  MARKETPLACE_TABS,
  MARKETPLACE_UNAVAILABLE,
  type MarketplaceItem,
  marketplaceAction,
  marketplaceItemAvatar,
  marketplaceItemSource,
  marketplaceMatches,
  marketplacePageState,
  parseMarketplaceQuery,
} from "./ipc";

function item(over: Partial<MarketplaceItem> & Pick<MarketplaceItem, "id" | "kind" | "title">): MarketplaceItem {
  return {
    summary: "A summary",
    description: "A longer description",
    category: "productivity",
    tags: [],
    featured: false,
    version: 1,
    skillName: over.kind === "skill" ? over.id.slice(6) : null,
    skills: [],
    libraryState: over.kind === "skill" ? "absent" : null,
    installedBotIds: [],
    ...over,
  };
}

const ITEMS: MarketplaceItem[] = [
  item({ id: "skill:meeting-notes", kind: "skill", title: "Meeting notes", featured: true, tags: ["minutes"] }),
  item({ id: "skill:post-drafts", kind: "skill", title: "Post drafts", category: "writing" }),
  item({ id: "skill:trip-planner", kind: "skill", title: "Trip planner", category: "travel" }),
  item({ id: "agent:chief-of-staff", kind: "agent", title: "Chief of staff", featured: true, skills: ["a", "b"] }),
  item({ id: "agent:research-analyst", kind: "agent", title: "Research analyst", category: "research" }),
];

describe("fixed text of the tabs", () => {
  it("names both tabs, every category and the filters; Public is not available and says why", () => {
    expect(MARKETPLACE_TABS.agent.title).toBe("Agents");
    expect(MARKETPLACE_TABS.skill.searchPlaceholder).toBe("Search, or paste a GitHub link");
    expect(Object.keys(MARKETPLACE_CATEGORY_LABELS)).toHaveLength(7);
    expect(MARKETPLACE_SOURCE_FILTERS.map((filter) => [filter.id, filter.available])).toEqual([
      ["all", true],
      ["verified", true],
      ["public", false],
    ]);
    expect(MARKETPLACE_SOURCE_FILTERS[2].reason).toMatch(/server/);
    expect(isMarketplaceSourceFilter("verified")).toBe(true);
    expect(isMarketplaceSourceFilter("mine")).toBe(false);
    expect(MARKETPLACE_UNAVAILABLE.map((entry) => entry.id)).toEqual(["github-link", "public-catalog", "publish"]);
  });

  it("everything in the catalog is published by COSGRAL and verified", () => {
    expect(marketplaceItemSource(ITEMS[0])).toEqual({ publisher: "COSGRAL", verified: true });
  });
});

describe("the mascot of an agent card", () => {
  it("is the same every time and always one of the colours of the wheel", () => {
    const first = marketplaceItemAvatar(ITEMS[3]);
    expect(first).toEqual(marketplaceItemAvatar({ id: "agent:chief-of-staff" }));
    expect(BOT_AVATAR_HUES).toContain(first.hue);
    expect(first.seed).toBe("agent:chief-of-staff");
    const hues = new Set(ITEMS.map((entry) => marketplaceItemAvatar(entry).hue));
    expect(hues.size).toBeGreaterThan(1);
  });
});

describe("the layout of a tab", () => {
  it("featured first, then sections by category; an item is not shown twice", () => {
    const skills = layoutMarketplace(ITEMS, { kind: "skill" });
    expect(skills.featured.map((entry) => entry.title)).toEqual(["Meeting notes"]);
    expect(skills.sections.map((section) => [section.label, section.items.map((entry) => entry.title)])).toEqual([
      ["Writing", ["Post drafts"]],
      ["Travel", ["Trip planner"]],
    ]);
    expect(skills.total).toBe(3);
    const agents = layoutMarketplace(ITEMS, { kind: "agent" });
    expect(agents.featured.map((entry) => entry.title)).toEqual(["Chief of staff"]);
    expect(agents.sections.map((section) => section.label)).toEqual(["Research"]);
  });

  it("a search drops the featured row and matches accents, tags and category names", () => {
    const found = layoutMarketplace(ITEMS, { kind: "skill", query: "minutes" });
    expect(found.featured).toEqual([]);
    expect(found.sections.flatMap((section) => section.items.map((entry) => entry.title))).toEqual(["Meeting notes"]);
    expect(marketplaceMatches(ITEMS[0], "MEETING   notes")).toBe(true);
    expect(marketplaceMatches(ITEMS[0], "meeting trip")).toBe(false);
    expect(marketplaceMatches(item({ id: "skill:x", kind: "skill", title: "Café notes" }), "cafe")).toBe(true);
    expect(layoutMarketplace(ITEMS, { kind: "skill", query: "travel" }).total).toBe(1);
    expect(layoutMarketplace(ITEMS, { kind: "skill", query: "zzz" }).total).toBe(0);
  });

  it("'Verified' keeps everything (the catalog is verified) without the featured row; 'Public' shows nothing", () => {
    const verified = layoutMarketplace(ITEMS, { kind: "skill", source: "verified" });
    expect(verified.total).toBe(3);
    expect(verified.featured).toEqual([]);
    expect(layoutMarketplace(ITEMS, { kind: "skill", source: "public" }).total).toBe(0);
  });
});

describe("the search box of Skills", () => {
  it("tells a GitHub link from words", () => {
    expect(parseMarketplaceQuery("  https://github.com/someone/skills-pack ")).toEqual({
      kind: "github-link",
      url: "https://github.com/someone/skills-pack",
    });
    expect(parseMarketplaceQuery("https://github.com/someone/pack/tree/main/skills/x").kind).toBe("github-link");
    expect(parseMarketplaceQuery("github pack")).toEqual({ kind: "search", text: "github pack" });
    expect(parseMarketplaceQuery("https://example.com/someone/pack").kind).toBe("search");
  });
});

describe("the button of an item", () => {
  it("an agent item makes a new agent every time", () => {
    expect(marketplaceAction(ITEMS[3], null)).toEqual({
      kind: "add",
      label: "Add",
      enabled: true,
      needsAgent: false,
      reason: null,
    });
    expect(marketplaceAction({ ...ITEMS[3], installedBotIds: ["a", "b"] }, null).reason).toBe(
      "2 already created from this item.",
    );
  });

  it("a skill goes to one agent: asks which, shows Added, Update, and refuses a local skill of the same name", () => {
    const skill = ITEMS[0];
    expect(marketplaceAction(skill, null)).toMatchObject({ kind: "add", enabled: true, needsAgent: true });
    expect(marketplaceAction(skill, "chief")).toMatchObject({ kind: "add", enabled: true, needsAgent: false });
    const current = { ...skill, libraryState: "current" as const, installedBotIds: ["chief"] };
    expect(marketplaceAction(current, "chief")).toMatchObject({ kind: "added", label: "Added", enabled: false });
    expect(marketplaceAction(current, "writer")).toMatchObject({ kind: "add", enabled: true });
    expect(marketplaceAction({ ...skill, libraryState: "outdated" }, "chief")).toMatchObject({
      kind: "update",
      label: "Update",
      enabled: true,
    });
    expect(marketplaceAction({ ...skill, libraryState: "local" }, "chief")).toMatchObject({
      kind: "blocked",
      enabled: false,
    });
  });
});

describe("the state of the page", () => {
  it("loading, error, empty catalog, no match and ready", () => {
    const some = layoutMarketplace(ITEMS, { kind: "skill" });
    const none = layoutMarketplace([], { kind: "skill" });
    expect(marketplacePageState({ loading: true, error: null, layout: none, query: "" })).toEqual({
      state: "loading",
      message: null,
    });
    expect(
      marketplacePageState({ loading: false, error: "Could not read the catalog.", layout: none, query: "" }),
    ).toEqual({
      state: "error",
      message: "Could not read the catalog.",
    });
    expect(marketplacePageState({ loading: false, error: null, layout: none, query: "" }).state).toBe("empty");
    expect(marketplacePageState({ loading: false, error: null, layout: none, query: " tax " })).toEqual({
      state: "no-match",
      message: 'Nothing matches "tax".',
    });
    expect(marketplacePageState({ loading: false, error: null, layout: some, query: "" }).state).toBe("ready");
  });
});
