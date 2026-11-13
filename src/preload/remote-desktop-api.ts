// COSGRAL W3: the window API of remote desktop: this computer as a host, as a viewer, and the pictures it receives.

import {
  IPC_CHANNELS,
  isRemoteDesktopClientState,
  isRemoteDesktopFrame,
  isRemoteDesktopHostState,
  isRemoteDesktopTokenResult,
  type RemoteDesktopClientState,
  type RemoteDesktopDesktopApi,
  type RemoteDesktopFrame,
  type RemoteDesktopHostState,
  type RemoteDesktopTokenResult,
} from "@openbot/contracts/ipc";
import { ipcRenderer } from "electron";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createRemoteDesktopApi(invoke: Invoke): RemoteDesktopDesktopApi {
  return {
    host: {
      getState: () => invoke(IPC_CHANNELS.remoteDesktopGetHostState, null, decodeHost),
      enable: (input) => invoke(IPC_CHANNELS.remoteDesktopEnable, input ?? null, decodeToken),
      disable: () => invoke(IPC_CHANNELS.remoteDesktopDisable, null, decodeHost),
      regenerateToken: () => invoke(IPC_CHANNELS.remoteDesktopRegenerateToken, null, decodeToken),
      setPeerPolicy: (input) => invoke(IPC_CHANNELS.remoteDesktopSetPeerPolicy, input, decodeHost),
      removePeer: (input) => invoke(IPC_CHANNELS.remoteDesktopRemovePeer, input, decodeHost),
      setSessionMode: (input) => invoke(IPC_CHANNELS.remoteDesktopSetSessionMode, input, decodeHost),
      stop: (input) => invoke(IPC_CHANNELS.remoteDesktopStop, input ?? null, decodeHost),
    },
    client: {
      getState: () => invoke(IPC_CHANNELS.remoteDesktopGetClientState, null, decodeClient),
      connect: (input) => invoke(IPC_CHANNELS.remoteDesktopConnect, input, decodeClient),
      disconnect: () => invoke(IPC_CHANNELS.remoteDesktopDisconnect, null, decodeClient),
      sendInput: (input) => invoke(IPC_CHANNELS.remoteDesktopSendInput, input, () => undefined),
    },
    onFrame: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, frame: unknown) => {
        if (isRemoteDesktopFrame(frame)) listener(frame satisfies RemoteDesktopFrame);
      };
      ipcRenderer.on(IPC_CHANNELS.remoteDesktopFrame, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.remoteDesktopFrame, handler);
    },
  };
}

function decodeHost(value: unknown): RemoteDesktopHostState {
  if (!isRemoteDesktopHostState(value)) throw new Error("Invalid remote desktop host state response.");
  return value;
}

function decodeClient(value: unknown): RemoteDesktopClientState {
  if (!isRemoteDesktopClientState(value)) throw new Error("Invalid remote desktop viewer state response.");
  return value;
}

function decodeToken(value: unknown): RemoteDesktopTokenResult {
  if (!isRemoteDesktopTokenResult(value)) throw new Error("Invalid remote desktop token response.");
  return value;
}
