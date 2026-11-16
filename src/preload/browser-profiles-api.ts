// COSGRAL W8-KK3: the window API of the browser profiles. Answers are checked with the contract guards.

import {
  type BrowserProfileDescription,
  type BrowserProfileList,
  type BrowserProfilesDesktopApi,
  IPC_CHANNELS,
  isBrowserProfileDescription,
  isBrowserProfileList,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createBrowserProfilesApi(invoke: Invoke): BrowserProfilesDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.browserProfilesList, null, decodeList),
    create: (input) => invoke(IPC_CHANNELS.browserProfilesCreate, input, decodeList),
    setDomains: (input) => invoke(IPC_CHANNELS.browserProfilesSetDomains, input, decodeList),
    clear: (input) => invoke(IPC_CHANNELS.browserProfilesClear, input, decodeList),
    describe: (input) => invoke(IPC_CHANNELS.browserProfilesDescribe, input, decodeDescription),
  };
}

function decodeList(value: unknown): BrowserProfileList {
  if (!isBrowserProfileList(value)) throw new Error("Invalid browser profile list.");
  return value;
}

function decodeDescription(value: unknown): BrowserProfileDescription {
  if (!isBrowserProfileDescription(value)) throw new Error("Invalid browser profile description.");
  return value;
}
