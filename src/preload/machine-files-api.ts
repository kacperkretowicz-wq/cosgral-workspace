// COSGRAL (parity row 45): the window API of Library › Files › This computer. Answers are checked with the contract guards;
// malformed folder entries are dropped.

import {
  type CopyMachineFilesResult,
  IPC_CHANNELS,
  isCopyMachineFilesResult,
  isMachineFolderGrant,
  isMachineListing,
  type MachineFilesDesktopApi,
  type MachineFolderGrant,
  type MachineListing,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createMachineFilesApi(invoke: Invoke): MachineFilesDesktopApi {
  return {
    grants: () => invoke(IPC_CHANNELS.machineFilesGrants, null, decodeGrants),
    grant: () => invoke(IPC_CHANNELS.machineFilesGrant, null, decodeGrantOrNull),
    revoke: (input) => invoke(IPC_CHANNELS.machineFilesRevoke, input, () => undefined),
    list: (input) => invoke(IPC_CHANNELS.machineFilesList, input, decodeListing),
    open: (input) => invoke(IPC_CHANNELS.machineFilesOpen, input, () => undefined),
    copyToLibrary: (input) => invoke(IPC_CHANNELS.machineFilesCopy, input, decodeCopy),
  };
}

function decodeGrants(value: unknown): MachineFolderGrant[] {
  return Array.isArray(value) ? value.filter(isMachineFolderGrant) : [];
}

function decodeGrantOrNull(value: unknown): MachineFolderGrant | null {
  if (value === null) return null;
  if (!isMachineFolderGrant(value)) throw new Error("Invalid shared folder response.");
  return value;
}

function decodeListing(value: unknown): MachineListing {
  if (!isMachineListing(value)) throw new Error("Invalid folder listing response.");
  return value;
}

function decodeCopy(value: unknown): CopyMachineFilesResult {
  if (!isCopyMachineFilesResult(value)) throw new Error("Invalid copy response.");
  return value;
}
