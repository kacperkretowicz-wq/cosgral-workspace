// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentEvent,
  BotSummary,
  CreateAgentInput,
  CreateAgentResult,
  DraftPreviewResolution,
  MarketplaceItem,
} from "@openbot/contracts/ipc";
import { isMarketplaceItem } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import type { CardContext } from "./action-cards";
import { type CatalogEntry, Marketplace } from "./marketplace";
import { MARKETPLACE_CATALOG } from "./marketplace-catalog";
import { SkillLibrary, type SkillLimits } from "./skill-library";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function skillMd(name: string, description: string, body = "## Steps\n1. Read the notes.\n2. Write the summary.\n") {
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
}

const NOTES: CatalogEntry = {
  kind: "skill",
  slug: "meeting-notes",
  title: "Meeting notes",
  summary: "Turns raw meeting notes into decisions, owners and dates.",
  description: "Reads notes of a meeting and writes decisions and action items.",
  category: "productivity",
  tags: ["meetings", "notes", "actions"],
  featured: true,
  version: 1,
  skillMd: skillMd("meeting-notes", "Turns meeting notes into decisions and action items."),
  files: [{ path: "references/template.md", content: "# Decisions\n# Actions\n" }],
};
const RESEARCH: CatalogEntry = {
  kind: "skill",
  slug: "research-brief",
  title: "Research brief",
  summary: "Finds sources on the web and writes a short brief with links.",
  description: "Compares sources and says where they disagree.",
  category: "research",
  tags: ["research", "sources", "web"],
  featured: false,
  version: 1,
  skillMd: skillMd("research-brief", "Writes a short research brief with a link for every fact."),
};
const ZURICH: CatalogEntry = {
  kind: "skill",
  slug: "trip-planner",
  title: "Trip planner",
  summary: "Plans a trip to Zürich or anywhere: trains, hotels and a day plan.",
  description: "Compares options and keeps a budget.",
  category: "travel",
  tags: ["travel", "hotels"],
  featured: false,
  version: 1,
  skillMd: skillMd("trip-planner", "Plans trips with a budget."),
};
const COORDINATOR: CatalogEntry = {
  kind: "agent",
  slug: "project-coordinator",
  title: "Project coordinator",
  summary: "Keeps projects moving: meeting notes, owners and weekly status.",
  description: "An agent that follows up on meetings and deadlines.",
  category: "productivity",
  tags: ["projects", "meetings"],
  featured: true,
  version: 1,
  role: "Projects and follow-ups",
  instructions: "You keep the person's projects moving and follow up on every action item.",
  reasoningEffort: "medium",
  tools: { computer: false },
  skills: ["meeting-notes", "missing-skill"],
  memories: ["Every action item has an owner and a date."],
};

function bot(id: string, fields: Partial<BotSummary> = {}): BotSummary {
  return {
    id,
    name: id,
    role: "",
    description: "",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: "",
    preview: "No messages yet",
    updatedAt: null,
    avatarSeed: id,
    avatarHue: null,
    avatarUrl: null,
    ...fields,
  };
}

async function setup(
  options: { catalog?: CatalogEntry[]; limits?: Partial<SkillLimits>; decision?: DraftPreviewResolution } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "marketplace-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const bots = new Map<string, BotSummary>([
    ["writer", bot("writer", { name: "Writer", role: "Writing", description: "You write posts." })],
    ["scout", bot("scout", { name: "Scout", role: "Research and sources", description: "You research the web." })],
  ]);
  const library = new SkillLibrary({
    database,
    root: join(dir, "Skills"),
    workspaceFor: (botId) => (bots.has(botId) ? join(dir, "Bots", botId) : null),
    limits: options.limits,
  });
  const events: AgentEvent[] = [];
  const created: CreateAgentInput[] = [];
  const deleted: string[] = [];
  const cards: Array<{ context: CardContext; title: string; preview: string }> = [];
  let counter = 0;
  const decision: { value: DraftPreviewResolution } = { value: options.decision ?? "send" };
  const createAgent = async (input: CreateAgentInput): Promise<CreateAgentResult> => {
    created.push(input);
    const id = `new-${++counter}`;
    const newBot = bot(id, { name: input.name ?? "New agent", role: input.role ?? "" });
    bots.set(id, newBot);
    const warnings: string[] = [];
    for (const name of input.skills ?? []) {
      const skill = library.findByName(name);
      if (!skill) warnings.push(`Skill "${name}" is not in the skill library.`);
      else await library.install({ skillId: skill.id, botId: id });
    }
    return { bot: newBot, warnings };
  };
  const withCatalog = (catalog: CatalogEntry[]) =>
    new Marketplace({
      database,
      library,
      catalog,
      bots: () => [...bots.values()],
      createAgent,
      deleteBot: async (botId) => {
        deleted.push(botId);
        bots.delete(botId);
      },
      confirm: async (context, input) => {
        cards.push({ context, ...input });
        return decision.value;
      },
      emit: (event) => events.push(event),
    });
  const marketplace = withCatalog(options.catalog ?? [NOTES, RESEARCH, ZURICH, COORDINATOR]);
  return { dir, library, marketplace, withCatalog, bots, events, created, deleted, cards, decision };
}

