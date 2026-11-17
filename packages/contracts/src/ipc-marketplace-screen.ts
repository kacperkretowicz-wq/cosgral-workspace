// COSGRAL W12-KK: what the Marketplace tabs "Agents" and "Skills" need besides the catalog itself (screens "Marketplace · Agents",
// "Marketplace · Skills"). The page shows a "Featured" row of cards, sections by category (name, summary and an "Add" button), a filter
// "All / Verified / Public" and a search box ("Search, or paste a GitHub link" on Skills). Pure functions and fixed lists, so the program,
// the window and the demo show the same thing. Texts are English sources; the window translates them.
//
// This version has ONE catalog: the one that comes with the program, published by COSGRAL, so everything in it is "verified". A public
// community catalog and installing a skill from a GitHub link need a network source and a review step we do not have; they are listed
// with a reason instead of a dead control.

import { BOT_AVATAR_HUES, type BotAvatarHue } from "./ipc-conversation";
import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
  type MarketplaceItem,
  type MarketplaceItemKind,
} from "./ipc-marketplace";

export const MARKETPLACE_PUBLISHER = "COSGRAL";

export const MARKETPLACE_CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  productivity: "Productivity",
  research: "Research",
  writing: "Writing",
  communication: "Communication",
  development: "Development",
  data: "Data",
  travel: "Travel",
};

/** Header, subtitle and search placeholder of a tab. */
export const MARKETPLACE_TABS: Record<
  MarketplaceItemKind,
  { title: string; subtitle: string; searchPlaceholder: string }
> = {
  agent: {
    title: "Agents",
    subtitle: "Ready-made agents with their own instructions and skills.",
    searchPlaceholder: "Search",
  },
  skill: {
    title: "Skills",
    subtitle: "Instructions that teach an agent a task or a tool.",
    searchPlaceholder: "Search, or paste a GitHub link",
  },
};

export const MARKETPLACE_SOURCE_FILTERS = [
  { id: "all", label: "All", available: true, reason: null },
  { id: "verified", label: "Verified", available: true, reason: null },
  {
    id: "public",
    label: "Public",
    available: false,
    reason:
      "A public catalog of community items needs a server. This version has the catalog that comes with the program.",
  },
] as const;
export type MarketplaceSourceFilter = (typeof MARKETPLACE_SOURCE_FILTERS)[number]["id"];

export function isMarketplaceSourceFilter(value: unknown): value is MarketplaceSourceFilter {
  return MARKETPLACE_SOURCE_FILTERS.some((filter) => filter.id === value);
}

/** What the page lists as not available, with the reason (shown under the search box or as a dimmed control). */
export const MARKETPLACE_UNAVAILABLE: readonly { id: string; label: string; reason: string }[] = [
  {
    id: "github-link",
    label: "Install a skill from a GitHub link",
    reason:
      "A skill from the internet is not reviewed. Put its files in the Library skills page instead, where you check them first.",
  },
  {
    id: "public-catalog",
    label: "Public catalog",
    reason:
      "A public catalog of community items needs a server. This version has the catalog that comes with the program.",
  },
  {
    id: "publish",
    label: "Publish your own item",
    reason:
      "A skill or agent you make stays on this computer; the catalog only holds items that come with the program.",
  },
];

export interface MarketplaceItemSource {
  publisher: string;
  verified: boolean;
}

/** Every item of the catalog comes from the program, so it is published by COSGRAL and verified. */
export function marketplaceItemSource(_item: MarketplaceItem): MarketplaceItemSource {
  return { publisher: MARKETPLACE_PUBLISHER, verified: true };
}

function hashOf(text: string): number {
  let hash = 2166136261;
  for (const char of text) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619) >>> 0;
  }
  return hash;
}

/** The mascot of an agent card: the same seed and colour every time, from the item's id (no extra field to store). */
export function marketplaceItemAvatar(item: Pick<MarketplaceItem, "id">): { seed: string; hue: BotAvatarHue } {
  const hue = BOT_AVATAR_HUES[hashOf(item.id) % BOT_AVATAR_HUES.length] ?? BOT_AVATAR_HUES[0];
  return { seed: item.id, hue };
}

export interface MarketplaceSection {
  category: MarketplaceCategory;
  label: string;
  items: MarketplaceItem[];
}

export interface MarketplaceLayout {
  /** The "Featured" row; empty when there is a search or a filter. */
  featured: MarketplaceItem[];
  /** Sections in the order of the catalog's categories; empty categories are left out. An item shown as featured is not repeated. */
  sections: MarketplaceSection[];
  total: number;
}

