// COSGRAL W5-K2: the window API of own model endpoints. Answers are checked with the contract guards.

import {
  type EndpointsDesktopApi,
  IPC_CHANNELS,
  isModelEndpoint,
  isModelEndpointList,
  type ModelEndpoint,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createEndpointsApi(invoke: Invoke): EndpointsDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.endpointsList, null, decodeList),
    save: (input) => invoke(IPC_CHANNELS.endpointsSave, input, decodeEndpoint),
    remove: async (input) => {
      await invoke(IPC_CHANNELS.endpointsRemove, input, () => undefined);
    },
    check: (input) => invoke(IPC_CHANNELS.endpointsCheck, input, decodeEndpoint),
    detectLocal: () => invoke(IPC_CHANNELS.endpointsDetectLocal, null, decodeList),
  };
}

function decodeEndpoint(value: unknown): ModelEndpoint {
  if (!isModelEndpoint(value)) throw new Error("Invalid endpoint.");
  return value;
}

function decodeList(value: unknown): ModelEndpoint[] {
  if (!isModelEndpointList(value)) throw new Error("Invalid endpoint list.");
  return value;
}
