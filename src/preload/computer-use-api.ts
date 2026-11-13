// COSGRAL W3: the window API of Computer Use: who controls the computer, and Stop.

import {
  type ComputerUseDesktopApi,
  type ComputerUseState,
  IPC_CHANNELS,
  isComputerUseState,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createComputerUseApi(invoke: Invoke): ComputerUseDesktopApi {
  return {
    getState: () => invoke(IPC_CHANNELS.computerUseGetState, null, decodeState),
    stop: (input) => invoke(IPC_CHANNELS.computerUseStop, input ?? null, decodeState),
  };
}

function decodeState(value: unknown): ComputerUseState {
  if (!isComputerUseState(value)) throw new Error("Invalid Computer Use state response.");
  return value;
}
