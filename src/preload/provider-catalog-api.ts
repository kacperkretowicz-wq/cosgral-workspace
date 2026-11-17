// COSGRAL W12 (BE-E): the window API of the provider catalog. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isProviderCatalogItem,
  isProviderCatalogItems,
  type ProviderCatalogDesktopApi,
  type ProviderCatalogItem,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createProviderCatalogApi(invoke: Invoke): ProviderCatalogDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.providerCatalogList, undefined, decodeItems),
    setKey: (input) => invoke(IPC_CHANNELS.providerCatalogSetKey, input, decodeItem),
    clearKey: (input) => invoke(IPC_CHANNELS.providerCatalogClearKey, input, decodeItem),
  };
}

function decodeItems(value: unknown): ProviderCatalogItem[] {
  if (!isProviderCatalogItems(value)) throw new Error("Invalid provider catalog.");
  return value;
}

function decodeItem(value: unknown): ProviderCatalogItem {
  if (!isProviderCatalogItem(value)) throw new Error("Invalid provider catalog entry.");
  return value;
}
