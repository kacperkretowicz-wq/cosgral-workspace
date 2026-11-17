// COSGRAL W12-KK: the Marketplace tabs "Agents" and "Skills" for Storybook and the preview. DEMO catalog only (our own short texts; nothing is
// downloaded, no skill file is written). The same rules as the program (`marketplace.ts`): a skill goes to ONE agent and the library keeps
// it (absent → current; an older library version → current on Update; a library skill of the same name that did not come from here is
// refused), an agent item makes a NEW agent every time, uninstalling a skill takes it from that agent only, and every change comes as
// `marketplace-changed`. `simulate` plays a failing install and the catalog changing under the page.

import {
  type AgentEvent,
  type BotSummary,
  MARKETPLACE_LIMITS,
  type MarketplaceDesktopApi,
  type MarketplaceInstallResult,
  type MarketplaceItem,
  type MarketplaceItemDetails,
  type MarketplaceLibraryState,
  type MarketplaceSuggestion,
  marketplaceMatches,
} from "@openbot/contracts/ipc";

export interface MockMarketplaceOptions {
  /** The agents of the demo (a skill is installed for one of them). */
  bots: () => { id: string; name: string }[];
  /** Makes a new agent from an agent item (the demo's creator) and returns it. */
  createAgent: (name: string, item: MarketplaceItem) => BotSummary;
  /** Deletes an agent that was created from an item. */
  removeAgent: (botId: string) => void;
}

export interface MockMarketplace {
  api: Required<MarketplaceDesktopApi>;
  simulate: {
    /** The next install (skill or agent) fails with this sentence; nothing changes. */
    failNext: (message: string) => void;
    /** A skill of this name appears in the library from somewhere else: its Add is refused. */
    localSkill: (slug: string) => void;
    /** The program update raised the catalog version of a skill: the library copy is now older. */
    outdateSkill: (slug: string) => void;
    /** An empty catalog (the empty state of the page). */
    empty: () => void;
  };
}

type Seed = Pick<
  MarketplaceItem,
  "id" | "kind" | "title" | "summary" | "description" | "category" | "tags" | "featured"
> & {
  skills?: string[];
  libraryState?: MarketplaceLibraryState;
  role?: string;
  memories?: string[];
};

