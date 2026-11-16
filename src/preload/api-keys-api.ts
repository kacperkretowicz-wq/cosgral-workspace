// COSGRAL W5-BE3: the window API of provider API keys. Answers are checked with the contract guards.

import {
  type ApiKeyEntry,
  type ApiKeysDesktopApi,
  IPC_CHANNELS,
  isApiKeyEntry,
  isApiKeyEntryList,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createApiKeysApi(invoke: Invoke): ApiKeysDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.apiKeysList, null, decodeList),
    set: (input) => invoke(IPC_CHANNELS.apiKeysSet, input, decodeEntry),
    remove: (input) => invoke(IPC_CHANNELS.apiKeysRemove, input, decodeEntry),
    check: (input) => invoke(IPC_CHANNELS.apiKeysCheck, input, decodeEntry),
  };
}

function decodeEntry(value: unknown): ApiKeyEntry {
  if (!isApiKeyEntry(value)) throw new Error("Invalid API key state.");
  return value;
}

function decodeList(value: unknown): ApiKeyEntry[] {
  if (!isApiKeyEntryList(value)) throw new Error("Invalid API key list.");
  return value;
}
