// COSGRAL W3: the local Marketplace (parity row 41, spec W3 §10). A catalog of our own skills and agents that comes
// with the program (seed in the repo, no network). Installing a skill puts it in the skill library and installs it for
// the chosen agent (the W2 skill engine, limits 200 files / 10 MB); installing an agent runs the agent creator (W3
// templates). An agent may only suggest an item: the person approves it on a confirm card, nothing installs by itself.
// A skill a person or an agent creates locally never enters the catalog. Plugins with their own connections: W4.

import type { BotSummary } from "./ipc-conversation";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const MARKETPLACE_ITEM_KINDS = ["skill", "agent"] as const;
export type MarketplaceItemKind = (typeof MARKETPLACE_ITEM_KINDS)[number];

export const MARKETPLACE_CATEGORIES = [
  "productivity",
  "research",
  "writing",
  "communication",
  "development",
  "data",
  "travel",
] as const;
export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

/**
 * How a skill item relates to this computer's skill library:
 * - "absent": not in the library yet; Install adds it.
 * - "current": the library holds this catalog version.
 * - "outdated": the library holds an older catalog version; Install saves the new one as a new library version
 *   (copies agents already have keep their version until they update).
 * - "local": a library skill with this name did not come from the Marketplace; Install is refused.
 */
export const MARKETPLACE_LIBRARY_STATES = ["absent", "current", "outdated", "local"] as const;
export type MarketplaceLibraryState = (typeof MARKETPLACE_LIBRARY_STATES)[number];

export const MARKETPLACE_LIMITS = {
  query: 200,
  /** Why an agent suggests an item (shown on the card). */
  reason: 500,
  /** Suggestions returned at most. */
  suggestions: 6,
  /** Name of a new agent from an agent item. */
  agentName: 80,
} as const;

export interface MarketplaceItem {
  /** "skill:<skill name>" or "agent:<slug>". */
  id: string;
  kind: MarketplaceItemKind;
  title: string;
  /** One line for the gallery. */
  summary: string;
  description: string;
  category: MarketplaceCategory;
  tags: string[];
  /** Shown first and used as suggestions when nothing else fits. */
  featured: boolean;
  /** Version of the catalog entry; it grows when a program update changes the item. */
  version: number;
  /** Skill items: the library skill name. Null for agents. */
  skillName: string | null;
  /** Agent items: the catalog skills the new agent gets. Empty for skills. */
  skills: string[];
  /** Skill items: see MARKETPLACE_LIBRARY_STATES. Null for agents. */
  libraryState: MarketplaceLibraryState | null;
  /** Skill: agents that have this skill installed. Agent: agents created from this item that still exist. */
  installedBotIds: string[];
}

/** Details before installing: what goes into the library (skills) or what the new agent gets (agents). */
export interface MarketplaceItemDetails {
  item: MarketplaceItem;
  /** Skill items: SKILL.md of the catalog version. Agent items: null. */
  skillMd: string | null;
  /** Skill items: every file path, SKILL.md included. */
  files: string[];
  /** Agent items: the new agent's role, instructions and starting memories. */
  agent: { role: string; description: string; memories: string[] } | null;
}

export interface ListMarketplaceInput {
  /** Words that must all appear (title, summary, description, tags, category); case and accents do not matter. */
  query?: string;
  kind?: MarketplaceItemKind;
  category?: MarketplaceCategory;
}

export interface MarketplaceItemIdInput {
  itemId: string;
}

export interface InstallMarketplaceSkillInput {
  itemId: string;
  /** The agent that gets the skill. */
  botId: string;
}

export interface InstallMarketplaceAgentInput {
  itemId: string;
  /** The new agent's name; the item's title when omitted. */
  name?: string;
}

/**
 * Skill: removes the skill from this agent (the library keeps it). Agent: deletes this agent, which was created from the
 * item, with its chats and files; the window asks the person first.
 */
export interface UninstallMarketplaceItemInput {
  itemId: string;
  botId: string;
}

