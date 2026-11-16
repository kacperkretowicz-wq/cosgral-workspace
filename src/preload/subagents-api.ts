// COSGRAL W6-BE4: the window API of the subagents. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isSubagent,
  isSubagentList,
  type Subagent,
  type SubagentsDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createSubagentsApi(invoke: Invoke): SubagentsDesktopApi {
  return {
    list: (input) => invoke(IPC_CHANNELS.subagentsList, input, decodeList),
    stop: (input) => invoke(IPC_CHANNELS.subagentsStop, input, decodeOne),
  };
}

function decodeOne(value: unknown): Subagent {
  if (!isSubagent(value)) throw new Error("Invalid subagent.");
  return value;
}

function decodeList(value: unknown): Subagent[] {
  if (!isSubagentList(value)) throw new Error("Invalid subagent list.");
  return value;
}
