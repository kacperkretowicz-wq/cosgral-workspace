// COSGRAL W6-BE2: the window API of the conversation context. Answers are checked with the contract guards.

import {
  type ContextDesktopApi,
  type ContextSettings,
  type ContextState,
  IPC_CHANNELS,
  isContextSettings,
  isContextState,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createContextApi(invoke: Invoke): ContextDesktopApi {
  return {
    getState: (input) => invoke(IPC_CHANNELS.contextGetState, input, decodeState),
    compact: (input) => invoke(IPC_CHANNELS.contextCompact, input, decodeState),
    getSettings: () => invoke(IPC_CHANNELS.contextGetSettings, null, decodeSettings),
    updateSettings: (input) => invoke(IPC_CHANNELS.contextUpdateSettings, input, decodeSettings),
  };
}

function decodeState(value: unknown): ContextState {
  if (!isContextState(value)) throw new Error("Invalid context state.");
  return value;
}

function decodeSettings(value: unknown): ContextSettings {
  if (!isContextSettings(value)) throw new Error("Invalid context settings.");
  return value;
}
