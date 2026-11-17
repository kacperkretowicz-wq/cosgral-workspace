// COSGRAL W10-KK2: the window API of the messenger bridge (Telegram). Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isMessengerList,
  isMessengerStatus,
  type MessengerList,
  type MessengerStatus,
  type MessengersDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createMessengersApi(invoke: Invoke): MessengersDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.messengersList, null, decodeList),
    status: (input) => invoke(IPC_CHANNELS.messengersStatus, input, decodeStatus),
    connect: (input) => invoke(IPC_CHANNELS.messengersConnect, input, decodeStatus),
    disconnect: (input) => invoke(IPC_CHANNELS.messengersDisconnect, input, decodeList),
    allowChat: (input) => invoke(IPC_CHANNELS.messengersAllowChat, input, decodeList),
    removeChat: (input) => invoke(IPC_CHANNELS.messengersRemoveChat, input, decodeList),
  };
}

function decodeList(value: unknown): MessengerList {
  if (!isMessengerList(value)) throw new Error("Invalid messenger list.");
  return value;
}

function decodeStatus(value: unknown): MessengerStatus {
  if (!isMessengerStatus(value)) throw new Error("Invalid messenger status.");
  return value;
}