const SEED: Seed[] = [
  {
    id: "skill:meeting-notes",
    kind: "skill",
    title: "Meeting notes",
    summary: "Turns raw meeting notes into decisions, action items, owners and dates.",
    description:
      "Reads notes or a transcript of a meeting and writes a short summary. It asks before it sends the summary to anyone.",
    category: "productivity",
    tags: ["meetings", "notes", "actions"],
    featured: true,
  },
  {
    id: "skill:weekly-status-report",
    kind: "skill",
    title: "Weekly status report",
    summary: "Writes a short weekly status from tasks, tables and notes: done, next, blocked.",
    description:
      "Collects what happened this week and writes a status with three parts. Numbers come from the data, not from memory.",
    category: "productivity",
    tags: ["status", "weekly", "report"],
    featured: false,
    libraryState: "current",
  },
  {
    id: "skill:research-brief",
    kind: "skill",
    title: "Research brief",
    summary: "Answers a research question with sources, what is certain and what is not.",
    description: "Searches, reads and writes a brief of one page with a source for every claim.",
    category: "research",
    tags: ["sources", "brief"],
    featured: true,
  },
  {
    id: "skill:inbox-triage",
    kind: "skill",
    title: "Inbox triage",
    summary: "Sorts mail into reply now, later and ignore, with a draft for the first group.",
    description: "Goes through the unread mail and proposes what to do with each message. It never sends by itself.",
    category: "communication",
    tags: ["mail", "inbox"],
    featured: false,
  },
  {
    id: "skill:code-review-checklist",
    kind: "skill",
    title: "Code review checklist",
    summary: "A short checklist for reviewing a change: correctness, tests, naming, risk.",
    description: "Reviews a change against a fixed list and returns findings ranked by risk.",
    category: "development",
    tags: ["review", "code"],
    featured: false,
    libraryState: "outdated",
  },
  {
    id: "skill:post-drafts",
    kind: "skill",
    title: "Post drafts",
    summary: "Drafts three versions of a post in your voice from one idea.",
    description: "Writes short drafts for a post. You choose; nothing is published by the skill.",
    category: "writing",
    tags: ["drafts", "social"],
    featured: false,
    libraryState: "local",
  },
  {
    id: "skill:trip-planner",
    kind: "skill",
    title: "Trip planner",
    summary: "Plans a trip day by day with times, travel and a budget.",
    description: "Builds an itinerary from dates, places and a budget, and lists what to book first.",
    category: "travel",
    tags: ["trip", "itinerary"],
    featured: false,
  },
  {
    id: "skill:expense-log",
    kind: "skill",
    title: "Expense log",
    summary: "Keeps a table of expenses and totals them by category.",
    description: "Adds each expense to a shared table and answers questions about the totals.",
    category: "data",
    tags: ["expenses", "table"],
    featured: false,
  },
  {
    id: "agent:project-coordinator",
    kind: "agent",
    title: "Project coordinator",
    summary: "Keeps a project on track: scope, owners, dates and the weekly status.",
    description:
      "You are a project coordinator. Your one job is to keep the plan, the owners and the dates in one place.",
    category: "productivity",
    tags: ["project", "plan"],
    featured: true,
    skills: ["meeting-notes", "weekly-status-report"],
    role: "Project coordinator",
    memories: ["The plan lives in the shared table named Plan."],
  },
  {
    id: "agent:research-analyst",
    kind: "agent",
    title: "Research analyst",
    summary: "Answers a research question with a one-page brief and its sources.",
    description:
      "You are a research analyst. Your one job is to answer a question with sources and say what is uncertain.",
    category: "research",
    tags: ["research", "sources"],
    featured: true,
    skills: ["research-brief"],
    role: "Research analyst",
    memories: [],
  },
  {
    id: "agent:inbox-assistant",
    kind: "agent",
    title: "Inbox assistant",
    summary: "Sorts the mail and drafts replies for you to approve.",
    description: "You are an inbox assistant. You never send a message without a confirm card.",
    category: "communication",
    tags: ["mail", "inbox"],
    featured: false,
    skills: ["inbox-triage"],
    role: "Inbox assistant",
    memories: [],
  },
  {
    id: "agent:code-reviewer",
    kind: "agent",
    title: "Code reviewer",
    summary: "Finds the bugs in a change and ranks them by risk.",
    description: "You are a code reviewer. Your one job is to find the bugs in a change and say how risky each is.",
    category: "development",
    tags: ["review", "code"],
    featured: true,
    skills: ["code-review-checklist"],
    role: "Code reviewer",
    memories: [],
  },
  {
    id: "agent:travel-planner",
    kind: "agent",
    title: "Travel planner",
    summary: "Plans a trip and keeps the bookings in one list.",
    description: "You are a travel planner. You plan within the budget you are given and ask before you book.",
    category: "travel",
    tags: ["trip", "bookings"],
    featured: false,
    skills: ["trip-planner"],
    role: "Travel planner",
    memories: [],
  },
];

