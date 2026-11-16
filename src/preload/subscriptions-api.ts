// COSGRAL W5-BE1/BE2: the window API of managed CLIs, accounts and the pool. Answers are checked with the contract guards.

import {
  type AccountsSnapshot,
  IPC_CHANNELS,
  isAccountsSnapshot,
  isManagedCliState,
  isManagedCliStateList,
  isPoolSettings,
  isProviderAccount,
  type ManagedCliState,
  type PoolSettings,
  type ProviderAccount,
  type SubscriptionsDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createSubscriptionsApi(invoke: Invoke): SubscriptionsDesktopApi {
  return {
    listAccounts: () => invoke(IPC_CHANNELS.subscriptionsListAccounts, null, decodeSnapshot),
    addAccount: (input) => invoke(IPC_CHANNELS.subscriptionsAddAccount, input, decodeAccount),
    removeAccount: (input) => invoke(IPC_CHANNELS.subscriptionsRemoveAccount, input, decodeSnapshot),
    loginAccount: (input) => invoke(IPC_CHANNELS.subscriptionsLoginAccount, input, decodeAccount),
    submitLoginCode: (input) => invoke(IPC_CHANNELS.subscriptionsSubmitLoginCode, input, decodeAccount),
    cancelLogin: (input) => invoke(IPC_CHANNELS.subscriptionsCancelLogin, input, decodeAccount),
    openLoginTerminal: (input) => invoke(IPC_CHANNELS.subscriptionsOpenLoginTerminal, input, decodeAccount),
    logoutAccount: (input) => invoke(IPC_CHANNELS.subscriptionsLogoutAccount, input, decodeAccount),
    refreshAccount: (input) => invoke(IPC_CHANNELS.subscriptionsRefreshAccount, input, decodeAccount),
    setAccountPool: (input) => invoke(IPC_CHANNELS.subscriptionsSetAccountPool, input, decodeSnapshot),
    assignAccountToAgent: (input) => invoke(IPC_CHANNELS.subscriptionsAssignAccountToAgent, input, decodeSnapshot),
    getPoolSettings: () => invoke(IPC_CHANNELS.subscriptionsGetPoolSettings, null, decodePool),
    setPoolSettings: (input) => invoke(IPC_CHANNELS.subscriptionsSetPoolSettings, input, decodePool),
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

function decodeAccount(value: unknown): ProviderAccount {
  if (!isProviderAccount(value)) throw new Error("Invalid provider account.");
  return value;
}

function decodeSnapshot(value: unknown): AccountsSnapshot {
  if (!isAccountsSnapshot(value)) throw new Error("Invalid account list.");
  return value;
}

function decodePool(value: unknown): PoolSettings {
  if (!isPoolSettings(value)) throw new Error("Invalid pool settings.");
  return value;
}
