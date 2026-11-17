// COSGRAL W12 (BE-D): the window API of the server settings. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isServerSettings,
  isServerSettingsSections,
  isStorageReport,
  type ServerSettings,
  type ServerSettingsDesktopApi,
  type ServerSettingsSection,
  type StorageReport,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createServerSettingsApi(invoke: Invoke): ServerSettingsDesktopApi {
  return {
    sections: () => invoke(IPC_CHANNELS.serverSettingsSections, undefined, decodeSections),
    get: () => invoke(IPC_CHANNELS.serverSettingsGet, undefined, decodeSettings),
    update: (input) => invoke(IPC_CHANNELS.serverSettingsUpdate, input, decodeSettings),
    measureStorage: () => invoke(IPC_CHANNELS.serverSettingsMeasureStorage, undefined, decodeStorage),
    clearLogs: () => invoke(IPC_CHANNELS.serverSettingsClearLogs, undefined, decodeStorage),
  };
}

function decodeSections(value: unknown): ServerSettingsSection[] {
  if (!isServerSettingsSections(value)) throw new Error("Invalid server settings sections.");
  return value;
}

function decodeSettings(value: unknown): ServerSettings {
  if (!isServerSettings(value)) throw new Error("Invalid server settings.");
  return value;
}

function decodeStorage(value: unknown): StorageReport {
  if (!isStorageReport(value)) throw new Error("Invalid storage report.");
  return value;
}