function folded(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** The words that must all appear in the title, summary, description, tags or category (same rule as the catalog search). */
export function marketplaceMatches(item: MarketplaceItem, query: string): boolean {
  const words = folded(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = folded(
    [
      item.title,
      item.summary,
      item.description,
      item.category,
      MARKETPLACE_CATEGORY_LABELS[item.category],
      ...item.tags,
    ].join(" "),
  );
  return words.every((word) => haystack.includes(word));
}

/** The page of one tab: featured first, then sections by category, items by title. A search flattens the featured row away. */
export function layoutMarketplace(
  items: readonly MarketplaceItem[],
  options: { kind: MarketplaceItemKind; query?: string; source?: MarketplaceSourceFilter },
): MarketplaceLayout {
  const query = (options.query ?? "").trim();
  const source = options.source ?? "all";
  const shown = items
    .filter((item) => item.kind === options.kind)
    .filter((item) => source === "all" || (source === "verified" && marketplaceItemSource(item).verified))
    .filter((item) => marketplaceMatches(item, query))
    .sort((left, right) => left.title.localeCompare(right.title));
  const showFeatured = query === "" && source === "all";
  const featured = showFeatured ? shown.filter((item) => item.featured) : [];
  const featuredIds = new Set(featured.map((item) => item.id));
  const sections: MarketplaceSection[] = [];
  for (const category of MARKETPLACE_CATEGORIES) {
    const inCategory = shown.filter((item) => item.category === category && !featuredIds.has(item.id));
    if (inCategory.length > 0)
      sections.push({ category, label: MARKETPLACE_CATEGORY_LABELS[category], items: inCategory });
  }
  return { featured, sections, total: shown.length };
}

export type MarketplaceQuery = { kind: "search"; text: string } | { kind: "github-link"; url: string };

const GITHUB_LINK = /^https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+(?:\/[^\s]*)?$/i;

/** The skills search box takes words or a GitHub link; a link is recognised so the page can say it is not installed from there. */
export function parseMarketplaceQuery(raw: string): MarketplaceQuery {
  const text = raw.trim();
  return GITHUB_LINK.test(text) ? { kind: "github-link", url: text } : { kind: "search", text };
}

export type MarketplaceActionKind = "add" | "added" | "update" | "blocked";

export interface MarketplaceAction {
  kind: MarketplaceActionKind;
  /** The button text. */
  label: string;
  enabled: boolean;
  /** A skill goes to one agent: the page asks which one before it installs. */
  needsAgent: boolean;
  /** Why it is disabled, or a short note under the button. */
  reason: string | null;
}

/**
 * What the item's button does. A skill is added to the chosen agent (`botId`); an agent item always makes a NEW agent, so it can be
 * added again (each time a copy). `botId: null` = no agent chosen yet.
 */
export function marketplaceAction(item: MarketplaceItem, botId: string | null): MarketplaceAction {
  if (item.kind === "agent") {
    return {
      kind: "add",
      label: "Add",
      enabled: true,
      needsAgent: false,
      reason: item.installedBotIds.length > 0 ? `${item.installedBotIds.length} already created from this item.` : null,
    };
  }
  const has = botId !== null && item.installedBotIds.includes(botId);
  switch (item.libraryState) {
    case "local":
      return {
        kind: "blocked",
        label: "Add",
        enabled: false,
        needsAgent: false,
        reason: "A skill with this name is already in your library and did not come from the Marketplace.",
      };
    case "outdated":
      return {
        kind: "update",
        label: "Update",
        enabled: true,
        needsAgent: botId === null,
        reason: "A newer version of this skill is in the catalog.",
      };
    case "current":
      return has
        ? { kind: "added", label: "Added", enabled: false, needsAgent: false, reason: null }
        : { kind: "add", label: "Add", enabled: true, needsAgent: botId === null, reason: null };
    default:
      return { kind: "add", label: "Add", enabled: true, needsAgent: botId === null, reason: null };
  }
}

export type MarketplacePageState = "loading" | "error" | "empty" | "no-match" | "ready";

/** Which of the page's states to draw (a loading spinner, an error with Retry, an empty catalog, no match for the search, the list). */
export function marketplacePageState(input: {
  loading: boolean;
  error: string | null;
  layout: MarketplaceLayout;
  query: string;
}): { state: MarketplacePageState; message: string | null } {
  if (input.loading) return { state: "loading", message: null };
  if (input.error) return { state: "error", message: input.error };
  if (input.layout.total > 0) return { state: "ready", message: null };
  return input.query.trim() === ""
    ? { state: "empty", message: "The catalog has nothing here yet." }
    : { state: "no-match", message: `Nothing matches "${input.query.trim()}".` };
}
