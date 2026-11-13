// COSGRAL W3: the local Marketplace (parity row 41, spec W3 §10). The catalog is our own content in the repo
// (marketplace-catalog.ts); nothing comes from the network. A skill item goes into the skill library (W2 engine: its
// limits, versions and per-agent copies) and is installed for the chosen agent; an agent item runs the agent creator
// (W3 templates). Which library skill came from which catalog version is kept here, so a local skill with the same
// name is never replaced. An agent can only suggest an item: the person decides on a confirm card.

import type { DatabaseSync } from "node:sqlite";
import {
  type AgentEvent,
  type AgentReasoningEffort,
  type AgentToolSwitches,
  type BotSummary,
  type CreateAgentInput,
  type CreateAgentResult,
  type DraftPreviewResolution,
  type InstallMarketplaceAgentInput,
  type InstallMarketplaceSkillInput,
  type ListMarketplaceInput,
  type ListMarketplaceSuggestionsInput,
  MARKETPLACE_LIMITS,
  type MarketplaceCategory,
  type MarketplaceInstallResult,
  type MarketplaceItem,
  type MarketplaceItemDetails,
  type MarketplaceLibraryState,
  type MarketplaceSuggestion,
  marketplaceItemId,
  type UninstallMarketplaceItemInput,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { CardContext } from "./action-cards";
import { MARKETPLACE_CATALOG } from "./marketplace-catalog";
import type { OpenBotDatabase } from "./openbot-database";
import type { SkillLibrary } from "./skill-library";

interface CatalogBase {
  /** Skill: the skill name (kebab-case, also in SKILL.md). Agent: a short id. */
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: MarketplaceCategory;
  tags: string[];
  featured: boolean;
  /** Raise it when the content changes; the library then gets a new version on the next install. */
  version: number;
}

export interface CatalogSkill extends CatalogBase {
  kind: "skill";
  skillMd: string;
  files?: Array<{ path: string; content: string }>;
}

export interface CatalogAgent extends CatalogBase {
  kind: "agent";
  role: string;
  /** The new agent's description (how it works). */
  instructions: string;
  reasoningEffort: AgentReasoningEffort | null;
  /** Tool groups switched off for the new agent. */
  tools: AgentToolSwitches;
  /** Catalog skill slugs the new agent gets. */
  skills: string[];
  memories: string[];
}

export type CatalogEntry = CatalogSkill | CatalogAgent;

type Library = Pick<
  SkillLibrary,
  "findByName" | "create" | "revise" | "install" | "update" | "uninstall" | "installedFor" | "on"
>;

export interface MarketplaceDeps {
  database: OpenBotDatabase;
  library: Library;
  /** The built-in seed when omitted. */
  catalog?: CatalogEntry[];
  bots: () => Array<Pick<BotSummary, "id" | "name" | "role" | "description">>;
  /** The agent creator (W3 templates). */
  createAgent: (input: CreateAgentInput) => Promise<CreateAgentResult>;
  deleteBot: (botId: string) => Promise<void>;
  /** A confirm card in Needs you; resolves with the person's decision. */
  confirm: (context: CardContext, input: { title: string; preview: string }) => Promise<DraftPreviewResolution>;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
}

/** What an agent's suggestion led to. */
export interface MarketplaceSuggestOutcome {
  decision: "installed" | "declined" | "expired" | "already-installed";
  result: MarketplaceInstallResult | null;
}

interface SkillLink {
  itemId: string;
  skillId: string;
  catalogVersion: number;
  libraryVersion: number;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_marketplace_skills (
    item_id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    catalog_version INTEGER NOT NULL,
    library_version INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_marketplace_agents (
    bot_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    installed_at TEXT NOT NULL
  );
`;

/** Search field weights: a word in the title counts most. */
const WEIGHTS = { title: 4, tags: 3, slug: 3, summary: 2, category: 2, description: 1 } as const;

const STOP_WORDS = new Set(
  "the and you your for with that this from what when into them they each every before after about have will does make keep help work person agent only more most than then also their there here other such are not can all any how who use using one".split(
    " ",
  ),
);

export class Marketplace {
  readonly #deps: MarketplaceDeps;
  readonly #catalog: CatalogEntry[];
  readonly #ready = new WeakSet<DatabaseSync>();
  #queue: Promise<unknown> = Promise.resolve();
  /** While above zero, library events do not emit; the operation emits once at the end. */
  #quiet = 0;

  constructor(deps: MarketplaceDeps) {
    this.#deps = deps;
    this.#catalog = deps.catalog ?? MARKETPLACE_CATALOG;
    const changed = () => {
      if (this.#quiet === 0) this.#emitChanged();
    };
    deps.library.on("skills-changed", changed);
    deps.library.on("installs-changed", changed);
  }

  /** Featured first, then by title; with a query, every word must match and the best matches come first. */
  list(input: ListMarketplaceInput = {}): MarketplaceItem[] {
    const words = tokens(input.query ?? "");
    const scored = this.#catalog
      .filter(
        (entry) => (!input.kind || entry.kind === input.kind) && (!input.category || entry.category === input.category),
      )
      .map((entry) => ({ entry, score: words.length ? searchScore(entry, words) : 0 }))
      .filter(({ score }) => !words.length || score > 0);
    scored.sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.entry.featured) - Number(left.entry.featured) ||
        left.entry.title.localeCompare(right.entry.title),
    );
    return scored.map(({ entry }) => this.#item(entry));
  }

  get(itemId: string): MarketplaceItemDetails {
    const entry = this.#entry(itemId);
    if (entry.kind === "skill") {
      return {
        item: this.#item(entry),
        skillMd: entry.skillMd,
        files: ["SKILL.md", ...(entry.files ?? []).map((file) => file.path).sort()],
        agent: null,
      };
    }
    return {
      item: this.#item(entry),
      skillMd: null,
      files: [],
      agent: { role: entry.role, description: entry.instructions, memories: [...entry.memories] },
    };
  }

  /** Adds the skill to the library when needed, then installs it for the agent (or moves its copy to the latest). */
  async installSkill(input: InstallMarketplaceSkillInput): Promise<MarketplaceInstallResult> {
    const entry = this.#skillEntry(input.itemId);
    this.#bot(input.botId);
    return this.#operation(async () => {
      const { skillId, warnings } = await this.#ensureInLibrary(entry);
      const existing = this.#deps.library.installedFor(input.botId).find((skill) => skill.skillId === skillId);
      if (!existing) {
        await this.#deps.library.install({ skillId, botId: input.botId });
      } else if (existing.version < (this.#deps.library.findByName(entry.slug)?.version ?? existing.version)) {
        try {
          await this.#deps.library.update({ skillId, botId: input.botId });
        } catch (error) {
          warnings.push(`${errorText(error)} The agent keeps version ${existing.version}.`);
        }
      }
      return { item: this.#item(entry), botId: input.botId, bot: null, warnings };
    });
  }

  /** The agent creator with the item's profile; catalog skills it needs go into the library first. */
  async installAgent(input: InstallMarketplaceAgentInput): Promise<MarketplaceInstallResult> {
    const entry = this.#entry(input.itemId);
    if (entry.kind !== "agent") throw new Error(`"${entry.title}" is a skill; install it for an agent.`);
    const name = input.name?.trim() || entry.title;
    if (name.length > MARKETPLACE_LIMITS.agentName) {
      throw new Error(`The agent name has at most ${MARKETPLACE_LIMITS.agentName} characters.`);
    }
    return this.#operation(async () => {
      const warnings: string[] = [];
      const skills: string[] = [];
      for (const slug of entry.skills) {
        const skill = this.#catalog.find(
          (candidate): candidate is CatalogSkill => candidate.kind === "skill" && candidate.slug === slug,
        );
        if (!skill) {
          warnings.push(`Skill "${slug}" is not in the Marketplace catalog.`);
          continue;
        }
        try {
          const added = await this.#ensureInLibrary(skill);
          warnings.push(...added.warnings);
          skills.push(slug);
        } catch (error) {
          warnings.push(`Skill "${slug}" was not added: ${errorText(error)}`);
        }
      }
      const created = await this.#deps.createAgent({
        name,
        role: entry.role,
        description: entry.instructions,
        ...(entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}),
        tools: { ...entry.tools },
        skills,
        memories: [...entry.memories],
      });
      warnings.push(...created.warnings);
      this.#db()
        .prepare(
          `INSERT INTO projection_marketplace_agents (bot_id, item_id, installed_at) VALUES (?, ?, ?)
           ON CONFLICT(bot_id) DO UPDATE SET item_id = excluded.item_id, installed_at = excluded.installed_at`,
        )
        .run(created.bot.id, idOf(entry), this.#iso());
      return { item: this.#item(entry), botId: created.bot.id, bot: created.bot, warnings };
    });
  }

  /** Skill: off this agent, the library keeps it. Agent: deletes the agent, only when it was created from this item. */
  async uninstall(input: UninstallMarketplaceItemInput): Promise<void> {
    const entry = this.#entry(input.itemId);
    return this.#operation(async () => {
      if (entry.kind === "skill") {
        const skill = this.#linkedSkill(entry);
        if (!skill || !this.#deps.library.installedFor(input.botId).some((item) => item.skillId === skill.id)) {
          throw new Error(`"${entry.title}" is not installed for this agent.`);
        }
        await this.#deps.library.uninstall({ skillId: skill.id, botId: input.botId });
        return;
      }
      const row = this.#db()
        .prepare("SELECT item_id FROM projection_marketplace_agents WHERE bot_id = ?")
        .get(input.botId);
      if (!isDynamicRecord(row) || row.item_id !== idOf(entry)) {
        throw new Error(`This agent was not created from "${entry.title}"; remove it in its settings.`);
      }
      await this.#deps.deleteBot(input.botId);
      this.#db().prepare("DELETE FROM projection_marketplace_agents WHERE bot_id = ?").run(input.botId);
    });
  }

  /** Skills that fit the agent's name, role and instructions and that it lacks; featured items without an agent. */
  suggestions(input: ListMarketplaceSuggestionsInput = {}): MarketplaceSuggestion[] {
    if (input.botId === undefined) {
      return this.list()
        .filter((item) => item.featured && item.libraryState !== "local")
        .slice(0, MARKETPLACE_LIMITS.suggestions)
        .map((item) => ({ item, reason: "Featured", matched: [] }));
    }
    const bot = this.#bot(input.botId);
    const profile = new Set(keywords(`${bot.name} ${bot.role} ${bot.description}`));
    const botId = bot.id;
    return this.list({ kind: "skill" })
      .filter((item) => item.libraryState !== "local" && !item.installedBotIds.includes(botId))
      .map((item) => {
        const entry = this.#entry(item.id);
        const itemWords = new Set(keywords([entry.title, entry.summary, entry.category, ...entry.tags].join(" ")));
        const matched = [...profile].filter((word) => itemWords.has(word));
        return { item, matched, score: matched.length * 2 + Number(item.featured) };
      })
      .filter(({ matched, item }) => matched.length > 0 || item.featured)
      .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
      .slice(0, MARKETPLACE_LIMITS.suggestions)
      .map(({ item, matched }) => ({
        item,
        matched,
        reason: matched.length ? `Fits: ${matched.slice(0, 3).join(", ")}` : "Featured",
      }));
  }

  /** An agent's suggestion: a confirm card first; only "send" (Approve) installs. */
  async suggest(context: CardContext, input: { itemId: string; reason: string }): Promise<MarketplaceSuggestOutcome> {
    const entry = this.#entry(input.itemId);
    const reason = input.reason.trim();
    if (!reason) throw new Error("reason is required: why this item helps the person.");
    if (reason.length > MARKETPLACE_LIMITS.reason) {
      throw new Error(`reason has at most ${MARKETPLACE_LIMITS.reason} characters.`);
    }
    const bot = this.#bot(context.botId);
    if (entry.kind === "skill" && this.#item(entry).installedBotIds.includes(bot.id)) {
      return { decision: "already-installed", result: null };
    }
    const preview =
      entry.kind === "skill"
        ? [
            `${bot.name} suggests the Marketplace skill "${entry.title}" for itself.`,
            entry.summary,
            `Why: ${reason}`,
            `Approve to add it to the skill library and install it for ${bot.name}. Nothing in it runs by itself.`,
          ]
        : [
            `${bot.name} suggests a new agent from the Marketplace: "${entry.title}".`,
            entry.summary,
            `Why: ${reason}`,
            "Approve to create the agent with its role, instructions and skills.",
          ];
    const decision = await this.#deps.confirm(context, {
      title: `Install "${entry.title}" from the Marketplace?`,
      preview: preview.join("\n"),
    });
    if (decision === "expired") return { decision: "expired", result: null };
    if (decision !== "send") return { decision: "declined", result: null };
    const result =
      entry.kind === "skill"
        ? await this.installSkill({ itemId: idOf(entry), botId: bot.id })
        : await this.installAgent({ itemId: idOf(entry) });
    return { decision: "installed", result };
  }

  /** The library skill of this catalog item, added or moved to the catalog version when it can be. */
  async #ensureInLibrary(entry: CatalogSkill): Promise<{ skillId: string; warnings: string[] }> {
    const state = this.#libraryState(entry);
    const source = { kind: "inline" as const, skillMd: entry.skillMd, files: entry.files ?? [] };
    const note = `From the Marketplace (catalog version ${entry.version}).`;
    if (state === "local") {
      throw new Error(
        `A library skill named ${entry.slug} is not from the Marketplace. Rename or delete it to install "${entry.title}".`,
      );
    }
    if (state === "absent") {
      const skill = await this.#deps.library.create({ source, authorBotId: null, note });
      this.#saveLink({
        itemId: idOf(entry),
        skillId: skill.id,
        catalogVersion: entry.version,
        libraryVersion: skill.version,
      });
      return { skillId: skill.id, warnings: [] };
    }
    const skill = this.#deps.library.findByName(entry.slug);
    const link = this.#link(idOf(entry));
    if (!skill || !link) throw new Error("The skill library changed; try again.");
    if (state === "current") return { skillId: skill.id, warnings: [] };
    if (skill.version !== link.libraryVersion) {
      // Someone revised the library copy after the Marketplace version; their version stays.
      return {
        skillId: skill.id,
        warnings: [`The library copy of ${entry.slug} was changed after the Marketplace version and was kept.`],
      };
    }
    const revised = await this.#deps.library.revise({
      skillId: skill.id,
      baseVersion: skill.version,
      source,
      authorBotId: null,
      note,
    });
    this.#saveLink({
      itemId: idOf(entry),
      skillId: skill.id,
      catalogVersion: entry.version,
      libraryVersion: revised.version,
    });
    return { skillId: skill.id, warnings: [] };
  }

  #item(entry: CatalogEntry): MarketplaceItem {
    const base = {
      id: idOf(entry),
      kind: entry.kind,
      title: entry.title,
      summary: entry.summary,
      description: entry.description,
      category: entry.category,
      tags: [...entry.tags],
      featured: entry.featured,
      version: entry.version,
    };
    const bots = this.#deps.bots();
    if (entry.kind === "skill") {
      const libraryState = this.#libraryState(entry);
      const skill = libraryState === "current" || libraryState === "outdated" ? this.#linkedSkill(entry) : null;
      return {
        ...base,
        skillName: entry.slug,
        skills: [],
        libraryState,
        installedBotIds: skill
          ? bots
              .filter((bot) => this.#deps.library.installedFor(bot.id).some((item) => item.skillId === skill.id))
              .map((bot) => bot.id)
          : [],
      };
    }
    const existing = new Set(bots.map((bot) => bot.id));
    const created = this.#db()
      .prepare("SELECT bot_id FROM projection_marketplace_agents WHERE item_id = ? ORDER BY installed_at, rowid")
      .all(idOf(entry))
      .flatMap((row) => (isDynamicRecord(row) && isString(row.bot_id) && existing.has(row.bot_id) ? [row.bot_id] : []));
    return { ...base, skillName: null, skills: [...entry.skills], libraryState: null, installedBotIds: created };
  }

  #libraryState(entry: CatalogSkill): MarketplaceLibraryState {
    const skill = this.#deps.library.findByName(entry.slug);
    if (!skill) return "absent";
    const link = this.#link(idOf(entry));
    if (!link || link.skillId !== skill.id) return "local";
    return link.catalogVersion < entry.version ? "outdated" : "current";
  }

  #linkedSkill(entry: CatalogSkill) {
    const skill = this.#deps.library.findByName(entry.slug);
    const link = this.#link(idOf(entry));
    return skill && link && link.skillId === skill.id ? skill : null;
  }

  #link(itemId: string): SkillLink | null {
    const row = this.#db()
      .prepare(
        "SELECT item_id, skill_id, catalog_version, library_version FROM projection_marketplace_skills WHERE item_id = ?",
      )
      .get(itemId);
    if (
      !isDynamicRecord(row) ||
      !isString(row.skill_id) ||
      !isNumber(row.catalog_version) ||
      !isNumber(row.library_version)
    ) {
      return null;
    }
    return { itemId, skillId: row.skill_id, catalogVersion: row.catalog_version, libraryVersion: row.library_version };
  }

  #saveLink(link: SkillLink): void {
    this.#db()
      .prepare(
        `INSERT INTO projection_marketplace_skills (item_id, skill_id, catalog_version, library_version) VALUES (?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET skill_id = excluded.skill_id, catalog_version = excluded.catalog_version,
           library_version = excluded.library_version`,
      )
      .run(link.itemId, link.skillId, link.catalogVersion, link.libraryVersion);
  }

  #entry(itemId: string): CatalogEntry {
    const entry = this.#catalog.find((candidate) => idOf(candidate) === itemId);
    if (!entry) throw new Error("This Marketplace item does not exist.");
    return entry;
  }

  #skillEntry(itemId: string): CatalogSkill {
    const entry = this.#entry(itemId);
    if (entry.kind !== "skill") throw new Error(`"${entry.title}" is an agent; install it as a new agent.`);
    return entry;
  }

  #bot(botId: string) {
    const bot = this.#deps.bots().find((candidate) => candidate.id === botId);
    if (!bot) throw new Error("This agent does not exist.");
    return bot;
  }

  /** One operation at a time; library events wait and one `marketplace-changed` follows. */
  #operation<T>(work: () => Promise<T>): Promise<T> {
    const run = async () => {
      this.#quiet += 1;
      try {
        return await work();
      } finally {
        this.#quiet -= 1;
        this.#emitChanged();
      }
    };
    const result = this.#queue.then(run, run);
    this.#queue = result.catch(() => undefined);
    return result;
  }

  #emitChanged(): void {
    this.#deps.emit({ type: "marketplace-changed", items: this.list() });
  }

  #db(): DatabaseSync {
    const db = this.#deps.database.connection;
    if (!this.#ready.has(db)) {
      db.exec(SCHEMA);
      this.#ready.add(db);
    }
    return db;
  }

  #iso(): string {
    return (this.#deps.now?.() ?? new Date()).toISOString();
  }
}

function idOf(entry: CatalogEntry): string {
  return marketplaceItemId(entry.kind, entry.slug);
}

/** Lower case without accents, split into words. */
function tokens(text: string): string[] {
  return normalize(text.slice(0, MARKETPLACE_LIMITS.query))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function searchScore(entry: CatalogEntry, words: string[]): number {
  const fields: Array<[string, number]> = [
    [normalize(entry.title), WEIGHTS.title],
    [normalize(entry.tags.join(" ")), WEIGHTS.tags],
    [normalize(entry.slug), WEIGHTS.slug],
    [normalize(entry.summary), WEIGHTS.summary],
    [normalize(entry.category), WEIGHTS.category],
    [normalize(entry.description), WEIGHTS.description],
  ];
  let total = 0;
  for (const word of words) {
    const score = fields.reduce((sum, [text, weight]) => sum + (text.includes(word) ? weight : 0), 0);
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

/** Profile words for suggestions: at least 3 letters, no stop words, a trailing plural "s" removed. */
function keywords(text: string): string[] {
  return [
    ...new Set(
      tokens(text)
        .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
        .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word)),
    ),
  ];
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
