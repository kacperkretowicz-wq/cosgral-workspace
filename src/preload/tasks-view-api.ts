// COSGRAL W12 (BE-J): the window API of the Tasks view. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isTaskDetail,
  isTasksBoard,
  isTasksViewPage,
  type TaskDetail,
  type TasksBoard,
  type TasksViewDesktopApi,
  type TasksViewPage,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createTasksViewApi(invoke: Invoke): TasksViewDesktopApi {
  return {
    list: (query) => invoke(IPC_CHANNELS.tasksViewList, query ?? {}, decodePage),
    board: (query) => invoke(IPC_CHANNELS.tasksViewBoard, query ?? {}, decodeBoard),
    detail: (input) => invoke(IPC_CHANNELS.tasksViewDetail, input, decodeDetail),
  };
}

function decodePage(value: unknown): TasksViewPage {
  if (!isTasksViewPage(value)) throw new Error("Invalid task list.");
  return value;
}

function decodeBoard(value: unknown): TasksBoard {
  if (!isTasksBoard(value)) throw new Error("Invalid task board.");
  return value;
}

function decodeDetail(value: unknown): TaskDetail {
  if (!isTaskDetail(value)) throw new Error("Invalid task.");
  return value;
}
