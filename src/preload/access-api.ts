// COSGRAL W8-BE1: the window API of the access levels. Answers are checked with the contract guards.

import {
  type AccessDesktopApi,
  type AgentAccess,
  IPC_CHANNELS,
  isAgentAccess,
  isAgentAccessList,
  isSetAccessLevelResult,
  type SetAccessLevelResult,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createAccessApi(invoke: Invoke): AccessDesktopApi {
  return {
    get: (input) => invoke(IPC_CHANNELS.accessGet, input, decodeOne),
    list: () => invoke(IPC_CHANNELS.accessList, null, decodeList),
    setFolders: (input) => invoke(IPC_CHANNELS.accessSetFolders, input, decodeOne),
    setLevel: (input) => invoke(IPC_CHANNELS.accessSetLevel, input, decodeResult),
  };
}

function decodeOne(value: unknown): AgentAccess {
  if (!isAgentAccess(value)) throw new Error("Invalid access.");
  return value;
}

function decodeList(value: unknown): AgentAccess[] {
  if (!isAgentAccessList(value)) throw new Error("Invalid access list.");
  return value;
}

function decodeResult(value: unknown): SetAccessLevelResult {
  if (!isSetAccessLevelResult(value)) throw new Error("Invalid access result.");
  return value;
}
