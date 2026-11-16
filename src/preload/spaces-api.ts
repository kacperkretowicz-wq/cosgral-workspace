// COSGRAL W8-KK1: the window API of the client spaces. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isSpaceDescription,
  isSpaceList,
  type SpaceDescription,
  type SpaceList,
  type SpacesDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createSpacesApi(invoke: Invoke): SpacesDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.spacesList, null, decodeList),
    create: (input) => invoke(IPC_CHANNELS.spacesCreate, input, decodeList),
    rename: (input) => invoke(IPC_CHANNELS.spacesRename, input, decodeList),
    archive: (input) => invoke(IPC_CHANNELS.spacesArchive, input, decodeList),
    restore: (input) => invoke(IPC_CHANNELS.spacesRestore, input, decodeList),
    delete: (input) => invoke(IPC_CHANNELS.spacesDelete, input, decodeList),
    switch: (input) => invoke(IPC_CHANNELS.spacesSwitch, input, decodeList),
    describe: (input) => invoke(IPC_CHANNELS.spacesDescribe, input, decodeDescription),
  };
}

function decodeList(value: unknown): SpaceList {
  if (!isSpaceList(value)) throw new Error("Invalid space list.");
  return value;
}

function decodeDescription(value: unknown): SpaceDescription {
  if (!isSpaceDescription(value)) throw new Error("Invalid space description.");
  return value;
}
