// COSGRAL W3: Mobile Connect (parity row 42). The computer shows a QR code with its address and a one-time ticket
// that lives a few minutes; the phone sends the ticket, the person approves the pairing on a confirm card in Needs
// you, and the phone gets its own device token (shown to the phone once, kept only as a hash). With that token the
// phone reads the agents and what needs the person. Removing a device takes its token away at once.
//
// Transport: plain HTTP on this computer, loopback by default; the local network only when the person turns it on.
// It is NOT encrypted: use a trusted network or a tunnel (VPN). Chat and answers from the phone come later (rows 43–44).

import { isPendingAgentRequestKind, type PendingAgentRequestKind } from "./ipc-attention";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const MOBILE_PROTOCOL_VERSION = 1;

/** "loopback": this computer only (for a tunnel or USB forwarding); "lan": also the local network. */
export const MOBILE_EXPOSURES = ["loopback", "lan"] as const;
export type MobileExposure = (typeof MOBILE_EXPOSURES)[number];

export const MOBILE_DEFAULT_PORT = 47_930;

export const MOBILE_LIMITS = {
  /** A ticket lives this long. */
  ticketTtlMs: 5 * 60_000,
  /** Wrong tickets before the pairing closes (a new QR code is needed). */
  ticketAttempts: 5,
  /** Failed requests per address and minute before it gets 429. */
  failuresPerMinute: 10,
  deviceName: 64,
  platform: 32,
  devices: 20,
  /** Request body of the phone API. */
  bodyBytes: 4_096,
  needsYouTitle: 160,
} as const;

/** Paths of the phone API (JSON; `Authorization: Bearer <device token>` except for pairing). */
export const MOBILE_API_PATHS = {
  pair: "/v1/pair",
  me: "/v1/me",
  agents: "/v1/agents",
  needsYou: "/v1/needs-you",
} as const;

export const MOBILE_TRANSPORT_WARNING =
  "Traffic between the phone and this computer is not encrypted. Use it only on a network you trust, or through a tunnel such as a VPN.";

const TICKET = /^[A-Za-z0-9_-]{22,64}$/;

export interface MobileDevice {
  id: string;
  name: string;
  /** What the phone said it is, e.g. "android" or "ios". */
  platform: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
  lastAddress: string | null;
}

export interface MobilePairing {
  expiresAt: string;
  attemptsLeft: number;
  /** A phone sent the ticket and the confirm card waits for the person. */
  consentPending: boolean;
}

export interface MobileState {
  /** The phone server is listening. */
  enabled: boolean;
  exposure: MobileExposure;
  port: number | null;
  /** Addresses a phone can use (loopback always; local network addresses with "lan"). */
  urls: string[];
  /** Always true in this version: show MOBILE_TRANSPORT_WARNING. */
  unencrypted: true;
  pairing: MobilePairing | null;
  devices: MobileDevice[];
  unavailableReason: string | null;
}

export interface StartMobilePairingInput {
  /** Saved choice when omitted ("loopback" at first). */
  exposure?: MobileExposure;
  port?: number;
}

export interface MobilePairingTicket {
  /** The ticket alone, for typing or pasting on the phone. */
  ticket: string;
  /** The text inside the QR code (see `parseMobilePairingPayload`). */
  qrPayload: string;
  qrSvg: string;
  /** `data:image/svg+xml;base64,…` of `qrSvg`, for an <img>. */
  qrDataUrl: string;
  urls: string[];
  expiresAt: string;
  state: MobileState;
}

export interface MobileDeviceIdInput {
  deviceId: string;
}

/** POST MOBILE_API_PATHS.pair: answered after the person decides on the card (or the ticket ends). */
export interface MobilePairRequest {
  ticket: string;
  deviceName: string;
  platform?: string;
}

export interface MobilePairResponse {
  protocol: number;
  deviceId: string;
  /** The device token; this is the only time it is shown. */
  token: string;
}

export interface MobileAgentSummary {
  id: string;
  name: string;
  role: string;
  avatarHue: number | null;
  model: string;
}

/** One card that waits for the person, in short (answering from the phone comes with row 43). */
export interface MobileNeedsYouItem {
  id: string;
  botId: string;
  kind: PendingAgentRequestKind;
  title: string;
  createdAt: string | null;
}

