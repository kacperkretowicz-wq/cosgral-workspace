// COSGRAL W3: Mobile Connect (parity row 42). The computer shows a QR code with its address and a one-time ticket
// that lives a few minutes; the phone sends the ticket, the person approves the pairing on a confirm card in Needs
// you, and the phone gets its own device token (shown to the phone once, kept only as a hash). With that token the
// phone reads the agents and what needs the person. Removing a device takes its token away at once.
//
// Transport (COSGRAL W3-BE7): HTTPS with a self-signed certificate made on this computer; its SHA-256 fingerprint is in
// the QR code and the client pins it. Loopback by default; the local network only when the person turns it on, and
// only with TLS. Plain HTTP is left for loopback when this computer cannot keep the certificate key safe (and tests).

import { isPendingAgentRequestKind, type PendingAgentRequestKind } from "./ipc-attention";
import type { AgentApprovalKind, ConversationMessageAuthor } from "./ipc-conversation";
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

/** "tls": HTTPS with the pinned certificate; "plain": HTTP, loopback only. */
export const MOBILE_TRANSPORTS = ["tls", "plain"] as const;
export type MobileTransport = (typeof MOBILE_TRANSPORTS)[number];

/** What TLS with a pinned fingerprint protects, and what it does not (shown with Mobile Connect). */
export const MOBILE_TRANSPORT_WARNING =
  "Traffic between the phone and this computer is encrypted. The computer proves who it is with the certificate fingerprint from the QR code: an app that pins it cannot be fooled by another device on the network. A web browser cannot pin it, so compare the fingerprint the first time it warns about the certificate. Encryption does not help if the phone or this computer is in someone else's hands: remove a lost phone at once.";

/** Plain HTTP (loopback only). */
export const MOBILE_PLAIN_TRANSPORT_WARNING =
  "Traffic between the phone and this computer is not encrypted. It stays on this computer (loopback); use it only through a tunnel you trust, such as a VPN or USB forwarding.";

const TICKET = /^[A-Za-z0-9_-]{22,64}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;

/** "AB:CD:…" (as browsers and Node show it) from 64 hex digits. */
export function formatMobileFingerprint(hex: string): string {
  return (hex.toUpperCase().match(/.{2}/g) ?? []).join(":");
}

/** True when a certificate's SHA-256 (any case, with or without ":") is the pinned one. */
export function mobileFingerprintMatches(pinnedHex: string, presented: string): boolean {
  const clean = presented.replace(/:/g, "").toLowerCase();
  return FINGERPRINT.test(clean) && clean === pinnedHex.toLowerCase();
}

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
  /** "tls": show MOBILE_TRANSPORT_WARNING; "plain": show MOBILE_PLAIN_TRANSPORT_WARNING. */
  transport: MobileTransport;
  /** SHA-256 of the certificate as "AB:CD:…" (show it for comparison), or null without TLS. */
  fingerprint: string | null;
  /** True with plain HTTP. */
  unencrypted: boolean;
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
  /**
   * The text inside the QR code: the web app link with the ticket and fingerprint in its fragment, so a phone camera
   * opens it (see `parseMobilePairingPayload`, which also reads `cosgral://pair`).
   */
  qrPayload: string;
  qrSvg: string;
  /** `data:image/svg+xml;base64,…` of `qrSvg`, for an <img>. */
  qrDataUrl: string;
  urls: string[];
  /** The phone web app (`…/app/`) on the address in the QR code. */
  appUrl: string;
  /** 64 hex digits of the certificate's SHA-256, or null without TLS. */
  fingerprint: string | null;
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
  /** COSGRAL W3 (phone API): "computer" when the phone may only show it; `computerReason` says why. */
  answerOn?: MobileAnswerPlace;
  computerReason?: string | null;
}

function pairingParams(input: { ticket: string; urls: string[]; fingerprint?: string | null }): string {
  return [
    `v=${MOBILE_PROTOCOL_VERSION}`,
    `t=${input.ticket}`,
    ...(input.fingerprint ? [`f=${input.fingerprint}`] : []),
    ...input.urls.map((url) => `u=${encodeURIComponent(url)}`),
  ].join("&");
}

/** The native pairing code: `cosgral://pair?v=1&t=<ticket>&f=<fingerprint>&u=<address>…`. */
export function buildMobilePairingPayload(input: {
  ticket: string;
  urls: string[];
  fingerprint?: string | null;
}): string {
  return `cosgral://pair?${pairingParams(input)}`;
}

/** The web app link: `https://<address>/app/#v=1&t=…`; the fragment never reaches a server. */
export function buildMobileWebPairingUrl(input: {
  appUrl: string;
  ticket: string;
  urls: string[];
  fingerprint?: string | null;
}): string {
  return `${input.appUrl.split("#")[0]}#${pairingParams(input)}`;
}

