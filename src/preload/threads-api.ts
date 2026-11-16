// COSGRAL W6-BE1: the window API of the threads of an agent. Answers are checked with the contract guard.

import { IPC_CHANNELS, isThreadList, type ThreadList, type ThreadsDesktopApi } from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createThreadsApi(invoke: Invoke): ThreadsDesktopApi {
  return {
    list: (input) => invoke(IPC_CHANNELS.threadsList, input, decodeList),
    create: (input) => invoke(IPC_CHANNELS.threadsCreate, input, decodeList),
    rename: (input) => invoke(IPC_CHANNELS.threadsRename, input, decodeList),
    archive: (input) => invoke(IPC_CHANNELS.threadsArchive, input, decodeList),
    restore: (input) => invoke(IPC_CHANNELS.threadsRestore, input, decodeList),
    delete: (input) => invoke(IPC_CHANNELS.threadsDelete, input, decodeList),
    select: (input) => invoke(IPC_CHANNELS.threadsSelect, input, decodeList),
    branch: (input) => invoke(IPC_CHANNELS.threadsBranch, input, decodeList),
  };
}

function decodeList(value: unknown): ThreadList {
  if (!isThreadList(value)) throw new Error("Invalid thread list.");
  return value;
}