export function createMockMarketplace(
  emit: (event: AgentEvent) => void,
  options: MockMarketplaceOptions,
): MockMarketplace {
  let items: MarketplaceItem[] = SEED.map((seed) => ({
    id: seed.id,
    kind: seed.kind,
    title: seed.title,
    summary: seed.summary,
    description: seed.description,
    category: seed.category,
    tags: [...seed.tags],
    featured: seed.featured,
    version: seed.libraryState === "outdated" ? 2 : 1,
    skillName: seed.kind === "skill" ? seed.id.slice("skill:".length) : null,
    skills: [...(seed.skills ?? [])],
    libraryState: seed.kind === "skill" ? (seed.libraryState ?? "absent") : null,
    installedBotIds: [],
  }));
  let failure: string | null = null;

  const clone = <T>(value: T): T => structuredClone(value);
  const emitItems = (): void => emit({ type: "marketplace-changed", items: clone(items) });
  const find = (itemId: string): MarketplaceItem => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) throw new Error("This item is not in the catalog.");
    return item;
  };
  const replace = (next: MarketplaceItem): MarketplaceItem => {
    items = items.map((entry) => (entry.id === next.id ? next : entry));
    emitItems();
    return clone(next);
  };
  const failIfAsked = (): void => {
    if (failure === null) return;
    const message = failure;
    failure = null;
    throw new Error(message);
  };

  const details = (item: MarketplaceItem): MarketplaceItemDetails => {
    const seed = SEED.find((entry) => entry.id === item.id);
    if (item.kind === "skill") {
      const name = item.skillName ?? "skill";
      return {
        item: clone(item),
        skillMd: `---\nname: ${name}\ndescription: ${item.summary}\n---\n# ${item.title}\n\n${item.description}\n`,
        files: ["SKILL.md", "references/template.md"],
        agent: null,
      };
    }
    return {
      item: clone(item),
      skillMd: null,
      files: [],
      agent: { role: seed?.role ?? item.title, description: item.description, memories: [...(seed?.memories ?? [])] },
    };
  };

  const api: Required<MarketplaceDesktopApi> = {
    list: async (input) => {
      const query = input?.query ?? "";
      if (query.length > MARKETPLACE_LIMITS.query)
        throw new Error(`The search has at most ${MARKETPLACE_LIMITS.query} characters.`);
      const found = items
        .filter(
          (item) =>
            (input?.kind === undefined || item.kind === input.kind) &&
            (input?.category === undefined || item.category === input.category),
        )
        .filter((item) => marketplaceMatches(item, query));
      const ordered =
        query.trim() === ""
          ? [...found].sort((a, b) => Number(b.featured) - Number(a.featured) || a.title.localeCompare(b.title))
          : found;
      return clone(ordered);
    },
    get: async ({ itemId }) => details(find(itemId)),
    installSkill: async ({ itemId, botId }): Promise<MarketplaceInstallResult> => {
      const item = find(itemId);
      if (item.kind !== "skill") throw new Error("This item is an agent, not a skill.");
      if (!options.bots().some((bot) => bot.id === botId)) throw new Error("This agent no longer exists.");
      if (item.libraryState === "local") {
        throw new Error("A skill with this name is already in your library and did not come from the Marketplace.");
      }
      failIfAsked();
      const warnings: string[] = [];
      const updated = item.libraryState === "outdated";
      if (updated) warnings.push("Agents that already have this skill keep their version until they update.");
      const next = replace({
        ...item,
        libraryState: "current",
        installedBotIds: item.installedBotIds.includes(botId) ? item.installedBotIds : [...item.installedBotIds, botId],
      });
      return { item: next, botId, bot: null, warnings };
    },
    installAgent: async ({ itemId, name }): Promise<MarketplaceInstallResult> => {
      const item = find(itemId);
      if (item.kind !== "agent") throw new Error("This item is a skill, not an agent.");
      const chosen = (name ?? "").trim() || item.title;
      if (chosen.length > MARKETPLACE_LIMITS.agentName)
        throw new Error(`The name has at most ${MARKETPLACE_LIMITS.agentName} characters.`);
      failIfAsked();
      const bot = options.createAgent(chosen, item);
      const next = replace({ ...item, installedBotIds: [...item.installedBotIds, bot.id] });
      return { item: next, botId: bot.id, bot: clone(bot), warnings: [] };
    },
    uninstall: async ({ itemId, botId }) => {
      const item = find(itemId);
      if (!item.installedBotIds.includes(botId)) throw new Error("This item is not installed for that agent.");
      if (item.kind === "agent") options.removeAgent(botId);
      replace({ ...item, installedBotIds: item.installedBotIds.filter((id) => id !== botId) });
    },
    suggestions: async (input): Promise<MarketplaceSuggestion[]> => {
      const bot = input?.botId === undefined ? null : options.bots().find((entry) => entry.id === input.botId);
      if (input?.botId !== undefined && !bot) throw new Error("This agent no longer exists.");
      const words = (bot?.name ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const open = items.filter(
        (item) => !item.installedBotIds.some((id) => id === bot?.id) && item.libraryState !== "local",
      );
      const scored = open.map((item) => {
        const matched = item.tags.filter((tag) => words.some((word) => tag.includes(word) || word.includes(tag)));
        return { item, matched };
      });
      scored.sort(
        (a, b) =>
          b.matched.length - a.matched.length ||
          Number(b.item.featured) - Number(a.item.featured) ||
          a.item.title.localeCompare(b.item.title),
      );
      return scored.slice(0, MARKETPLACE_LIMITS.suggestions).map(({ item, matched }) => ({
        item: clone(item),
        reason: matched.length > 0 ? `Fits: ${matched.join(", ")}` : "Featured",
        matched,
      }));
    },
  };

  return {
    api,
    simulate: {
      failNext: (message) => {
        failure = message;
      },
      localSkill: (slug) => {
        const item = find(`skill:${slug}`);
        replace({ ...item, libraryState: "local" });
      },
      outdateSkill: (slug) => {
        const item = find(`skill:${slug}`);
        replace({ ...item, libraryState: "outdated", version: item.version + 1 });
      },
      empty: () => {
        items = [];
        emitItems();
      },
    },
  };
}
