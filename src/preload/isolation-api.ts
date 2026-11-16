// COSGRAL W8-BE2: the window API of the isolation of processes. Answers are checked with the contract guards.

import {
  type AgentIsolation,
  IPC_CHANNELS,
  type IsolationAvailability,
  type IsolationDesktopApi,
  isAgentIsolation,
  isAgentIsolationList,
  isIsolationAvailability,
  isSetIsolationEnabledResult,
  type SetIsolationEnabledResult,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createIsolationApi(invoke: Invoke): IsolationDesktopApi {
  return {
    getAvailability: () => invoke(IPC_CHANNELS.isolationAvailability, null, decodeAvailability),
    list: () => invoke(IPC_CHANNELS.isolationList, null, decodeList),
    get: (input) => invoke(IPC_CHANNELS.isolationGet, input, decodeOne),
    setEnabled: (input) => invoke(IPC_CHANNELS.isolationSetEnabled, input, decodeResult),
    recheck: () => invoke(IPC_CHANNELS.isolationRecheck, null, decodeAvailability),
  };
}

function decodeAvailability(value: unknown): IsolationAvailability {
  if (!isIsolationAvailability(value)) throw new Error("Invalid isolation availability.");
  return value;
}

function decodeOne(value: unknown): AgentIsolation {
  if (!isAgentIsolation(value)) throw new Error("Invalid isolation.");
  return value;
}

function decodeList(value: unknown): AgentIsolation[] {
  if (!isAgentIsolationList(value)) throw new Error("Invalid isolation list.");
  return value;
}

function decodeResult(value: unknown): SetIsolationEnabledResult {
  if (!isSetIsolationEnabledResult(value)) throw new Error("Invalid isolation result.");
  return value;
}
