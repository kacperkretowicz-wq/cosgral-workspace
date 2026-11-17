// COSGRAL W12-KK: remote desktop (host and client) for Storybook and the preview. DEMO only: no socket, no screen, no input. The same
// rules as the program: the token appears once (never in a state), a new viewer or one with policy "ask" waits for the owner's card
// (so does an allowed one when "ask on this computer" is on), one viewer at a time, a blocked viewer is refused without a card, "control"
// goes down to "view" at once and never back, Stop ends everything. `simulate` plays a viewer arriving and the owner answering.

import {
  type AgentEvent,
  emptyRemoteDesktopClientState,
  emptyRemoteDesktopHostState,
  type RemoteDesktopClientState,
  type RemoteDesktopDesktopApi,
  type RemoteDesktopFrame,
  type RemoteDesktopHostSession,
  type RemoteDesktopHostState,
  type RemoteDesktopMode,
  type RemoteDesktopPeer,
} from "@openbot/contracts/ipc";

export type MockViewerResult = "waiting" | "connected" | "blocked" | "busy" | "off";

export interface MockRemoteDesktop extends Required<RemoteDesktopDesktopApi> {
  simulate: {
    /** A viewer with the right token arrives. */
    viewerConnects: (input: { peerId: string; label: string; mode?: RemoteDesktopMode }) => MockViewerResult;
    /** The owner answers the card that waits ("send" lets the viewer in). */
    ownerAnswers: (decision: "send" | "decline") => void;
    /** This computer cannot host (another system, no driver); null makes it available again. */
    unavailable: (reason: string | null) => void;
    /** A picture arrives for the client (it is a 1x1 demo image). */
    frame: () => void;
  };
}

const DEMO_JPEG =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

