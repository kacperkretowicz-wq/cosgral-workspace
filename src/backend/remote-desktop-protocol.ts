// COSGRAL W3: the wire protocol of remote desktop. Pure functions, no network and no Electron: the host and the
// client both use them, and the tests check them alone.
//
// Text messages are JSON (at most REMOTE_DESKTOP_LIMITS.maxMessageBytes). Pictures are binary:
//   seq (uint32) | width (uint16) | height (uint16) | JPEG bytes      (big endian)
//
// Nothing here uses a clock. The token never travels: each side proves that it knows it with an HMAC over a nonce
// the host chose, so two computers with different clocks work the same.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  isRemoteDesktopInput,
  REMOTE_DESKTOP_LIMITS,
  REMOTE_DESKTOP_MODES,
  type RemoteDesktopInput,
  type RemoteDesktopMode,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";

export const REMOTE_DESKTOP_PATH = "/remote-desktop";
export const FRAME_HEADER_BYTES = 8;

export const DENIED_REASONS = [
  "bad-token",
  "blocked",
  "busy",
  "declined",
  "no-answer",
  "locked-out",
  "bad-version",
  "bad-message",
  "unavailable",
] as const;
export type DeniedReason = (typeof DENIED_REASONS)[number];

export const ENDED_REASONS = ["stopped", "host-disabled", "unresponsive", "error"] as const;
export type EndedReason = (typeof ENDED_REASONS)[number];

export interface HelloMessage {
  type: "hello";
  version: number;
  nonce: string;
}
export interface AuthMessage {
  type: "auth";
  clientId: string;
  label: string;
  mode: RemoteDesktopMode;
  proof: string;
}
export interface WaitingMessage {
  type: "waiting";
}
export interface AcceptedMessage {
  type: "accepted";
  sessionId: string;
  mode: RemoteDesktopMode;
  hostProof: string;
}
export interface DeniedMessage {
  type: "denied";
  reason: DeniedReason;
}
export interface PausedMessage {
  type: "paused";
  reason: string | null;
}
export interface EndedMessage {
  type: "ended";
  reason: EndedReason;
}
export interface ModeMessage {
  type: "mode";
  mode: RemoteDesktopMode;
}
export interface InputMessage {
  type: "input";
  input: RemoteDesktopInput;
}
export interface ByeMessage {
  type: "bye";
}

/** What a viewer may send to a host. */
export type ClientMessage = AuthMessage | InputMessage | ByeMessage;
/** What a host may send to a viewer (besides pictures). */
export type HostMessage =
  | HelloMessage
  | WaitingMessage
  | AcceptedMessage
  | DeniedMessage
  | PausedMessage
  | EndedMessage
  | ModeMessage;

const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;


export function newToken(): string {
  return randomBytes(REMOTE_DESKTOP_LIMITS.tokenBytes).toString("base64url");
}

export function newNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function isClientId(value: unknown): value is string {
  return isString(value) && CLIENT_ID.test(value);
}

function withoutControlCharacters(text: string): string {
  return Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
}

/** A name for a card or a list: no control characters, trimmed, at most `labelLength` characters. */
export function cleanLabel(value: unknown, fallback: string): string {
  const text = isString(value) ? withoutControlCharacters(value).trim() : "";
  return (text || fallback).slice(0, REMOTE_DESKTOP_LIMITS.labelLength);
}

function hmac(token: string, parts: string[]): string {
  return createHmac("sha256", token)
    .update(`cosgral-rd/${REMOTE_DESKTOP_LIMITS.protocolVersion}|${parts.join("|")}`)
    .digest("base64url");
}

/** The viewer's proof that it knows the token; binds the nonce, its id and the mode it asks for. */
export function clientProof(token: string, nonce: string, clientId: string, mode: RemoteDesktopMode): string {
  return hmac(token, ["client", nonce, clientId, mode]);
}

/** The host's proof, so that the viewer does not talk to a host that does not know the token. */
export function hostProof(token: string, nonce: string, clientId: string, mode: RemoteDesktopMode): string {
  return hmac(token, ["host", nonce, clientId, mode]);
}

/** Compares two proofs in constant time. */
export function sameProof(expected: string, given: unknown): boolean {
  if (!isString(given)) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  return left.length === right.length && timingSafeEqual(left, right);
}

function asRecord(value: unknown): DynamicRecord | null {
  return isDynamicRecord(value) ? value : null;
}

