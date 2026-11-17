// COSGRAL W11-KK (d): the window API of the Vault connectors and the person's Vault tools. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isVaultCodes,
  isVaultConnectorList,
  isVaultConnectorLoginList,
  isVaultConnectorStatus,
  isVaultCsvImportResult,
  type VaultCodes,
  type VaultConnectorList,
  type VaultConnectorLoginList,
  type VaultConnectorStatus,
  type VaultConnectorsDesktopApi,
  type VaultCsvImportResult,
  type VaultSecretsDesktopApi,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createVaultConnectorsApi(invoke: Invoke): VaultConnectorsDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.vaultConnectorsList, null, decodeList),
    status: (input) => invoke(IPC_CHANNELS.vaultConnectorsStatus, input, decodeStatus),
    checkSetup: (input) => invoke(IPC_CHANNELS.vaultConnectorsCheckSetup, input, decodeStatus),
    installCli: (input) => invoke(IPC_CHANNELS.vaultConnectorsInstallCli, input, decodeStatus),
    openApp: (input) => invoke(IPC_CHANNELS.vaultConnectorsOpenApp, input, decodeVoid),
    connect: (input) => invoke(IPC_CHANNELS.vaultConnectorsConnect, input, decodeStatus),
    listLogins: (input) => invoke(IPC_CHANNELS.vaultConnectorsListLogins, input, decodeLogins),
    cancel: (input) => invoke(IPC_CHANNELS.vaultConnectorsCancel, input, decodeStatus),
    disconnect: (input) => invoke(IPC_CHANNELS.vaultConnectorsDisconnect, input, decodeStatus),
  };
}

export function createVaultSecretsApi(invoke: Invoke): VaultSecretsDesktopApi {
  return {
    reveal: (input) => invoke(IPC_CHANNELS.vaultReveal, input, decodeReveal),
    copy: (input) => invoke(IPC_CHANNELS.vaultCopy, input, decodeCopy),
    importCsv: (input) => invoke(IPC_CHANNELS.vaultImportCsv, input, decodeImport),
    codes: () => invoke(IPC_CHANNELS.vaultCodes, null, decodeCodes),
    reset: () => invoke(IPC_CHANNELS.vaultReset, null, decodeVoid),
  };
}

function decodeList(value: unknown): VaultConnectorList {
  if (!isVaultConnectorList(value)) throw new Error("Invalid connector list.");
  return value;
}

function decodeLogins(value: unknown): VaultConnectorLoginList {
  if (!isVaultConnectorLoginList(value)) throw new Error("Invalid connector logins.");
  return value;
}

function decodeStatus(value: unknown): VaultConnectorStatus {
  if (!isVaultConnectorStatus(value)) throw new Error("Invalid connector status.");
  return value;
}

function decodeVoid(): void {}

function decodeReveal(value: unknown): { value: string } {
  if (!isDynamicRecord(value) || !isString(value.value)) throw new Error("Invalid Vault answer.");
  return { value: value.value };
}

function decodeCopy(value: unknown): { clearsInSeconds: number } {
  if (!isDynamicRecord(value) || !isNumber(value.clearsInSeconds)) throw new Error("Invalid Vault answer.");
  return { clearsInSeconds: value.clearsInSeconds };
}

function decodeImport(value: unknown): VaultCsvImportResult {
  if (!isVaultCsvImportResult(value)) throw new Error("Invalid import result.");
  return value;
}

function decodeCodes(value: unknown): VaultCodes {
  if (!isVaultCodes(value)) throw new Error("Invalid Vault codes.");
  return value;
}
