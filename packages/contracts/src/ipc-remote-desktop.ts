// COSGRAL W3: remote desktop between two Windows computers running COSGRAL Workspace (parity row 33).
//
// One computer is the HOST: its owner turns sharing on, gets a token (shown once) and decides who may connect. The
// other computer is the CLIENT: it connects with the host address and the token, sees the host's screen and, when the
// owner allows it, clicks, scrolls and types there. It is our own protocol over a WebSocket with a token; there is no
// VNC or RDP and no OpenBot account. Reach the host through loopback, the local network, or a tunnel the person sets up
// (for example a VPN). The protocol is not encrypted: do not expose the port to the internet without a tunnel.
//
// Safety rules (see docs/cosgral-raporty/kk-w3-remote-desktop.md):
// - The token never travels: the client proves it knows it with an HMAC over a nonce chosen by the host, so no clock
//   is involved. The host proves itself the same way.
// - A valid token is not enough. A new viewer needs the owner's answer on a confirm card in Needs you. The owner can
//   remember a viewer ("allow") or block it. Only one viewer at a time.
// - Remote desktop and Computer Use are separate: the permission for one never switches on the other.
// - Stop is only local. It ends every session at once and the viewer cannot reach it: remote input never touches
//   windows of COSGRAL Workspace itself, the locked screen, a UAC prompt, or windows that run as administrator.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

/** Every limit of remote desktop in one place. */
export const REMOTE_DESKTOP_LIMITS = {
  protocolVersion: 1,
  /** The token has this many random bytes (shown as 32 URL-safe characters). */
  tokenBytes: 24,
  /** One viewer at a time. */
  maxSessions: 1,
  maxPeers: 20,
  labelLength: 60,
  /** The long side of a frame in pixels, and the frame rate the host aims for. */
  frameMaxDimension: 1280,
  framesPerSecond: 5,
  jpegQuality: 60,
  maxFrameBytes: 1_500_000,
  /** Largest text message a peer may send. */
  maxMessageBytes: 4096,
  typeTextLength: 500,
  keysPerCombination: 4,
  scrollSteps: 20,
  inputsPerSecond: 40,
  /** Liveness without any clock: the host pings, the peer must answer. */
  pingIntervalMs: 5000,
  pongTimeoutMs: 15_000,
  authTimeoutMs: 10_000,
  /** How long the owner has to answer the consent card. */
  consentTimeoutMs: 60_000,
  /** Wrong tokens from one address before it is locked out. */
  authFailuresBeforeLock: 5,
  lockMs: 60_000,
} as const;

export const REMOTE_DESKTOP_MODES = ["view", "control"] as const;
/** "view": the picture only. "control": the picture, mouse and keyboard. */
export type RemoteDesktopMode = (typeof REMOTE_DESKTOP_MODES)[number];

/** How the host listens. "loopback": this computer only (also for a tunnel). "lan": the local network too. */
export const REMOTE_DESKTOP_EXPOSURES = ["loopback", "lan"] as const;
export type RemoteDesktopExposure = (typeof REMOTE_DESKTOP_EXPOSURES)[number];

/** What the host does with a viewer it has seen before. "ask": a consent card every time. */
export const REMOTE_DESKTOP_PEER_POLICIES = ["ask", "allow", "block"] as const;
export type RemoteDesktopPeerPolicy = (typeof REMOTE_DESKTOP_PEER_POLICIES)[number];

/** A viewer the host has seen. `id` is the random id the viewer's program keeps. */
export interface RemoteDesktopPeer {
  id: string;
  label: string;
  policy: RemoteDesktopPeerPolicy;
  addedAt: string;
  lastSeenAt: string | null;
}

/** A viewer that is connected to this host right now. */
export interface RemoteDesktopHostSession {
  id: string;
  peerId: string;
  label: string;
  /** Network address of the viewer. */
  remoteAddress: string;
  mode: RemoteDesktopMode;
  startedAt: string;
  framesSent: number;
  lastInputAt: string | null;
  /** Why the picture is paused ("locked", "uac"), or null. */
  paused: string | null;
}

export interface RemoteDesktopListening {
  port: number;
  exposure: RemoteDesktopExposure;
  /** Addresses a viewer can try, for example "ws://127.0.0.1:47123". */
  urls: string[];
}

