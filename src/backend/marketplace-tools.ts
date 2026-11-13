// COSGRAL W3: the agents' Marketplace tools, part of `cosgral_skills` (the same switch, Codex functions, Claude MCP
// server and channel scope). An agent searches the local catalog and may suggest one item; the person decides on a
// confirm card and only an approval installs it (spec W3 10.3).

import { join } from "node:path";
import { MARKETPLACE_ITEM_KINDS, MARKETPLACE_LIMITS, type MarketplaceItem } from "@openbot/contracts/ipc";
import { type DynamicRecord, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { z } from "zod";
import type { CardContext } from "./action-cards";
import type { Marketplace, MarketplaceSuggestOutcome } from "./marketplace";

export type MarketplaceToolHost = Pick<Marketplace, "list" | "suggest">;

/** One search hit as the agent sees it. */
export interface MarketplaceSearchHit {
  id: string;
  kind: MarketplaceItem["kind"];
  title: string;
  summary: string;
  category: MarketplaceItem["category"];
  tags: string[];
  skills?: string[];
  libraryState?: MarketplaceItem["libraryState"];
  installedForYou: boolean;
}

export type MarketplaceToolResult =
  | { items: MarketplaceSearchHit[]; more: number; instruction: string }
  | {
      decision: MarketplaceSuggestOutcome["decision"];
      installed: boolean;
      warnings?: string[];
      instruction: string;
    };

const SEARCH_RESULTS = 20;

export const MARKETPLACE_TOOL_SPECS: Array<{ name: string; description: string; schema: z.ZodRawShape }> = [
  {
    name: "search_marketplace",
    description:
      "Search this computer's Marketplace: ready skills and agents that come with the program. Every word of the query must match; leave it out to see featured items first. installedForYou tells whether you already have a skill.",
    schema: {
      query: z.string().max(MARKETPLACE_LIMITS.query).optional(),
      kind: z.enum(MARKETPLACE_ITEM_KINDS).optional(),
    },
  },
  {
    name: "suggest_marketplace_item",
    description:
      "Suggest one Marketplace item to the person when it would clearly help with their request: a skill for you, or a new agent. The person sees a card with your reason and decides; nothing is installed without their approval. Wait for the answer, and do not suggest the same item again after a refusal.",
    schema: {
      itemId: z.string().min(1).max(200),
      reason: z.string().min(1).max(MARKETPLACE_LIMITS.reason),
    },
  },
];

export const MARKETPLACE_TOOL_NAMES = new Set(MARKETPLACE_TOOL_SPECS.map((spec) => spec.name));

export const MARKETPLACE_INSTRUCTIONS =
  "When a ready skill or agent from the Marketplace would clearly help, find it with search_marketplace and suggest it with suggest_marketplace_item; the person decides on a card, and you never install Marketplace items yourself.";

export async function handleMarketplaceTool(
  marketplace: MarketplaceToolHost | null,
  tool: string,
  args: DynamicRecord,
  context: { botId: string; workspacePath: string; card?: CardContext },
): Promise<MarketplaceToolResult> {
  if (!marketplace) throw new Error("The Marketplace is not available in this turn.");
  if (tool === "search_marketplace") {
    const query = optionalString(args.query, "query", MARKETPLACE_LIMITS.query);
    const kind = args.kind;
    if (kind !== undefined && kind !== null && !isOneOf(MARKETPLACE_ITEM_KINDS, kind)) {
      throw new Error('kind must be "skill" or "agent".');
    }
    const items = marketplace.list({ ...(query ? { query } : {}), ...(kind ? { kind } : {}) });
    return {
      items: items.slice(0, SEARCH_RESULTS).map(
        (item): MarketplaceSearchHit => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          summary: item.summary,
          category: item.category,
          tags: item.tags,
          ...(item.kind === "agent" ? { skills: item.skills } : { libraryState: item.libraryState }),
          installedForYou: item.kind === "skill" && item.installedBotIds.includes(context.botId),
        }),
      ),
      more: Math.max(0, items.length - SEARCH_RESULTS),
      instruction: "To offer one to the person, call suggest_marketplace_item with its id and a short reason.",
    };
  }
  if (tool === "suggest_marketplace_item") {
    if (!isString(args.itemId) || !args.itemId.trim())
      throw new Error("itemId is required: an id from search_marketplace.");
    if (!isString(args.reason) || !args.reason.trim())
      throw new Error("reason is required: why this item helps the person.");
    if (!context.card) throw new Error("Suggestions need a conversation turn with the person.");
    const outcome = await marketplace.suggest(context.card, { itemId: args.itemId, reason: args.reason });
    const result = outcome.result;
    if (outcome.decision === "installed" && result) {
      const instruction =
        result.item.kind === "skill"
          ? `Installed for you. Read ${join(context.workspacePath, ".cosgral", "skills", result.item.skillName ?? "", "SKILL.md")} before you follow it.`
          : `The new agent "${result.bot?.name ?? result.item.title}" was created.`;
      return { decision: outcome.decision, installed: true, warnings: result.warnings, instruction };
    }
    return {
      decision: outcome.decision,
      installed: false,
      instruction:
        outcome.decision === "already-installed"
          ? "You already have this skill; use it."
          : outcome.decision === "expired"
            ? "The card closed before the person answered; nothing was installed."
            : "The person did not approve it. Do not suggest this item again in this conversation.",
    };
  }
  throw new Error(`Unknown Marketplace tool: ${tool}`);
}

function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isString(value)) throw new Error(`${field} must be text.`);
  if (value.length > max) throw new Error(`${field} has at most ${max} characters.`);
  return value.trim() || undefined;
}
