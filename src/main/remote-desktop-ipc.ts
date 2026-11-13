// COSGRAL W3: remote desktop in the main process: the host (this computer shared to others) and the client (this
// computer looking at another one), their IPC, and the pictures to the main window. Both act on this computer only,
// whatever server the window shows, and only the trusted window can call them: the Stop button is out of the
// reach of a viewer.

import { hostname } from "node:os";
import { join } from "node:path";
import {
  type AgentEvent,
  type DraftPreviewResolution,
  IPC_CHANNELS,
  type RemoteDesktopFrame,
} from "@openbot/contracts/ipc";
import type { ComputerDriver } from "../backend/computer-driver";
import { loadClientIdentity, RemoteDesktopClient } from "../backend/remote-desktop-client";
import { type ConsentRequest, type FrameSource, RemoteDesktopHost } from "../backend/remote-desktop-host";
import { type RemoteDesktopSecretBox, RemoteDesktopStore } from "../backend/remote-desktop-store";
import { parseAgentRequest } from "./ipc/agent-inputs";
import {
  parseConnectRemoteDesktop,
  parseEnableRemoteDesktop,
  parseRemoteDesktopInput,
  parseRemoteDesktopPeer,
  parseSetRemoteDesktopPeerPolicy,
  parseSetRemoteDesktopSessionMode,
  parseStopRemoteDesktop,
} from "./ipc/remote-desktop-inputs";
import { handleTrusted } from "./trusted-ipc";

export interface RemoteDesktopRuntime {
  host: RemoteDesktopHost;
  client: RemoteDesktopClient;
}

export interface RemoteDesktopRuntimeOptions {
  userDataPath: string;
  secretBox: RemoteDesktopSecretBox;
  /** The host's own Windows driver (not the one of Computer Use); null when this computer cannot be controlled. */
  driver: ComputerDriver | null;
  frames: FrameSource;
  /** The consent card of a new viewer; rejects when no card can be shown. */
  confirm: (botId: string | null, request: ConsentRequest) => Promise<DraftPreviewResolution>;
  /** True when an agent exists to carry the consent card. */
  canAsk: () => boolean;
  /** Events for every window (state changes). */
  emit: (event: AgentEvent) => void;
  /** The picture for the window that shows the other computer. */
  sendFrame: (frame: RemoteDesktopFrame) => void;
  platform?: NodeJS.Platform;
}

export function createRemoteDesktop(options: RemoteDesktopRuntimeOptions): RemoteDesktopRuntime {
  const store = new RemoteDesktopStore({
    filePath: join(options.userDataPath, "remote-desktop.json"),
    secretBox: options.secretBox,
  });
  const host = new RemoteDesktopHost({
    store,
    driver: () => options.driver,
    frames: options.frames,
    confirm: options.confirm,
    canAsk: options.canAsk,
    unavailableReason: () => {
      if ((options.platform ?? process.platform) !== "win32") return "Remote desktop works on Windows in this version.";
      if (!options.driver) return "This computer cannot be controlled: the Windows driver is missing.";
      const driverReason = options.driver.unavailableReason();
      if (driverReason) return driverReason;
      return store.canEncrypt() ? null : "This computer cannot encrypt secrets, so remote desktop stays off.";
    },
    emit: (state) => options.emit({ type: "remote-desktop-host-changed", state }),
  });
  const client = new RemoteDesktopClient({
    identity: loadClientIdentity(join(options.userDataPath, "remote-desktop-client.json"), hostname()),
    emit: (state) => options.emit({ type: "remote-desktop-client-changed", state }),
    onFrame: options.sendFrame,
  });
  return { host, client };
}

/** Program shutdown: end every session and leave the host. */
export async function closeRemoteDesktop(runtime: RemoteDesktopRuntime | null): Promise<void> {
  if (!runtime) return;
  runtime.client.disconnect();
  await runtime.host.close();
}

export function registerRemoteDesktopIpc(runtime: () => RemoteDesktopRuntime | null): void {
  const current = (): RemoteDesktopRuntime => {
    const value = runtime();
    if (!value) throw new Error("Remote desktop is not ready yet.");
    return value;
  };
  const payload = (input: unknown) => parseAgentRequest(input).payload;
  handleTrusted(IPC_CHANNELS.remoteDesktopGetHostState, () => current().host.getState());
  handleTrusted(IPC_CHANNELS.remoteDesktopEnable, (input: unknown) =>
    current().host.enable(parseEnableRemoteDesktop(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.remoteDesktopDisable, () => current().host.disable());
  handleTrusted(IPC_CHANNELS.remoteDesktopRegenerateToken, () => current().host.regenerateToken());
  handleTrusted(IPC_CHANNELS.remoteDesktopSetPeerPolicy, (input: unknown) => {
    const { peerId, policy } = parseSetRemoteDesktopPeerPolicy(payload(input));
    return current().host.setPeerPolicy(peerId, policy);
  });
  handleTrusted(IPC_CHANNELS.remoteDesktopRemovePeer, (input: unknown) =>
    current().host.removePeer(parseRemoteDesktopPeer(payload(input)).peerId),
  );
  handleTrusted(IPC_CHANNELS.remoteDesktopSetSessionMode, (input: unknown) => {
    const { sessionId, mode } = parseSetRemoteDesktopSessionMode(payload(input));
    return current().host.setSessionMode(sessionId, mode);
  });
  handleTrusted(IPC_CHANNELS.remoteDesktopStop, (input: unknown) =>
    current().host.stop(parseStopRemoteDesktop(payload(input)).sessionId),
  );
  handleTrusted(IPC_CHANNELS.remoteDesktopGetClientState, () => current().client.getState());
  handleTrusted(IPC_CHANNELS.remoteDesktopConnect, (input: unknown) =>
    current().client.connect(parseConnectRemoteDesktop(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.remoteDesktopDisconnect, () => current().client.disconnect());
  handleTrusted(IPC_CHANNELS.remoteDesktopSendInput, (input: unknown) => {
    current().client.sendInput(parseRemoteDesktopInput(payload(input)));
  });
}