export interface RemoteDesktopHostState {
  /** False when this computer cannot host (not Windows, no driver, no encryption); `unavailableReason` says why. */
  available: boolean;
  unavailableReason: string | null;
  enabled: boolean;
  listening: RemoteDesktopListening | null;
  /** When the token was made; the token itself is shown only once, by `enable` and `regenerateToken`. */
  tokenCreatedAt: string | null;
  /** The agent whose row shows the consent card in Needs you (the cards belong to agents); null: the first agent. */
  approvalBotId: string | null;
  peers: RemoteDesktopPeer[];
  sessions: RemoteDesktopHostSession[];
  /** Consent cards that wait for the owner. */
  consentPending: number;
  /** Set while connections are refused after too many wrong tokens. */
  lockedUntil: string | null;
}

export const REMOTE_DESKTOP_CLIENT_PHASES = ["idle", "connecting", "waiting-for-owner", "connected", "failed"] as const;
export type RemoteDesktopClientPhase = (typeof REMOTE_DESKTOP_CLIENT_PHASES)[number];

export interface RemoteDesktopClientState {
  phase: RemoteDesktopClientPhase;
  /** The host address of the current or last connection. */
  address: string | null;
  /** Granted by the owner; null when not connected. */
  mode: RemoteDesktopMode | null;
  /** Size of the host's picture in frame pixels; null before the first frame. */
  screen: { width: number; height: number } | null;
  framesReceived: number;
  /** Why the connection failed or ended; null otherwise. */
  error: string | null;
  /** The id this program shows to hosts (a host lists viewers by it). */
  clientId: string;
}

export interface EnableRemoteDesktopInput {
  exposure?: RemoteDesktopExposure;
  /** 0 or omitted: a free port (the last one when it is free). */
  port?: number;
  approvalBotId?: string | null;
}

/** The token appears here once and is never stored in readable form. */
export interface RemoteDesktopTokenResult {
  state: RemoteDesktopHostState;
  token: string;
}

export interface SetRemoteDesktopPeerPolicyInput {
  peerId: string;
  policy: RemoteDesktopPeerPolicy;
}

export interface RemoteDesktopPeerInput {
  peerId: string;
}

export interface SetRemoteDesktopSessionModeInput {
  sessionId: string;
  mode: RemoteDesktopMode;
}

/** With `sessionId`: end that session. Without: end every session. Always works, also without answers from the viewer. */
export interface StopRemoteDesktopInput {
  sessionId?: string;
}

export interface ConnectRemoteDesktopInput {
  /** "ws://192.168.1.20:47123", "192.168.1.20:47123" or "localhost:47123". */
  address: string;
  token: string;
  mode: RemoteDesktopMode;
  /** The name the host's owner sees on the consent card; this computer's name when omitted. */
  label?: string;
}

export interface RemoteDesktopInputBase {
  /** Position on the picture, 0 to 1 from the top left corner (resolution independent). */
  x: number;
  y: number;
}

export type RemoteDesktopInput =
  | (RemoteDesktopInputBase & { type: "click"; button: "left" | "right" | "middle"; count: 1 | 2 })
  | (RemoteDesktopInputBase & { type: "scroll"; deltaX: number; deltaY: number })
  | { type: "text"; text: string }
  /** Keys like "ctrl+s"; the same keys and blocked combinations as Computer Use. */
  | { type: "keys"; keys: string };

export const REMOTE_DESKTOP_INPUT_TYPES = ["click", "scroll", "text", "keys"] as const;

/** One picture of the host's screen, in the order of `seq`. */
export interface RemoteDesktopFrame {
  seq: number;
  width: number;
  height: number;
  /** JPEG, base64. */
  jpegBase64: string;
}

export function emptyRemoteDesktopHostState(): RemoteDesktopHostState {
  return {
    available: false,
    unavailableReason: null,
    enabled: false,
    listening: null,
    tokenCreatedAt: null,
    approvalBotId: null,
    peers: [],
    sessions: [],
    consentPending: 0,
    lockedUntil: null,
  };
}