/** What the phone reads from either pairing code; throws when it is not a valid one. */
export function parseMobilePairingPayload(text: string): {
  protocol: number;
  ticket: string;
  urls: string[];
  fingerprint: string | null;
} {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    throw new Error("This is not a COSGRAL pairing code.");
  }
  let params: URLSearchParams;
  if (url.protocol === "cosgral:" && url.hostname === "pair") params = url.searchParams;
  else if ((url.protocol === "https:" || url.protocol === "http:") && url.hash.length > 1) {
    params = new URLSearchParams(url.hash.slice(1));
  } else throw new Error("This is not a COSGRAL pairing code.");
  const protocol = Number(params.get("v"));
  if (!Number.isInteger(protocol) || protocol < 1) throw new Error("The pairing code has no version.");
  const ticket = params.get("t") ?? "";
  if (!TICKET.test(ticket)) throw new Error("The pairing code has no valid ticket.");
  const fingerprint = params.get("f");
  if (fingerprint !== null && !FINGERPRINT.test(fingerprint)) {
    throw new Error("The pairing code has an invalid certificate fingerprint.");
  }
  const urls = params.getAll("u");
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
  return { protocol, ticket, urls, fingerprint };
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
    isOneOf(MOBILE_TRANSPORTS, value.transport) &&
    isNullableString(value.fingerprint) &&
    isBoolean(value.unencrypted) &&
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
    isString(value.appUrl) &&
    isNullableString(value.fingerprint) &&
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
    isNullableString(value.createdAt) &&
    (value.answerOn === undefined || isOneOf(MOBILE_ANSWER_PLACES, value.answerOn)) &&
    (value.computerReason === undefined || isNullableString(value.computerReason))
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
  /**
   * A new certificate (new fingerprint). Every paired phone pinned the old one, so all of them are removed and must
   * pair again; ask the person first.
   */
  rotateCertificate: () => Promise<MobileState>;
}

// -- Phone API (rows 43–44) --------------------------------------------------------------------------------------
// The same device token and the same limits as pairing. A phone reads and writes the chat with agents, answers the
// cards it may answer, follows a stream of events, and creates or edits agents' profiles. It never changes permissions,
// Computer Use, the Vault, remote desktop, MCP, voice or Mobile Connect itself: those answer 403 "use the computer".

export const MOBILE_PHONE_LIMITS = {
  /** Characters of one message from the phone. */
  messageText: 20_000,
  /** Request body of a message, an answer or an agent profile. */
  messageBodyBytes: 64 * 1024,
  messagesPage: 30,
  messagesPageMax: 100,
  /** Messages, answers and agent changes per device and minute. */
  writesPerMinute: 30,
  streamsPerDevice: 2,
  streams: 20,
  /** Characters of a draft shown on the phone so the person can decide. */
  draftPreview: 4_000,
  /** Characters of a command shown with its approval. */
  command: 500,
  promptAnswers: 8,
  promptAnswerText: 2_000,
  /** A comment line on the stream so connections stay open. */
  heartbeatMs: 25_000,
} as const;

export const MOBILE_PHONE_PATHS = {
  threads: "/v1/threads",
  events: "/v1/events",
  templates: "/v1/templates",
  agents: "/v1/agents",
  needsYou: "/v1/needs-you",
} as const;

export const mobilePhonePath = {
  agent: (botId: string) => `/v1/agents/${encodeURIComponent(botId)}`,
  messages: (botId: string) => `/v1/agents/${encodeURIComponent(botId)}/messages`,
  needsYouItem: (id: string) => `/v1/needs-you/${encodeURIComponent(id)}`,
  answer: (id: string) => `/v1/needs-you/${encodeURIComponent(id)}/answer`,
} as const;

/** `/v1/<part>…` a phone may not use (403). */
export const MOBILE_COMPUTER_ONLY = [
  "computer-use",
  "vault",
  "remote-desktop",
  "devices",
  "settings",
  "permissions",
  "mcp",
  "voice",
  "mobile",
] as const;

export const MOBILE_ANSWER_PLACES = ["phone", "computer"] as const;
export type MobileAnswerPlace = (typeof MOBILE_ANSWER_PLACES)[number];

/** GET MOBILE_PHONE_PATHS.threads: one conversation per agent. */
export interface MobileThread {
  botId: string;
  threadId: string | null;
  name: string;
  preview: string;
  updatedAt: string | null;
}

export interface MobileMessage {
  id: string;
  author: ConversationMessageAuthor;
  text: string;
  createdAt: string;
  status: "streaming" | "completed" | "failed" | "interrupted";
  itemType: string | null;
  /** Number of attachments (files stay on the computer). */
  attachments: number;
}

/** GET mobilePhonePath.messages(botId)?before=<id>&limit=<n>: oldest first; `nextBefore` loads older ones. */
export interface MobileMessagePage {
  botId: string;
  messages: MobileMessage[];
  nextBefore: string | null;
}

/** POST mobilePhonePath.messages(botId). */
export interface MobileSendMessageRequest {
  text: string;
  replyToMessageId?: string | null;
}

export interface MobileSendMessageResponse {
  messageId: string;
}

interface MobileDetailBase {
  item: MobileNeedsYouItem;
}

