// COSGRAL W11-KK (e): the window API of the Marketplace Apps tab (plugin catalog). Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isPluginCatalogInfo,
  isPluginDetails,
  isPluginList,
  isPluginSummary,
  type PluginCatalogDesktopApi,
  type PluginCatalogInfo,
  type PluginDetails,
  type PluginList,
  type PluginSummary,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createPluginCatalogApi(invoke: Invoke): PluginCatalogDesktopApi {
  return {
    info: () => invoke(IPC_CHANNELS.pluginCatalogInfo, null, decodeInfo),
    list: (input) => invoke(IPC_CHANNELS.pluginCatalogList, input ?? null, decodeList),
    get: (input) => invoke(IPC_CHANNELS.pluginCatalogGet, input, decodeDetails),
    install: (input) => invoke(IPC_CHANNELS.pluginCatalogInstall, input, decodeSummary),
    uninstall: (input) => invoke(IPC_CHANNELS.pluginCatalogUninstall, input, decodeList),
    update: (input) => invoke(IPC_CHANNELS.pluginCatalogUpdate, input, decodeSummary),
    addCustom: (input) => invoke(IPC_CHANNELS.pluginCatalogAddCustom, input, decodeSummary),
    setCatalogFolder: (input) => invoke(IPC_CHANNELS.pluginCatalogSetFolder, input, decodeInfo),
  };
}

function decodeInfo(value: unknown): PluginCatalogInfo {
  if (!isPluginCatalogInfo(value)) throw new Error("Invalid plugin catalog info.");
  return value;
}

function decodeList(value: unknown): PluginList {
  if (!isPluginList(value)) throw new Error("Invalid plugin list.");
  return value;
}

function decodeDetails(value: unknown): PluginDetails {
  if (!isPluginDetails(value)) throw new Error("Invalid plugin details.");
  return value;
}

function decodeSummary(value: unknown): PluginSummary {
  if (!isPluginSummary(value)) throw new Error("Invalid plugin.");
  return value;
}
