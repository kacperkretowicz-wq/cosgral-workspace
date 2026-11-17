// COSGRAL W12-KK: the window API of the Mobile Connect page (one query). The answer is checked with the contract guard.

import {
  IPC_CHANNELS,
  isMobileConnectOverview,
  type MobileConnectDesktopApi,
  type MobileConnectOverview,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createMobileConnectApi(invoke: Invoke): MobileConnectDesktopApi {
  return { getOverview: () => invoke(IPC_CHANNELS.mobileConnectGetOverview, null, decodeOverview) };
}

function decodeOverview(value: unknown): MobileConnectOverview {
  if (!isMobileConnectOverview(value)) throw new Error("Invalid Mobile Connect overview.");
  return value;
}