/** GET mobilePhonePath.needsYouItem(id): what the phone needs to decide, nothing more. */
export type MobileNeedsYouDetail =
  | (MobileDetailBase & {
      kind: "prompt";
      questions: Array<{ id: string; header: string; question: string; options: string[] | null }>;
    })
  | (MobileDetailBase & {
      kind: "approval";
      approvalKind: AgentApprovalKind;
      command: string | null;
      reason: string | null;
    })
  | (MobileDetailBase & {
      kind: "draft-preview";
      variant: "draft" | "confirm";
      recipient: string | null;
      channel: string | null;
      preview: string;
    })
  | (MobileDetailBase & { kind: "browser-takeover" | "vault-request" });

/** POST mobilePhonePath.answer(id). Questions: an option or your own words (up to 8 answers each). */
export type MobileAnswerRequest =
  | { kind: "prompt"; answers: Record<string, string[]> }
  | { kind: "approval"; decision: "accept" | "decline" }
  | { kind: "draft-preview"; decision: "send" | "edit" | "keep-draft"; feedback?: string; text?: string };

export interface MobileAnswerResponse {
  ok: true;
}

/** GET MOBILE_PHONE_PATHS.events (text/event-stream). Content stays short: the phone loads details itself. */
export type MobileStreamEvent =
  | { type: "needs-you"; items: MobileNeedsYouItem[] }
  | { type: "conversation"; botId: string }
  | { type: "agents"; agents: MobileAgentSummary[] };

export interface MobileAgentDetail extends MobileAgentSummary {
  /** The agent's description: how it works and what it does. */
  instructions: string;
}

export interface MobileTemplateSummary {
  id: string;
  name: string;
  role: string;
  summary: string;
}

/** POST MOBILE_PHONE_PATHS.agents: the agent creator, from a template, fields or both. */
export interface MobileCreateAgentRequest {
  templateId?: string;
  name?: string;
  role?: string;
  instructions?: string;
  /** One of BOT_AVATAR_HUES. */
  avatarHue?: number;
}

export interface MobileCreateAgentResponse {
  agent: MobileAgentDetail;
  /** What the creator could not do; the agent exists anyway. */
  warnings: string[];
}

/** PATCH mobilePhonePath.agent(botId): the profile only (tools, models, skills and memory: on the computer). */
export interface MobileUpdateAgentRequest {
  name?: string;
  role?: string;
  instructions?: string;
  avatarHue?: number;
}

export interface MobileErrorResponse {
  error: string;
}

const STREAM_TYPES = ["needs-you", "conversation", "agents"] as const;

export function formatMobileStreamEvent(event: MobileStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Complete events in `buffer`, and the rest to keep for the next chunk. Comments and bad events are skipped. */
export function parseMobileStreamEvents(buffer: string): { events: MobileStreamEvent[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: MobileStreamEvent[] = [];
  for (const block of blocks) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6))
      .join("\n");
    if (!data) continue;
    try {
      const value = JSON.parse(data);
      if (isMobileStreamEvent(value)) events.push(value);
    } catch {
      // Not an event of this protocol.
    }
  }
  return { events, rest };
}

function isMobileMessage(value: unknown): value is MobileMessage {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isOneOf(["user", "assistant", "agent", "system"], value.author) &&
    isString(value.text) &&
    isString(value.createdAt) &&
    isOneOf(["streaming", "completed", "failed", "interrupted"], value.status) &&
    isNullableString(value.itemType) &&
    isNumber(value.attachments)
  );
}

export function isMobileMessagePage(value: unknown): value is MobileMessagePage {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    Array.isArray(value.messages) &&
    value.messages.every(isMobileMessage) &&
    isNullableString(value.nextBefore)
  );
}

export function isMobileNeedsYouDetail(value: unknown): value is MobileNeedsYouDetail {
  if (!isDynamicRecord(value) || !isMobileNeedsYouItem(value.item)) return false;
  switch (value.kind) {
    case "prompt":
      return (
        Array.isArray(value.questions) &&
        value.questions.every(
          (question) =>
            isDynamicRecord(question) &&
            isString(question.id) &&
            isString(question.header) &&
            isString(question.question) &&
            (question.options === null || (Array.isArray(question.options) && question.options.every(isString))),
        )
      );
    case "approval":
      return isString(value.approvalKind) && isNullableString(value.command) && isNullableString(value.reason);
    case "draft-preview":
      return (
        isOneOf(["draft", "confirm"], value.variant) &&
        isNullableString(value.recipient) &&
        isNullableString(value.channel) &&
        isString(value.preview)
      );
    case "browser-takeover":
    case "vault-request":
      return true;
    default:
      return false;
  }
}

export function isMobileAgentDetail(value: unknown): value is MobileAgentDetail {
  return isMobileAgentSummary(value) && isDynamicRecord(value) && isString(value.instructions);
}

export function isMobileStreamEvent(value: unknown): value is MobileStreamEvent {
  if (!isDynamicRecord(value) || !isOneOf(STREAM_TYPES, value.type)) return false;
  if (value.type === "needs-you") return Array.isArray(value.items) && value.items.every(isMobileNeedsYouItem);
  if (value.type === "conversation") return isString(value.botId);
  return Array.isArray(value.agents) && value.agents.every(isMobileAgentSummary);
}
