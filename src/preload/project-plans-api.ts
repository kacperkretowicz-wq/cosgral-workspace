// COSGRAL: the window API of the plan of a project. Answers are checked with the contract guard.

import { IPC_CHANNELS, isProjectPlan, type ProjectPlan, type ProjectPlansDesktopApi } from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createProjectPlansApi(invoke: Invoke): ProjectPlansDesktopApi {
  return {
    get: (input) => invoke(IPC_CHANNELS.projectPlansGet, input, decodeOptional),
    saveDescription: (input) => invoke(IPC_CHANNELS.projectPlansSaveDescription, input, decode),
    requestPlan: (input) => invoke(IPC_CHANNELS.projectPlansRequest, input, decode),
    accept: (input) => invoke(IPC_CHANNELS.projectPlansAccept, input, decode),
    decideSkills: (input) => invoke(IPC_CHANNELS.projectPlansDecideSkills, input, decode),
    decideReview: (input) => invoke(IPC_CHANNELS.projectPlansDecideReview, input, decode),
    setReviewItem: (input) => invoke(IPC_CHANNELS.projectPlansSetReviewItem, input, decode),
  };
}

function decode(value: unknown): ProjectPlan {
  if (!isProjectPlan(value)) throw new Error("Invalid project plan.");
  return value;
}

function decodeOptional(value: unknown): ProjectPlan | null {
  return value === null ? null : decode(value);
}
