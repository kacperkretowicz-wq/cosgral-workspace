// COSGRAL W12 (BE-R): the window API of the routines of a channel. Answers are checked with the contract guards.

import {
  type ChannelRoutine,
  type ChannelRoutineRun,
  type ChannelRoutinesDesktopApi,
  type ChannelRoutineWebhook,
  IPC_CHANNELS,
  isChannelRoutine,
  isChannelRoutineList,
  isChannelRoutineRun,
  isChannelRoutineRunList,
  isChannelRoutineWebhook,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createChannelRoutinesApi(invoke: Invoke): ChannelRoutinesDesktopApi {
  return {
    list: (input) => invoke(IPC_CHANNELS.channelRoutinesList, input ?? {}, decodeList),
    create: (input) => invoke(IPC_CHANNELS.channelRoutinesCreate, input, decodeRoutine),
    update: (input) => invoke(IPC_CHANNELS.channelRoutinesUpdate, input, decodeRoutine),
    delete: (input) => invoke(IPC_CHANNELS.channelRoutinesDelete, input, () => undefined),
    runNow: (input) => invoke(IPC_CHANNELS.channelRoutinesRunNow, input, decodeRun),
    listRuns: (input) => invoke(IPC_CHANNELS.channelRoutinesListRuns, input, decodeRuns),
    enableWebhook: (input) => invoke(IPC_CHANNELS.channelRoutinesEnableWebhook, input, decodeWebhook),
    disableWebhook: (input) => invoke(IPC_CHANNELS.channelRoutinesDisableWebhook, input, decodeRoutine),
  };
}

function decodeList(value: unknown): ChannelRoutine[] {
  if (!isChannelRoutineList(value)) throw new Error("Invalid list of routines.");
  return value;
}

function decodeRoutine(value: unknown): ChannelRoutine {
  if (!isChannelRoutine(value)) throw new Error("Invalid routine.");
  return value;
}

function decodeWebhook(value: unknown): ChannelRoutineWebhook {
  if (!isChannelRoutineWebhook(value)) throw new Error("Invalid webhook of a routine.");
  return value;
}

function decodeRun(value: unknown): ChannelRoutineRun {
  if (!isChannelRoutineRun(value)) throw new Error("Invalid routine run.");
  return value;
}

function decodeRuns(value: unknown): ChannelRoutineRun[] {
  if (!isChannelRoutineRunList(value)) throw new Error("Invalid history of a routine.");
  return value;
}
