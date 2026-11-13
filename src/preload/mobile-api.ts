// COSGRAL W3: the window API of Mobile Connect. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isMobileDevice,
  isMobilePairingTicket,
  isMobileState,
  type MobileDesktopApi,
  type MobileDevice,
  type MobilePairingTicket,
  type MobileState,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createMobileApi(invoke: Invoke): MobileDesktopApi {
  return {
    getState: () => invoke(IPC_CHANNELS.mobileGetState, null, decodeState),
    startPairing: (input) => invoke(IPC_CHANNELS.mobileStartPairing, input ?? null, decodeTicket),
    cancelPairing: () => invoke(IPC_CHANNELS.mobileCancelPairing, null, decodeState),
    disable: () => invoke(IPC_CHANNELS.mobileDisable, null, decodeState),
    listDevices: () => invoke(IPC_CHANNELS.mobileListDevices, null, decodeDevices),
    revokeDevice: (input) => invoke(IPC_CHANNELS.mobileRevokeDevice, input, decodeState),
  };
}

function decodeState(value: unknown): MobileState {
  if (!isMobileState(value)) throw new Error("Invalid Mobile Connect state response.");
  return value;
}

function decodeTicket(value: unknown): MobilePairingTicket {
  if (!isMobilePairingTicket(value)) throw new Error("Invalid pairing response.");
  return value;
}

function decodeDevices(value: unknown): MobileDevice[] {
  if (!Array.isArray(value)) throw new Error("Invalid device list response.");
  return value.filter(isMobileDevice);
}
