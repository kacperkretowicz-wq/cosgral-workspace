// COSGRAL W10-KK2: a messenger bridge, Telegram only for now (spec-w10.md 1D, Q10; the owner wants it light and without a
// server). A Telegram BOT the person made with BotFather is connected with its token. The program asks Telegram for new
// messages itself ("long polling": no web address, no server, nothing listens from outside). A text a person writes to the bot
// from an ALLOWED chat becomes a message to the agent chosen for that chat; the agent's answer goes back to that chat.
//
// LEAST PRIVILEGE. Nobody is allowed by default: a message from a chat that is not on the list is ignored without a word to the
// chat (the settings only show that an unknown chat wrote, its number and its name, never its text, so the owner can allow it).
// Only private chats and only plain text are taken; groups, channels, photos, voice and files are ignored. An agent gets no tool
// for Telegram: it can only answer a message that came in, in that chat, and cannot write to any other chat.
//
// THE TOKEN. It is entered once (write-only), kept ENCRYPTED on this computer in the database of the space the program runs on,
// and never comes back: not in a status, an event, an error, a log or an answer. Telegram puts the token in the address of every
// request, so no message of this feature is ever made from an error text of the network layer: only the fixed sentences below.
//
// Everything here is about THIS computer only (a phone or a remote server may not call it).

import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "./runtime-values";

export const MESSENGER_KINDS = ["telegram"] as const;
export type MessengerKind = (typeof MESSENGER_KINDS)[number];

/**
 * disconnected: no token saved.
 * connecting: a token is saved and the program is checking it with Telegram.
 * connected: the bot answered, the program is listening for messages.
 * failed: the token is saved but the program cannot listen now (`reason` says why); it tries again by itself unless the token is refused.
 */
export const MESSENGER_PHASES = ["disconnected", "connecting", "connected", "failed"] as const;
export type MessengerPhase = (typeof MESSENGER_PHASES)[number];

export const MESSENGER_LIMITS = {
  /** Chats on the allow list (per messenger). */
  allowedChats: 20,
  /** Unknown chats the settings remember (the newest ones). */
  unknownChats: 10,
  /** Characters of an incoming text that are taken; a longer text is refused with a plain sentence to the chat. */
  incomingText: 4_000,
  /** Characters of one outgoing part (Telegram allows 4096). */
  outgoingPart: 4_000,
  /** Parts of one answer; the rest is cut with a note. */
  outgoingParts: 8,
  /** Messages one chat may send per minute before the program stops forwarding for the rest of the minute. */
  incomingPerMinute: 10,
  label: 60,
} as const;

export interface AllowedChat {
  /** Telegram's number of the private chat (digits only). */
  chatId: string;
  /** How the person calls this chat in the settings. */
  label: string;
  /** The agent that answers this chat. */
  botId: string;
  addedAt: string;
}

/** A chat that wrote to the bot but is not on the list. Its number and name only; never what it wrote. */
export interface UnknownChat {
  chatId: string;
  label: string;
  lastSeenAt: string;
  count: number;
}

export interface MessengerStatus {
  kind: MessengerKind;
  label: string;
  phase: MessengerPhase;
  /** A plain sentence for `failed` (and a hint for `connecting`); never the token. */
  reason: string | null;
  /** The public name of the bot, as Telegram gives it (`@name`), when connected; null otherwise. */
  botUsername: string | null;
  connectedAt: string | null;
  tokenSaved: boolean;
  allowedChats: AllowedChat[];
  unknownChats: UnknownChat[];
  /** Since the program started: messages passed to an agent, answers sent back, messages ignored. */
  counts: { forwarded: number; replied: number; ignored: number };
}

export interface MessengerList {
  /** The space the program runs on (the connection belongs to it). */
  spaceId: string;
  messengers: MessengerStatus[];
}

export interface MessengerKindInput {
  kind: MessengerKind;
}

export interface ConnectMessengerInput extends MessengerKindInput {
  /** Write-only. Checked for its shape here and with Telegram by the program. */
  token: string;
}

export interface AllowChatInput extends MessengerKindInput {
  chatId: string;
  botId: string;
  label?: string;
}

export interface RemoveChatInput extends MessengerKindInput {
  chatId: string;
}

export interface MessengersDesktopApi {
  list: () => Promise<MessengerList>;
  status: (input: MessengerKindInput) => Promise<MessengerStatus>;
  /** Saves the token (encrypted), checks it with Telegram and starts listening. Replaces a token saved before. */
  connect: (input: ConnectMessengerInput) => Promise<MessengerStatus>;
  /** Stops listening and removes the saved token. The allow list stays (it is not a secret). */
  disconnect: (input: MessengerKindInput) => Promise<MessengerList>;
  allowChat: (input: AllowChatInput) => Promise<MessengerList>;
  removeChat: (input: RemoveChatInput) => Promise<MessengerList>;
}

/** Event `messengers-changed`: the whole list. */
export interface MessengersChanged extends MessengerList {}

// --- rules shared by the engine and the mock ---

export const MESSENGER_LABELS: ReadonlyArray<readonly [MessengerKind, string]> = [["telegram", "Telegram"]];

export function messengerLabel(kind: MessengerKind): string {
  return MESSENGER_LABELS.find(([known]) => known === kind)?.[1] ?? kind;
}

/** The shape of a BotFather token: the bot's number, a colon and a secret part. Only the shape; Telegram decides if it is real. */
export function isTelegramToken(value: string): boolean {
  return /^\d{6,12}:[A-Za-z0-9_-]{30,60}$/.test(value);
}