export interface ListMarketplaceSuggestionsInput {
  /** Fit for this agent (its name, role and instructions); featured items when omitted. */
  botId?: string;
}

export interface MarketplaceInstallResult {
  item: MarketplaceItem;
  /** The agent that has the item now: the chosen agent (skill) or the new agent (agent). */
  botId: string;
  /** Agent items: the new agent. Null for skills. */
  bot: BotSummary | null;
  /** What could not be done; the install itself happened. */
  warnings: string[];
}

export interface MarketplaceSuggestion {
  item: MarketplaceItem;
  /** Short reason, e.g. "Fits: research, sources" or "Featured". */
  reason: string;
  /** Words of the agent's profile that matched the item. */
  matched: string[];
}

export function marketplaceItemId(kind: MarketplaceItemKind, slug: string): string {
  return `${kind}:${slug}`;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isMarketplaceItem(value: unknown): value is MarketplaceItem {
  if (
    !isDynamicRecord(value) ||
    !isString(value.id) ||
    !isOneOf(MARKETPLACE_ITEM_KINDS, value.kind) ||
    !isString(value.title) ||
    !isString(value.summary) ||
    !isString(value.description) ||
    !isOneOf(MARKETPLACE_CATEGORIES, value.category) ||
    !isStringList(value.tags) ||
    !isBoolean(value.featured) ||
    !isNumber(value.version) ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    !isStringList(value.skills) ||
    !isStringList(value.installedBotIds)
  ) {
    return false;
  }
  return value.kind === "skill"
    ? isString(value.skillName) && isOneOf(MARKETPLACE_LIBRARY_STATES, value.libraryState)
    : value.skillName === null && value.libraryState === null;
}

export function isMarketplaceItemDetails(value: unknown): value is MarketplaceItemDetails {
  return (
    isDynamicRecord(value) &&
    isMarketplaceItem(value.item) &&
    (value.skillMd === null || isString(value.skillMd)) &&
    isStringList(value.files) &&
    (value.agent === null ||
      (isDynamicRecord(value.agent) &&
        isString(value.agent.role) &&
        isString(value.agent.description) &&
        isStringList(value.agent.memories)))
  );
}

export function isMarketplaceInstallResult(value: unknown): value is MarketplaceInstallResult {
  return (
    isDynamicRecord(value) &&
    isMarketplaceItem(value.item) &&
    isString(value.botId) &&
    (value.bot === null || (isDynamicRecord(value.bot) && isString(value.bot.id))) &&
    isStringList(value.warnings)
  );
}

export function isMarketplaceSuggestion(value: unknown): value is MarketplaceSuggestion {
  return (
    isDynamicRecord(value) && isMarketplaceItem(value.item) && isString(value.reason) && isStringList(value.matched)
  );
}

/**
 * COSGRAL W3: the window API (`window.openbot.marketplace`). This computer only. Changes come as
 * `marketplace-changed` (the whole catalog with install states); an agent's suggestion is a confirm card in Needs you.
 */
export interface MarketplaceDesktopApi {
  /** Featured first, then by title; with a query, best matches first. */
  list: (input?: ListMarketplaceInput) => Promise<MarketplaceItem[]>;
  get: (input: MarketplaceItemIdInput) => Promise<MarketplaceItemDetails>;
  /** Adds the skill to the library when needed and installs it for the agent. */
  installSkill: (input: InstallMarketplaceSkillInput) => Promise<MarketplaceInstallResult>;
  /** Creates a new agent with the item's profile and skills (the agent creator). */
  installAgent: (input: InstallMarketplaceAgentInput) => Promise<MarketplaceInstallResult>;
  uninstall: (input: UninstallMarketplaceItemInput) => Promise<void>;
  /** At most MARKETPLACE_LIMITS.suggestions items the agent does not have yet. */
  suggestions: (input?: ListMarketplaceSuggestionsInput) => Promise<MarketplaceSuggestion[]>;
}
