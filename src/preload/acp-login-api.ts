// COSGRAL W6-BE5: the window API of the sign-in to ACP agents. Answers are checked with the contract guards.

import {
  type AcpLoginDesktopApi,
  type AcpLoginState,
  IPC_CHANNELS,
  isAcpLoginState,
  isAcpLoginStateList,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createAcpLoginApi(invoke: Invoke): AcpLoginDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.acpLoginList, null, decodeList),
    start: (input) => invoke(IPC_CHANNELS.acpLoginStart, input, decodeOne),
    submitCode: (input) => invoke(IPC_CHANNELS.acpLoginSubmitCode, input, decodeOne),
    cancel: (input) => invoke(IPC_CHANNELS.acpLoginCancel, input, decodeOne),
  };
}

function decodeOne(value: unknown): AcpLoginState {
  if (!isAcpLoginState(value)) throw new Error("Invalid sign-in state.");
  return value;
}

function decodeList(value: unknown): AcpLoginState[] {
  if (!isAcpLoginStateList(value)) throw new Error("Invalid sign-in list.");
  return value;
}