const card = (botId: string): CardContext => ({ botId, threadId: "t1", providerThreadId: "p1", turnId: "turn-1" });
const ids = (items: MarketplaceItem[]) => items.map((item) => item.id);
const changes = (events: AgentEvent[]) =>
  events.flatMap((event) => (event.type === "marketplace-changed" ? [event.items] : []));

describe("Marketplace catalog", () => {
  it("lists featured items first, filters by kind and category, and searches all words without case or accents", async () => {
    const { marketplace } = await setup();
    const all = marketplace.list();
    expect(all.every(isMarketplaceItem)).toBe(true);
    expect(ids(all)).toEqual([
      "skill:meeting-notes",
      "agent:project-coordinator",
      "skill:research-brief",
      "skill:trip-planner",
    ]);
    expect(ids(marketplace.list({ kind: "agent" }))).toEqual(["agent:project-coordinator"]);
    expect(ids(marketplace.list({ category: "research" }))).toEqual(["skill:research-brief"]);
    expect(ids(marketplace.list({ query: "MEETING notes" }))).toEqual([
      "skill:meeting-notes",
      "agent:project-coordinator",
    ]);
    expect(ids(marketplace.list({ query: "zurich" }))).toEqual(["skill:trip-planner"]);
    expect(ids(marketplace.list({ query: "meeting zurich" }))).toEqual([]);
    expect(ids(marketplace.list({ query: "notes", kind: "skill" }))).toEqual(["skill:meeting-notes"]);
  });

  it("shows details: SKILL.md and files of a skill, the profile of an agent", async () => {
    const { marketplace } = await setup();
    const notes = marketplace.get("skill:meeting-notes");
    expect(notes.skillMd).toContain("name: meeting-notes");
    expect(notes.files).toEqual(["SKILL.md", "references/template.md"]);
    expect(notes.agent).toBeNull();
    const coordinator = marketplace.get("agent:project-coordinator");
    expect(coordinator.agent).toEqual({
      role: "Projects and follow-ups",
      description: "You keep the person's projects moving and follow up on every action item.",
      memories: ["Every action item has an owner and a date."],
    });
    expect(() => marketplace.get("skill:nope")).toThrow("This Marketplace item does not exist.");
  });

  it("never lists a skill created locally (spec 10.5)", async () => {
    const { marketplace, library } = await setup();
    await library.create({
      source: { kind: "inline", skillMd: skillMd("my-own-skill", "Mine.") },
      authorBotId: "writer",
    });
    expect(ids(marketplace.list())).not.toContain("skill:my-own-skill");
    expect(marketplace.list()).toHaveLength(4);
  });
});

