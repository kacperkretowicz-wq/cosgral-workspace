// COSGRAL W12-KK (g2): the window API of Transfer/Import and of the update preferences. Answers are checked with the contract guards.

import {
  type ApplyTransferResult,
  type ExportInstanceResult,
  type ImportSourceInfo,
  type InstanceTransferDesktopApi,
  type InstanceTransferSummary,
  IPC_CHANNELS,
  isApplyTransferResult,
  isExportInstanceResult,
  isImportSourceInfo,
  isInstanceTransferSummary,
  isTransferPreview,
  isUpdatePreferences,
  isUpdatesOverview,
  type TransferPreview,
  type UpdatePreferences,
  type UpdatePreferencesDesktopApi,
  type UpdatesOverview,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createInstanceTransferApi(invoke: Invoke): InstanceTransferDesktopApi {
  return {
    summary: () => invoke(IPC_CHANNELS.instanceTransferSummary, null, decodeSummary),
    exportAgents: (input) => invoke(IPC_CHANNELS.instanceTransferExport, input, decodeExport),
    choose: () => invoke(IPC_CHANNELS.instanceTransferChoose, null, decodePreview),
    apply: (input) => invoke(IPC_CHANNELS.instanceTransferApply, input, decodeApply),
    discard: (input) => invoke(IPC_CHANNELS.instanceTransferDiscard, input, decodeVoid),
    importSources: () => invoke(IPC_CHANNELS.instanceTransferImportSources, null, decodeSources),
  };
}

export function createUpdatePreferencesApi(invoke: Invoke): UpdatePreferencesDesktopApi {
  return {
    getOverview: () => invoke(IPC_CHANNELS.updatePreferencesGetOverview, null, decodeUpdatesOverview),
    restartWhenIdle: () => invoke(IPC_CHANNELS.updatePreferencesRestartWhenIdle, null, decodeUpdatesOverview),
    cancelRestartWhenIdle: () => invoke(IPC_CHANNELS.updatePreferencesCancelRestart, null, decodeUpdatesOverview),
    get: () => invoke(IPC_CHANNELS.updatePreferencesGet, null, decodePreferences),
    set: (input) => invoke(IPC_CHANNELS.updatePreferencesSet, input, decodePreferences),
  };
}

function decodeVoid(): void {}

function decodeSummary(value: unknown): InstanceTransferSummary {
  if (!isInstanceTransferSummary(value)) throw new Error("Invalid transfer summary.");
  return value;
}

function decodeExport(value: unknown): ExportInstanceResult {
  if (!isExportInstanceResult(value)) throw new Error("Invalid export result.");
  return value;
}

function decodePreview(value: unknown): TransferPreview | null {
  if (value === null) return null;
  if (!isTransferPreview(value)) throw new Error("Invalid import preview.");
  return value;
}

function decodeApply(value: unknown): ApplyTransferResult {
  if (!isApplyTransferResult(value)) throw new Error("Invalid import result.");
  return value;
}

function decodeSources(value: unknown): ImportSourceInfo[] {
  if (!Array.isArray(value) || !value.every(isImportSourceInfo)) throw new Error("Invalid import sources.");
  return value;
}

function decodeUpdatesOverview(value: unknown): UpdatesOverview {
  if (!isUpdatesOverview(value)) throw new Error("Invalid updates overview.");
  return value;
}

function decodePreferences(value: unknown): UpdatePreferences {
  if (!isUpdatePreferences(value)) throw new Error("Invalid update preferences.");
  return value;
}
