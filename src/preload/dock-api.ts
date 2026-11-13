// COSGRAL W3: the window API of the agent dock and the Dynamic Island.

import {
  type DockDesktopApi,
  type DockState,
  IPC_CHANNELS,
  type IslandDesktopApi,
  type IslandState,
  isDockState,
  isIslandState,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createDockApi(invoke: Invoke): DockDesktopApi {
  return {
    getState: () => invoke(IPC_CHANNELS.dockGetState, null, decodeDock),
    pin: (input) => invoke(IPC_CHANNELS.dockPin, input, decodeDock),
    unpin: (input) => invoke(IPC_CHANNELS.dockUnpin, input, decodeDock),
    reorder: (input) => invoke(IPC_CHANNELS.dockReorder, input, decodeDock),
    setPinHidden: (input) => invoke(IPC_CHANNELS.dockSetPinHidden, input, decodeDock),
    setSize: (input) => invoke(IPC_CHANNELS.dockSetSize, input, decodeDock),
    setVisible: (input) => invoke(IPC_CHANNELS.dockSetVisible, input, decodeDock),
    openChat: (input) => invoke(IPC_CHANNELS.dockOpenChat, input, decodeDock),
    showMainWindow: (input) => invoke(IPC_CHANNELS.dockShowMainWindow, input ?? null, () => undefined),
  };
}

export function createIslandApi(invoke: Invoke): IslandDesktopApi {
  return {
    getState: () => invoke(IPC_CHANNELS.islandGetState, null, decodeIsland),
    setEnabled: (input) => invoke(IPC_CHANNELS.islandSetEnabled, input, decodeIsland),
    activate: () => invoke(IPC_CHANNELS.islandActivate, null, decodeIsland),
    dismiss: () => invoke(IPC_CHANNELS.islandDismiss, null, decodeIsland),
  };
}

function decodeDock(value: unknown): DockState {
  if (!isDockState(value)) throw new Error("Invalid dock state response.");
  return value;
}

function decodeIsland(value: unknown): IslandState {
  if (!isIslandState(value)) throw new Error("Invalid island state response.");
  return value;
}