describe("Marketplace skill install", () => {
  it("adds the skill to the library once and installs it for each chosen agent", async () => {
    const { marketplace, library, events, dir } = await setup();
    const first = await marketplace.installSkill({ itemId: "skill:meeting-notes", botId: "writer" });
    expect(first.botId).toBe("writer");
    expect(first.bot).toBeNull();
    expect(first.warnings).toEqual([]);
    expect(first.item.libraryState).toBe("current");
    expect(first.item.installedBotIds).toEqual(["writer"]);
    const skill = library.findByName("meeting-notes");
    expect(skill?.version).toBe(1);
    expect(skill?.createdByBotId).toBeNull();
    expect(
      existsSync(join(dir, "Bots", "writer", ".cosgral", "skills", "meeting-notes", "references", "template.md")),
    ).toBe(true);

    const second = await marketplace.installSkill({ itemId: "skill:meeting-notes", botId: "scout" });
    expect(second.item.installedBotIds.sort()).toEqual(["scout", "writer"]);
    expect(library.findByName("meeting-notes")?.version).toBe(1);
    // Installing again changes nothing.
    await marketplace.installSkill({ itemId: "skill:meeting-notes", botId: "scout" });
    expect(library.list()).toHaveLength(1);

    const states = changes(events).map(
      (items) => items.find((item) => item.id === "skill:meeting-notes")?.libraryState,
    );
    expect(states.length).toBeGreaterThan(0);
    expect(states).not.toContain("local");
  });

  it("refuses an unknown agent, an agent item and a library skill of the same name that is not from the catalog", async () => {
    const { marketplace, library } = await setup();
    await expect(marketplace.installSkill({ itemId: "skill:meeting-notes", botId: "ghost" })).rejects.toThrow(
      "This agent does not exist.",
    );
    await expect(marketplace.installSkill({ itemId: "agent:project-coordinator", botId: "writer" })).rejects.toThrow(
      "is an agent",
    );
    await library.create({
      source: { kind: "inline", skillMd: skillMd("research-brief", "My own research steps.") },
      authorBotId: null,
    });
    expect(marketplace.get("skill:research-brief").item.libraryState).toBe("local");
    await expect(marketplace.installSkill({ itemId: "skill:research-brief", botId: "writer" })).rejects.toThrow(
      "not from the Marketplace",
    );
    expect(library.findByName("research-brief")?.description).toBe("My own research steps.");
    expect(await library.listInstalls({ botId: "writer" })).toEqual([]);
  });

  it("saves a newer catalog version as a new library version and moves the agent's copy", async () => {
    const first = await setup();
    await first.marketplace.installSkill({ itemId: "skill:meeting-notes", botId: "writer" });
    const v2: CatalogEntry = {
      ...NOTES,
      version: 2,
      skillMd: skillMd("meeting-notes", "Turns meeting notes into decisions, owners and dates."),
    };
    const updated = first.withCatalog([v2]);
    expect(updated.get("skill:meeting-notes").item.libraryState).toBe("outdated");
    const result = await updated.installSkill({ itemId: "skill:meeting-notes", botId: "writer" });
    expect(result.item.libraryState).toBe("current");
    expect(first.library.findByName("meeting-notes")?.version).toBe(2);
    const [install] = await first.library.listInstalls({ botId: "writer" });
    expect(install?.installedVersion).toBe(2);
  });

  it("rejects a skill over the library limits with a message and keeps nothing (spec 10.2)", async () => {
    const { marketplace, library } = await setup({ limits: { files: 1 } });
    await expect(marketplace.installSkill({ itemId: "skill:meeting-notes", botId: "writer" })).rejects.toThrow(
      "at most 1 files",
    );
    expect(library.list()).toEqual([]);
    expect(marketplace.get("skill:meeting-notes").item.libraryState).toBe("absent");
  });

  it("uninstalls the skill from one agent and keeps it in the library", async () => {
    const { marketplace, library } = await setup();
    await marketplace.installSkill({ itemId: "skill:meeting-notes", botId: "writer" });
    await marketplace.uninstall({ itemId: "skill:meeting-notes", botId: "writer" });
    expect(await library.listInstalls({ botId: "writer" })).toEqual([]);
    expect(library.findByName("meeting-notes")).not.toBeNull();
    expect(marketplace.get("skill:meeting-notes").item.installedBotIds).toEqual([]);
    await expect(marketplace.uninstall({ itemId: "skill:meeting-notes", botId: "writer" })).rejects.toThrow(
      "not installed",
    );
  });
});

describe("Marketplace agent install", () => {
  it("creates the agent with the item's profile and the catalog skills it can add (spec 10.4)", async () => {
    const { marketplace, created, library } = await setup();
    const result = await marketplace.installAgent({ itemId: "agent:project-coordinator", name: "  Ada  " });
    expect(created).toEqual([
      {
        name: "Ada",
        role: "Projects and follow-ups",
        description: "You keep the person's projects moving and follow up on every action item.",
        reasoningEffort: "medium",
        tools: { computer: false },
        skills: ["meeting-notes"],
        memories: ["Every action item has an owner and a date."],
      },
    ]);
    expect(result.bot?.name).toBe("Ada");
    expect(result.botId).toBe(result.bot?.id);
    expect(result.warnings).toEqual(['Skill "missing-skill" is not in the Marketplace catalog.']);
    expect(result.item.installedBotIds).toEqual([result.botId]);
    expect(library.findByName("meeting-notes")).not.toBeNull();
    expect(marketplace.get("skill:meeting-notes").item.installedBotIds).toEqual([result.botId]);
    const named = await marketplace.installAgent({ itemId: "agent:project-coordinator" });
    expect(named.bot?.name).toBe("Project coordinator");
  });

  it("uninstalls an agent item by deleting only an agent created from it", async () => {
    const { marketplace, deleted } = await setup();
    const { botId } = await marketplace.installAgent({ itemId: "agent:project-coordinator" });
    await expect(marketplace.uninstall({ itemId: "agent:project-coordinator", botId: "writer" })).rejects.toThrow(
      "was not created from",
    );
    await marketplace.uninstall({ itemId: "agent:project-coordinator", botId });
    expect(deleted).toEqual([botId]);
    expect(marketplace.get("agent:project-coordinator").item.installedBotIds).toEqual([]);
  });

  it("forgets agents deleted elsewhere", async () => {
    const { marketplace, bots } = await setup();
    const { botId } = await marketplace.installAgent({ itemId: "agent:project-coordinator" });
    bots.delete(botId);
    expect(marketplace.get("agent:project-coordinator").item.installedBotIds).toEqual([]);
  });
});

