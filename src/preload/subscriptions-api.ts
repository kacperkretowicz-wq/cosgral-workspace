// COSGRAL W5-BE1: the window API of managed CLIs. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isManagedCliState,
  isManagedCliStateList,
  type ManagedCliState,
  type SubscriptionsDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createSubscriptionsApi(invoke: Invoke): SubscriptionsDesktopApi {
  return {
    listCli: () => invoke(IPC_CHANNELS.subscriptionsListCli, null, decodeList),
    checkCli: (input) => invoke(IPC_CHANNELS.subscriptionsCheckCli, input, decodeState),
    installCli: (input) => invoke(IPC_CHANNELS.subscriptionsInstallCli, input, decodeState),
    updateCli: (input) => invoke(IPC_CHANNELS.subscriptionsUpdateCli, input, decodeState),
    removeCli: (input) => invoke(IPC_CHANNELS.subscriptionsRemoveCli, input, decodeState),
    pinCli: (input) => invoke(IPC_CHANNELS.subscriptionsPinCli, input, decodeState),
    setCliSettings: (input) => invoke(IPC_CHANNELS.subscriptionsSetCliSettings, input, decodeState),
  };
}

function decodeState(value: unknown): ManagedCliState {
  if (!isManagedCliState(value)) throw new Error("Invalid managed CLI state.");
  return value;
}

function decodeList(value: unknown): ManagedCliState[] {
  if (!isManagedCliStateList(value)) throw new Error("Invalid managed CLI list.");
  return value;
}