/** The QR text: `cosgral://pair?v=1&t=<ticket>&u=<address>&u=<address>…`. */
export function buildMobilePairingPayload(input: { ticket: string; urls: string[] }): string {
  const parts = [
    `v=${MOBILE_PROTOCOL_VERSION}`,
    `t=${input.ticket}`,
    ...input.urls.map((url) => `u=${encodeURIComponent(url)}`),
  ];
  return `cosgral://pair?${parts.join("&")}`;
}

/** What the phone reads from the QR text; throws when it is not a valid pairing code. */
export function parseMobilePairingPayload(text: string): { protocol: number; ticket: string; urls: string[] } {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    throw new Error("This is not a COSGRAL pairing code.");
  }
  if (url.protocol !== "cosgral:" || url.hostname !== "pair") throw new Error("This is not a COSGRAL pairing code.");
  const protocol = Number(url.searchParams.get("v"));
  if (!Number.isInteger(protocol) || protocol < 1) throw new Error("The pairing code has no version.");
  const ticket = url.searchParams.get("t") ?? "";
  if (!TICKET.test(ticket)) throw new Error("The pairing code has no valid ticket.");
  const urls = url.searchParams.getAll("u");
  if (!urls.length) throw new Error("The pairing code has no address.");
  for (const address of urls) {
    let parsed: URL;
    try {
      parsed = new URL(address);
    } catch {
      throw new Error("The pairing code has an invalid address.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("The pairing code has an invalid address.");
    }
  }
  return { protocol, ticket, urls };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isMobileDevice(value: unknown): value is MobileDevice {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNullableString(value.platform) &&
    isString(value.pairedAt) &&
    isNullableString(value.lastSeenAt) &&
    isNullableString(value.lastAddress)
  );
}

export function isMobileState(value: unknown): value is MobileState {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.enabled) &&
    isOneOf(MOBILE_EXPOSURES, value.exposure) &&
    (value.port === null || isNumber(value.port)) &&
    Array.isArray(value.urls) &&
    value.urls.every(isString) &&
    value.unencrypted === true &&
    (value.pairing === null ||
      (isDynamicRecord(value.pairing) &&
        isString(value.pairing.expiresAt) &&
        isNumber(value.pairing.attemptsLeft) &&
        isBoolean(value.pairing.consentPending))) &&
    Array.isArray(value.devices) &&
    value.devices.every(isMobileDevice) &&
    isNullableString(value.unavailableReason)
  );
}

export function isMobilePairingTicket(value: unknown): value is MobilePairingTicket {
  return (
    isDynamicRecord(value) &&
    isString(value.ticket) &&
    isString(value.qrPayload) &&
    isString(value.qrSvg) &&
    isString(value.qrDataUrl) &&
    value.qrDataUrl.startsWith("data:image/svg+xml;base64,") &&
    Array.isArray(value.urls) &&
    value.urls.every(isString) &&
    isString(value.expiresAt) &&
    isMobileState(value.state)
  );
}

export function isMobileAgentSummary(value: unknown): value is MobileAgentSummary {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.role) &&
    (value.avatarHue === null || isNumber(value.avatarHue)) &&
    isString(value.model)
  );
}

export function isMobileNeedsYouItem(value: unknown): value is MobileNeedsYouItem {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.botId) &&
    isPendingAgentRequestKind(value.kind) &&
    isString(value.title) &&
    isNullableString(value.createdAt)
  );
}

/**
 * COSGRAL W3: the window API (`window.openbot.mobile`). This computer only. Changes come as `mobile-changed`; a new
 * device as `mobile-pairing-completed`. The pairing consent is a confirm card in Needs you.
 */
export interface MobileDesktopApi {
  getState: () => Promise<MobileState>;
  /** Starts the phone server when needed and makes a new ticket (the previous one stops working). */
  startPairing: (input?: StartMobilePairingInput) => Promise<MobilePairingTicket>;
  cancelPairing: () => Promise<MobileState>;
  /** Stops the phone server; paired devices stay but cannot connect until it runs again. */
  disable: () => Promise<MobileState>;
  listDevices: () => Promise<MobileDevice[]>;
  /** Takes the device's token away at once. */
  revokeDevice: (input: MobileDeviceIdInput) => Promise<MobileState>;
}
