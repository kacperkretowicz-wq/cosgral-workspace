// COSGRAL W3: what a window may send for the Marketplace (see ipc-marketplace.ts).

import {
  type InstallMarketplaceAgentInput,
  type InstallMarketplaceSkillInput,
  type ListMarketplaceInput,
  type ListMarketplaceSuggestionsInput,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_ITEM_KINDS,
  MARKETPLACE_LIMITS,
  type MarketplaceItemIdInput,
  type UninstallMarketplaceItemInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseListMarketplace(value: unknown): ListMarketplaceInput {
  if (value === null || value === undefined) return {};
  const input = record(value);
  const parsed: ListMarketplaceInput = {};
  if (input.query !== undefined && input.query !== null) {
    if (!isString(input.query)) throw new Error("query must be text.");
    if (input.query.length > MARKETPLACE_LIMITS.query) throw new Error("query is too long.");
    parsed.query = input.query;
  }
  if (input.kind !== undefined && input.kind !== null) {
    if (!isOneOf(MARKETPLACE_ITEM_KINDS, input.kind)) throw new Error('kind must be "skill" or "agent".');
    parsed.kind = input.kind;
  }
  if (input.category !== undefined && input.category !== null) {
    if (!isOneOf(MARKETPLACE_CATEGORIES, input.category)) throw new Error("Unknown Marketplace category.");
    parsed.category = input.category;
  }
  return parsed;
}

export function parseMarketplaceItemId(value: unknown): MarketplaceItemIdInput {
  return { itemId: requireString(record(value).itemId, "itemId") };
}

export function parseInstallMarketplaceSkill(value: unknown): InstallMarketplaceSkillInput {
  const input = record(value);
  return { itemId: requireString(input.itemId, "itemId"), botId: requireString(input.botId, "botId") };
}

export function parseInstallMarketplaceAgent(value: unknown): InstallMarketplaceAgentInput {
  const input = record(value);
  const parsed: InstallMarketplaceAgentInput = { itemId: requireString(input.itemId, "itemId") };
  if (input.name !== undefined && input.name !== null) {
    if (!isString(input.name)) throw new Error("name must be text.");
    if (input.name.length > MARKETPLACE_LIMITS.agentName) throw new Error("name is too long.");
    parsed.name = input.name;
  }
  return parsed;
}

export function parseUninstallMarketplaceItem(value: unknown): UninstallMarketplaceItemInput {
  const input = record(value);
  return { itemId: requireString(input.itemId, "itemId"), botId: requireString(input.botId, "botId") };
}

export function parseMarketplaceSuggestions(value: unknown): ListMarketplaceSuggestionsInput {
  if (value === null || value === undefined) return {};
  const input = record(value);
  return input.botId === undefined || input.botId === null ? {} : { botId: requireString(input.botId, "botId") };
}

function record(value: unknown): DynamicRecord {
  if (!isObject(value)) throw new Error("Expected an object.");
  return value;
}
