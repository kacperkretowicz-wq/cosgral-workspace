// COSGRAL W6-BE3: the window API of the actions on a message. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isMessageActionResult,
  isMessagePinList,
  type MessageActionResult,
  type MessageActionsDesktopApi,
  type MessagePin,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createMessageActionsApi(invoke: Invoke): MessageActionsDesktopApi {
  return {
    retry: (input) => invoke(IPC_CHANNELS.messageActionsRetry, input, decodeResult),
    edit: (input) => invoke(IPC_CHANNELS.messageActionsEdit, input, decodeResult),
    delete: (input) => invoke(IPC_CHANNELS.messageActionsDelete, input, decodeResult),
    pin: (input) => invoke(IPC_CHANNELS.messageActionsPin, input, decodePins),
    listPins: (input) => invoke(IPC_CHANNELS.messageActionsListPins, input, decodePins),
  };
}

function decodeResult(value: unknown): MessageActionResult {
  if (!isMessageActionResult(value)) throw new Error("Invalid message action result.");
  return value;
}

function decodePins(value: unknown): MessagePin[] {
  if (!isMessagePinList(value)) throw new Error("Invalid pin list.");
  return value;
}