export function emptyRemoteDesktopClientState(clientId = ""): RemoteDesktopClientState {
  return { phase: "idle", address: null, mode: null, screen: null, framesReceived: 0, error: null, clientId };
}

function isFraction(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isWholeNumber(value: unknown, min: number, max: number): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= min && value <= max;
}

/** Checks a message from a viewer before the host acts on it. */
export function isRemoteDesktopInput(value: unknown): value is RemoteDesktopInput {
  if (!isDynamicRecord(value) || !isOneOf(REMOTE_DESKTOP_INPUT_TYPES, value.type)) return false;
  switch (value.type) {
    case "click":
      return (
        isFraction(value.x) &&
        isFraction(value.y) &&
        isOneOf(["left", "right", "middle"], value.button) &&
        (value.count === 1 || value.count === 2)
      );
    case "scroll": {
      const steps = REMOTE_DESKTOP_LIMITS.scrollSteps;
      return (
        isFraction(value.x) &&
        isFraction(value.y) &&
        isWholeNumber(value.deltaX, -steps, steps) &&
        isWholeNumber(value.deltaY, -steps, steps)
      );
    }
    case "text":
      return isString(value.text) && value.text.length > 0 && value.text.length <= REMOTE_DESKTOP_LIMITS.typeTextLength;
    case "keys":
      return isString(value.keys) && value.keys.length > 0 && value.keys.length <= 64;
    default:
      return false;
  }
}

function isPeer(value: unknown): value is RemoteDesktopPeer {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isOneOf(REMOTE_DESKTOP_PEER_POLICIES, value.policy) &&
    isString(value.addedAt) &&
    (value.lastSeenAt === null || isString(value.lastSeenAt))
  );
}

function isHostSession(value: unknown): value is RemoteDesktopHostSession {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.peerId) &&
    isString(value.label) &&
    isString(value.remoteAddress) &&
    isOneOf(REMOTE_DESKTOP_MODES, value.mode) &&
    isString(value.startedAt) &&
    isNumber(value.framesSent) &&
    (value.lastInputAt === null || isString(value.lastInputAt)) &&
    (value.paused === null || isString(value.paused))
  );
}

function isListening(value: unknown): value is RemoteDesktopListening {
  return (
    isDynamicRecord(value) &&
    isNumber(value.port) &&
    isOneOf(REMOTE_DESKTOP_EXPOSURES, value.exposure) &&
    Array.isArray(value.urls) &&
    value.urls.every(isString)
  );
}

export function isRemoteDesktopHostState(value: unknown): value is RemoteDesktopHostState {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.available) &&
    (value.unavailableReason === null || isString(value.unavailableReason)) &&
    isBoolean(value.enabled) &&
    (value.listening === null || isListening(value.listening)) &&
    (value.tokenCreatedAt === null || isString(value.tokenCreatedAt)) &&
    (value.approvalBotId === null || isString(value.approvalBotId)) &&
    Array.isArray(value.peers) &&
    value.peers.every(isPeer) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isHostSession) &&
    isNumber(value.consentPending) &&
    (value.lockedUntil === null || isString(value.lockedUntil))
  );
}

export function isRemoteDesktopClientState(value: unknown): value is RemoteDesktopClientState {
  return (
    isDynamicRecord(value) &&
    isOneOf(REMOTE_DESKTOP_CLIENT_PHASES, value.phase) &&
    (value.address === null || isString(value.address)) &&
    (value.mode === null || isOneOf(REMOTE_DESKTOP_MODES, value.mode)) &&
    (value.screen === null ||
      (isDynamicRecord(value.screen) && isNumber(value.screen.width) && isNumber(value.screen.height))) &&
    isNumber(value.framesReceived) &&
    (value.error === null || isString(value.error)) &&
    isString(value.clientId)
  );
}

export function isRemoteDesktopTokenResult(value: unknown): value is RemoteDesktopTokenResult {
  return isDynamicRecord(value) && isRemoteDesktopHostState(value.state) && isString(value.token);
}

export function isRemoteDesktopFrame(value: unknown): value is RemoteDesktopFrame {
  return (
    isDynamicRecord(value) &&
    isNumber(value.seq) &&
    isNumber(value.width) &&
    isNumber(value.height) &&
    isString(value.jpegBase64)
  );
}