export function createMockRemoteDesktop(emit: (event: AgentEvent) => void): MockRemoteDesktop {
  let clock = Date.parse("2026-11-17T10:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  let host: RemoteDesktopHostState = { ...emptyRemoteDesktopHostState(), available: true };
  let client: RemoteDesktopClientState = emptyRemoteDesktopClientState("demo-client-0001");
  let pending: { peerId: string; label: string; mode: RemoteDesktopMode } | null = null;
  let tokenCounter = 0;
  let sequence = 0;
  const listeners = new Set<(frame: RemoteDesktopFrame) => void>();

  const publishHost = () => {
    emit({ type: "remote-desktop-host-changed", state: structuredClone(host) });
    return structuredClone(host);
  };
  const publishClient = () => {
    emit({ type: "remote-desktop-client-changed", state: structuredClone(client) });
    return structuredClone(client);
  };
  const peer = (peerId: string) => host.peers.find((candidate) => candidate.id === peerId);
  const touch = (peerId: string, label: string): RemoteDesktopPeer => {
    const existing = peer(peerId);
    if (existing) {
      existing.lastSeenAt = now();
      return existing;
    }
    const created: RemoteDesktopPeer = { id: peerId, label, policy: "ask", addedAt: now(), lastSeenAt: now() };
    host.peers = [...host.peers, created];
    return created;
  };
  const start = (peerId: string, label: string, mode: RemoteDesktopMode) => {
    const session: RemoteDesktopHostSession = {
      id: `session-${++sequence}`,
      peerId,
      label,
      remoteAddress: "127.0.0.1",
      mode,
      startedAt: now(),
      framesSent: 0,
      lastInputAt: null,
      paused: null,
    };
    host.sessions = [session];
    host.consentPending = 0;
    pending = null;
  };

  const hostApi: RemoteDesktopDesktopApi["host"] = {
    getState: async () => structuredClone(host),
    enable: async (input) => {
      if (!host.available) throw new Error(host.unavailableReason ?? "This computer cannot host.");
      tokenCounter += 1;
      const exposure = input?.exposure ?? "loopback";
      host = {
        ...host,
        enabled: true,
        listening: { port: 47_123, exposure, urls: ["ws://127.0.0.1:47123"] },
        tokenCreatedAt: now(),
        approvalBotId: input?.approvalBotId ?? host.approvalBotId,
      };
      const state = publishHost();
      return { state, token: `demo-token-${String(tokenCounter).padStart(4, "0")}-abcdefghijklmnop` };
    },
    disable: async () => {
      host = { ...host, enabled: false, listening: null, sessions: [], consentPending: 0 };
      pending = null;
      return publishHost();
    },
    regenerateToken: async () => {
      if (!host.enabled) throw new Error("Remote desktop is off.");
      tokenCounter += 1;
      host = { ...host, tokenCreatedAt: now() };
      return { state: publishHost(), token: `demo-token-${String(tokenCounter).padStart(4, "0")}-abcdefghijklmnop` };
    },
    setPeerPolicy: async (input) => {
      const found = peer(input.peerId);
      if (!found) throw new Error("This computer is not on the list.");
      found.policy = input.policy;
      if (input.policy === "block") host.sessions = host.sessions.filter((session) => session.peerId !== input.peerId);
      return publishHost();
    },
    setAskEverySession: async (input) => {
      host = { ...host, askEverySession: input.enabled };
      return publishHost();
    },
    removePeer: async (input) => {
      host.peers = host.peers.filter((candidate) => candidate.id !== input.peerId);
      host.sessions = host.sessions.filter((session) => session.peerId !== input.peerId);
      return publishHost();
    },
    setSessionMode: async (input) => {
      const session = host.sessions.find((candidate) => candidate.id === input.sessionId);
      if (!session) throw new Error("That session is not open.");
      if (session.mode === "view" && input.mode === "control")
        throw new Error("The viewer has to ask again to control.");
      session.mode = input.mode;
      return publishHost();
    },
    stop: async (input) => {
      host.sessions = input?.sessionId ? host.sessions.filter((session) => session.id !== input.sessionId) : [];
      return publishHost();
    },
  };

  const clientApi: RemoteDesktopDesktopApi["client"] = {
    getState: async () => structuredClone(client),
    connect: async (input) => {
      client = { ...client, phase: "connecting", address: input.address, error: null, mode: null };
      publishClient();
      if (!input.token || input.token.length < 8) {
        client = { ...client, phase: "failed", error: "The token is wrong." };
        return publishClient();
      }
      client = { ...client, phase: "connected", mode: input.mode, screen: { width: 1280, height: 720 } };
      return publishClient();
    },
    disconnect: async () => {
      client = { ...client, phase: "idle", mode: null, screen: null, error: null };
      return publishClient();
    },
    sendInput: async () => {
      if (client.mode !== "control") throw new Error("This connection only looks; it cannot control.");
    },
  };

  return {
    host: hostApi,
    client: clientApi,
    onFrame: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    simulate: {
      viewerConnects: ({ peerId, label, mode = "view" }) => {
        if (!host.enabled) return "off";
        const known = peer(peerId);
        if (known?.policy === "block") return "blocked";
        if (host.sessions.length > 0 || host.consentPending > 0) return "busy";
        const current = touch(peerId, label);
        if (current.policy === "allow" && !host.askEverySession) {
          start(peerId, label, mode);
          publishHost();
          return "connected";
        }
        pending = { peerId, label, mode };
        host.consentPending = 1;
        publishHost();
        return "waiting";
      },
      ownerAnswers: (decision) => {
        if (!pending) return;
        if (decision === "send") start(pending.peerId, pending.label, pending.mode);
        else {
          pending = null;
          host.consentPending = 0;
        }
        publishHost();
      },
      unavailable: (reason) => {
        host = {
          ...host,
          available: reason === null,
          unavailableReason: reason,
          ...(reason === null ? {} : { enabled: false, listening: null, sessions: [] }),
        };
        publishHost();
      },
      frame: () => {
        sequence += 1;
        for (const listener of listeners) listener({ seq: sequence, width: 1, height: 1, jpegBase64: DEMO_JPEG });
      },
    },
  };
}