function parseJson(text: string): DynamicRecord | null {
  if (Buffer.byteLength(text) > REMOTE_DESKTOP_LIMITS.maxMessageBytes) return null;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

/** A message from a viewer; null when it is not one this host accepts. */
export function parseClientMessage(text: string): ClientMessage | null {
  const value = parseJson(text);
  if (!value) return null;
  switch (value.type) {
    case "auth":
      if (
        !isClientId(value.clientId) ||
        !isString(value.label) ||
        !isOneOf(REMOTE_DESKTOP_MODES, value.mode) ||
        !isString(value.proof) ||
        value.proof.length > 128
      ) {
        return null;
      }
      return {
        type: "auth",
        clientId: value.clientId,
        label: cleanLabel(value.label, "Unknown computer"),
        mode: value.mode,
        proof: value.proof,
      };
    case "input":
      return isRemoteDesktopInput(value.input) ? { type: "input", input: value.input } : null;
    case "bye":
      return { type: "bye" };
    default:
      return null;
  }
}

/** A message from a host; null when it is not one this viewer accepts. */
export function parseHostMessage(text: string): HostMessage | null {
  const value = parseJson(text);
  if (!value) return null;
  switch (value.type) {
    case "hello":
      return isNumber(value.version) && isString(value.nonce) && value.nonce.length <= 128
        ? { type: "hello", version: value.version, nonce: value.nonce }
        : null;
    case "waiting":
      return { type: "waiting" };
    case "accepted":
      return isString(value.sessionId) && isOneOf(REMOTE_DESKTOP_MODES, value.mode) && isString(value.hostProof)
        ? { type: "accepted", sessionId: value.sessionId, mode: value.mode, hostProof: value.hostProof }
        : null;
    case "denied":
      return isOneOf(DENIED_REASONS, value.reason) ? { type: "denied", reason: value.reason } : null;
    case "paused":
      return value.reason === null || isString(value.reason) ? { type: "paused", reason: value.reason } : null;
    case "ended":
      return isOneOf(ENDED_REASONS, value.reason) ? { type: "ended", reason: value.reason } : null;
    case "mode":
      return isOneOf(REMOTE_DESKTOP_MODES, value.mode) ? { type: "mode", mode: value.mode } : null;
    default:
      return null;
  }
}

export interface DecodedFrame {
  seq: number;
  width: number;
  height: number;
  jpeg: Buffer;
}

export function encodeFrame(seq: number, width: number, height: number, jpeg: Buffer): Buffer {
  const header = Buffer.alloc(FRAME_HEADER_BYTES);
  header.writeUInt32BE(seq >>> 0, 0);
  header.writeUInt16BE(Math.min(width, 0xffff), 4);
  header.writeUInt16BE(Math.min(height, 0xffff), 6);
  return Buffer.concat([header, jpeg]);
}

/** A picture from a host; null for a message that is too short, too big or not a JPEG. */
export function decodeFrame(data: Buffer): DecodedFrame | null {
  if (data.length <= FRAME_HEADER_BYTES || data.length > REMOTE_DESKTOP_LIMITS.maxFrameBytes + FRAME_HEADER_BYTES) {
    return null;
  }
  const jpeg = data.subarray(FRAME_HEADER_BYTES);
  // Every JPEG starts with FF D8 FF.
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) return null;
  const width = data.readUInt16BE(4);
  const height = data.readUInt16BE(6);
  if (width === 0 || height === 0) return null;
  return { seq: data.readUInt32BE(0), width, height, jpeg };
}

/** "localhost:47123", "192.168.1.5:47123" or a ws:// address → the WebSocket address of the host; throws for others. */
export function normalizeHostAddress(value: string): string {
  const text = value.trim();
  if (!text || text.length > 200) throw new Error("Enter the address of the other computer, like 192.168.1.20:47123.");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `ws://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("That is not an address. Use something like 192.168.1.20:47123.");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("Only ws:// and wss:// addresses work.");
  if (!url.hostname) throw new Error("The address has no computer name.");
  if (url.username || url.password) throw new Error("Do not put a user name or password in the address.");
  // A secure address may use the default port; a plain one needs the port the host shows.
  if (!url.port && url.protocol === "ws:") throw new Error("Add the port the host shows, like :47123.");
  url.pathname = REMOTE_DESKTOP_PATH;
  url.search = "";
  url.hash = "";
  return url.toString();
}
