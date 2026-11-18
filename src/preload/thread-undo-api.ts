// COSGRAL W12 (BE-K): the window API of delete with undo. Answers are checked with the contract guards.

import {
  type DeleteThreadUndoResult,
  IPC_CHANNELS,
  isDeleteThreadUndoResult,
  isPendingThreadDeleteList,
  isThreadList,
  type PendingThreadDelete,
  type ThreadList,
  type ThreadUndoDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createThreadUndoApi(invoke: Invoke): ThreadUndoDesktopApi {
  return {
    delete: (input) => invoke(IPC_CHANNELS.threadUndoDelete, input, decodeResult),
    undo: (input) => invoke(IPC_CHANNELS.threadUndoUndo, input, decodeList),
    list: (input) => invoke(IPC_CHANNELS.threadUndoList, input, decodePending),
  };
}

function decodeResult(value: unknown): DeleteThreadUndoResult {
  if (!isDeleteThreadUndoResult(value)) throw new Error("Invalid thread delete.");
  return value;
}

function decodeList(value: unknown): ThreadList {
  if (!isThreadList(value)) throw new Error("Invalid thread list.");
  return value;
}

function decodePending(value: unknown): PendingThreadDelete[] {
  if (!isPendingThreadDeleteList(value)) throw new Error("Invalid list of deleted threads.");
  return value;
}
