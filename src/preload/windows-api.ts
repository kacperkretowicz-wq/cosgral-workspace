// COSGRAL W6-KK3: the window API of the separate conversation windows. Answers are checked with the contract guards.

import {
  type ConversationWindowInfo,
  IPC_CHANNELS,
  isConversationWindowInfo,
  isConversationWindowList,
  isOpenConversationResult,
  type OpenConversationResult,
  type WindowsDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createWindowsApi(invoke: Invoke): WindowsDesktopApi {
  return {
    openConversation: (input) => invoke(IPC_CHANNELS.windowsOpenConversation, input, decodeResult),
    listOpen: () => invoke(IPC_CHANNELS.windowsListOpen, null, decodeList),
    close: async (input) => {
      await invoke(IPC_CHANNELS.windowsClose, input, () => undefined);
    },
    current: () => invoke(IPC_CHANNELS.windowsCurrent, null, decodeCurrent),
  };
}

function decodeResult(value: unknown): OpenConversationResult {
  if (!isOpenConversationResult(value)) throw new Error("Invalid conversation window answer.");
  return value;
}

function decodeList(value: unknown): ConversationWindowInfo[] {
  if (!isConversationWindowList(value)) throw new Error("Invalid conversation window list.");
  return value;
}

function decodeCurrent(value: unknown): ConversationWindowInfo | null {
  if (value === null) return null;
  if (!isConversationWindowInfo(value)) throw new Error("Invalid conversation window.");
  return value;
}
