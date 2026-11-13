// COSGRAL W3: the window API of the local Marketplace. Answers are checked with the contract guards.

import {
  type BotSummary,
  IPC_CHANNELS,
  isMarketplaceItem,
  isMarketplaceItemDetails,
  isMarketplaceSuggestion,
  type MarketplaceDesktopApi,
  type MarketplaceInstallResult,
  type MarketplaceItem,
  type MarketplaceItemDetails,
  type MarketplaceSuggestion,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createMarketplaceApi(invoke: Invoke, decodeBot: (value: unknown) => BotSummary): MarketplaceDesktopApi {
  const decodeInstall = (value: unknown): MarketplaceInstallResult => {
    if (
      !isDynamicRecord(value) ||
      !isMarketplaceItem(value.item) ||
      !isString(value.botId) ||
      !Array.isArray(value.warnings)
    ) {
      throw new Error("Invalid Marketplace install response.");
    }
    return {
      item: value.item,
      botId: value.botId,
      bot: value.bot === null || value.bot === undefined ? null : decodeBot(value.bot),
      warnings: value.warnings.filter(isString),
    };
  };
  return {
    list: (input) => invoke(IPC_CHANNELS.marketplaceList, input ?? null, decodeItems),
    get: (input) => invoke(IPC_CHANNELS.marketplaceGet, input, decodeDetails),
    installSkill: (input) => invoke(IPC_CHANNELS.marketplaceInstallSkill, input, decodeInstall),
    installAgent: (input) => invoke(IPC_CHANNELS.marketplaceInstallAgent, input, decodeInstall),
    uninstall: (input) => invoke(IPC_CHANNELS.marketplaceUninstall, input, () => undefined),
    suggestions: (input) => invoke(IPC_CHANNELS.marketplaceSuggestions, input ?? null, decodeSuggestions),
  };
}

function decodeItems(value: unknown): MarketplaceItem[] {
  if (!Array.isArray(value)) throw new Error("Invalid Marketplace list response.");
  return value.filter(isMarketplaceItem);
}

function decodeDetails(value: unknown): MarketplaceItemDetails {
  if (!isMarketplaceItemDetails(value)) throw new Error("Invalid Marketplace item response.");
  return value;
}

function decodeSuggestions(value: unknown): MarketplaceSuggestion[] {
  if (!Array.isArray(value)) throw new Error("Invalid Marketplace suggestions response.");
  return value.filter(isMarketplaceSuggestion);
}