/** A chat number as Telegram sends it for a private chat: digits only. */
export function isChatId(value: string): boolean {
  return /^\d{1,20}$/.test(value);
}

/** A label made tidy: one line, no control characters, shortened. */
export function normalizeChatLabel(text: string): string {
  const printable = Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  const tidy = printable.replace(/\s+/g, " ").trim();
  return tidy.length > MESSENGER_LIMITS.label ? `${tidy.slice(0, MESSENGER_LIMITS.label - 1)}…` : tidy;
}

export function emptyMessengerStatus(kind: MessengerKind): MessengerStatus {
  return {
    kind,
    label: messengerLabel(kind),
    phase: "disconnected",
    reason: null,
    botUsername: null,
    connectedAt: null,
    tokenSaved: false,
    allowedChats: [],
    unknownChats: [],
    counts: { forwarded: 0, replied: 0, ignored: 0 },
  };
}

// --- guards and parsers ---

function isKind(value: unknown): value is MessengerKind {
  return MESSENGER_KINDS.some((kind) => kind === value);
}

function isAllowedChat(value: unknown): value is AllowedChat {
  return (
    isDynamicRecord(value) &&
    isString(value.chatId) &&
    isChatId(value.chatId) &&
    isString(value.label) &&
    isString(value.botId) &&
    value.botId.length > 0 &&
    isString(value.addedAt)
  );
}

function isUnknownChat(value: unknown): value is UnknownChat {
  return (
    isDynamicRecord(value) &&
    isString(value.chatId) &&
    isChatId(value.chatId) &&
    isString(value.label) &&
    isString(value.lastSeenAt) &&
    isNumber(value.count) &&
    value.count > 0
  );
}

export function isMessengerStatus(value: unknown): value is MessengerStatus {
  if (!isDynamicRecord(value)) return false;
  const record: DynamicRecord = value;
  if (
    !(
      isKind(record.kind) &&
      isString(record.label) &&
      MESSENGER_PHASES.some((phase) => phase === record.phase) &&
      (record.reason === null || isString(record.reason)) &&
      (record.botUsername === null || isString(record.botUsername)) &&
      (record.connectedAt === null || isString(record.connectedAt)) &&
      isBoolean(record.tokenSaved) &&
      Array.isArray(record.allowedChats) &&
      record.allowedChats.every(isAllowedChat) &&
      Array.isArray(record.unknownChats) &&
      record.unknownChats.every(isUnknownChat) &&
      isDynamicRecord(record.counts) &&
      isNumber(record.counts.forwarded) &&
      isNumber(record.counts.replied) &&
      isNumber(record.counts.ignored)
    )
  )
    return false;
  // The phase and the fields agree.
  if (record.phase === "disconnected")
    return record.tokenSaved === false && record.botUsername === null && record.connectedAt === null;
  if (record.tokenSaved !== true) return false;
  if (record.phase === "connected") return record.botUsername !== null && record.connectedAt !== null;
  if (record.phase === "failed") return record.reason !== null;
  return true;
}

export function isMessengerList(value: unknown): value is MessengerList {
  if (!isDynamicRecord(value) || !isString(value.spaceId) || !Array.isArray(value.messengers)) return false;
  const messengers: unknown[] = value.messengers;
  if (!messengers.every(isMessengerStatus)) return false;
  return new Set(messengers.map((entry) => (isMessengerStatus(entry) ? entry.kind : ""))).size === messengers.length;
}

export function isMessengersChanged(value: unknown): value is MessengersChanged & { type: "messengers-changed" } {
  return isDynamicRecord(value) && value.type === "messengers-changed" && isMessengerList(value);
}

function parseKind(value: unknown): MessengerKind {
  if (!isKind(value)) throw new Error(`The messenger is one of: ${MESSENGER_KINDS.join(", ")}.`);
  return value;
}

export function parseMessengerKindInput(input: unknown): MessengerKindInput {
  if (!isDynamicRecord(input)) throw new Error("The messenger request is malformed.");
  return { kind: parseKind(input.kind) };
}

/** The token is checked for its shape only. The error never repeats what was typed. */
export function parseConnectMessengerInput(input: unknown): ConnectMessengerInput {
  if (!isDynamicRecord(input)) throw new Error("The messenger request is malformed.");
  const kind = parseKind(input.kind);
  const token = isString(input.token) ? input.token.trim() : "";
  if (!isTelegramToken(token)) {
    throw new Error(
      "That does not look like a Telegram bot token. BotFather gives one like 123456789:AA… (digits, a colon, letters and digits).",
    );
  }
  return { kind, token };
}

export function parseAllowChatInput(input: unknown): AllowChatInput {
  if (!isDynamicRecord(input)) throw new Error("The messenger request is malformed.");
  const kind = parseKind(input.kind);
  if (!isString(input.chatId) || !isChatId(input.chatId))
    throw new Error("A chat number is digits only (a private chat).");
  if (!isString(input.botId) || input.botId.length === 0 || input.botId.length > 200)
    throw new Error("Choose the agent that answers this chat.");
  const parsed: AllowChatInput = { kind, chatId: input.chatId, botId: input.botId };
  if (input.label !== undefined) {
    if (!isString(input.label)) throw new Error("A chat label is text.");
    const label = normalizeChatLabel(input.label);
    if (label.length > 0) parsed.label = label;
  }
  return parsed;
}

export function parseRemoveChatInput(input: unknown): RemoveChatInput {
  if (!isDynamicRecord(input)) throw new Error("The messenger request is malformed.");
  if (!isString(input.chatId) || !isChatId(input.chatId))
    throw new Error("A chat number is digits only (a private chat).");
  return { kind: parseKind(input.kind), chatId: input.chatId };
}