describe("Marketplace suggestions", () => {
  it("suggests skills that fit an agent's profile and that it does not have yet", async () => {
    const { marketplace } = await setup();
    const forScout = marketplace.suggestions({ botId: "scout" });
    expect(forScout[0]?.item.id).toBe("skill:research-brief");
    expect(forScout[0]?.matched).toEqual(expect.arrayContaining(["research"]));
    expect(forScout[0]?.reason).toMatch(/^Fits: /);
    expect(forScout.every((suggestion) => suggestion.item.kind === "skill")).toBe(true);
    await marketplace.installSkill({ itemId: "skill:research-brief", botId: "scout" });
    expect(ids(marketplace.suggestions({ botId: "scout" }).map((s) => s.item))).not.toContain("skill:research-brief");
  });

  it("falls back to featured items without an agent", async () => {
    const { marketplace } = await setup();
    const featured = marketplace.suggestions();
    expect(ids(featured.map((s) => s.item))).toEqual(["skill:meeting-notes", "agent:project-coordinator"]);
    expect(featured[0]?.reason).toBe("Featured");
    expect(() => marketplace.suggestions({ botId: "ghost" })).toThrow("This agent does not exist.");
  });

  it("an agent's suggestion installs only after the person approves the card (spec 10.3)", async () => {
    const { marketplace, cards, library, decision } = await setup({ decision: "keep-draft" });
    const declined = await marketplace.suggest(card("writer"), {
      itemId: "skill:meeting-notes",
      reason: "You asked me to keep minutes.",
    });
    expect(declined.decision).toBe("declined");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.title).toContain("Meeting notes");
    expect(cards[0]?.preview).toContain("You asked me to keep minutes.");
    expect(cards[0]?.context.botId).toBe("writer");
    expect(library.list()).toEqual([]);

    decision.value = "send";
    const approved = await marketplace.suggest(card("writer"), {
      itemId: "skill:meeting-notes",
      reason: "You asked me to keep minutes.",
    });
    expect(approved.decision).toBe("installed");
    expect(approved.result?.item.installedBotIds).toEqual(["writer"]);

    const again = await marketplace.suggest(card("writer"), { itemId: "skill:meeting-notes", reason: "Again." });
    expect(again.decision).toBe("already-installed");
    expect(cards).toHaveLength(2);
  });

  it("an approved agent suggestion creates the new agent", async () => {
    const { marketplace, created } = await setup();
    const result = await marketplace.suggest(card("writer"), {
      itemId: "agent:project-coordinator",
      reason: "You run many projects.",
    });
    expect(result.decision).toBe("installed");
    expect(created).toHaveLength(1);
    expect(result.result?.bot).not.toBeNull();
  });
});

describe("Built-in catalog seed", () => {
  it("has unique ids, valid categories and agents that use catalog skills", async () => {
    const { marketplace } = await setup({ catalog: MARKETPLACE_CATALOG });
    const items = marketplace.list();
    expect(items.length).toBe(MARKETPLACE_CATALOG.length);
    expect(new Set(ids(items)).size).toBe(items.length);
    expect(items.every(isMarketplaceItem)).toBe(true);
    expect(items.some((item) => item.kind === "skill")).toBe(true);
    expect(items.some((item) => item.kind === "agent")).toBe(true);
    const skillNames = new Set(items.filter((item) => item.kind === "skill").map((item) => item.skillName));
    for (const agent of items.filter((item) => item.kind === "agent")) {
      expect(agent.skills.every((name) => skillNames.has(name))).toBe(true);
    }
  });

  it("every seed skill passes the library checks", async () => {
    const { marketplace, library } = await setup({ catalog: MARKETPLACE_CATALOG });
    for (const item of marketplace.list({ kind: "skill" })) {
      const result = await marketplace.installSkill({ itemId: item.id, botId: "writer" });
      expect(result.item.libraryState).toBe("current");
    }
    expect(library.list()).toHaveLength(marketplace.list({ kind: "skill" }).length);
  });
});
