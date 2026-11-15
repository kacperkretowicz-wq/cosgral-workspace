// COSGRAL W4-BE5: the window API of "Delete my data". Answers are checked with the contract guards.

import {
  type AppDataDesktopApi,
  type DataWipePlan,
  type DataWipeRequestResult,
  IPC_CHANNELS,
  isDataWipePlan,
  isDataWipeRequestResult,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createAppDataApi(invoke: Invoke): AppDataDesktopApi {
  return {
    describeWipe: () => invoke(IPC_CHANNELS.appDataDescribeWipe, null, decodePlan),
    requestWipe: (input) => invoke(IPC_CHANNELS.appDataRequestWipe, input, decodeResult),
  };
}

function decodePlan(value: unknown): DataWipePlan {
  if (!isDataWipePlan(value)) throw new Error("Invalid data wipe plan.");
  return value;
}

function decodeResult(value: unknown): DataWipeRequestResult {
  if (!isDataWipeRequestResult(value)) throw new Error("Invalid data wipe answer.");
  return value;
}
