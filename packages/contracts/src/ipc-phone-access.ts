// COSGRAL W9-BE1: the phone away from home (spec-w9.md 1A-1C, W9-01 ... W9-20; decisions Q1, Q2, Q4-Q7, Q11).
//
// Mobile Connect (ipc-mobile.ts) already pairs a phone and serves the phone web app (`/app/`). This adds what makes it usable
// away from home, and nothing more:
//   * Reach (Q1): the exposure stays `loopback` | `lan`. Tailscale is the SAME transport with the computer's Tailscale address
//     (a 100.x address or a *.ts.net name) in the link, plus a guide in the window. No third transport, no cloud of ours.
//   * Certificate (Q2): self-signed on this computer + its fingerprint to compare. A certificate of the Tailscale network
//     is a later option; this state only reports what is in use.
//   * PIN (Q6, Q7): optional, per paired phone. The phone sets it; this computer keeps only a salted hash. With a PIN set,
//     every phone call except the unlock ones answers 423 until the PIN is given; the lock comes back after 5 minutes without
//     a request and at once when the page goes to the background (the web app calls `lock`). 5 wrong PINs remove the phone:
//     it must pair again (that is also the way back for a forgotten PIN; the computer never shows or resets a PIN).
//   * Push (Q4, Q5, Q11): Web Push only about a card in Needs you. The VAPID private key stays encrypted on this computer
//     (the same safe the Vault uses) and never goes to the repo or to the phone. The notification text carries no secrets:
//     only that an agent waits. The message travels through the phone system's push service (FCM/APNs), encrypted for the
//     phone; the conversation itself never does. Off by default; the phone's own permission is asked before anything is sent.
//
// A phone never sees accounts, keys or sign-ins (P11b): the paths below are the only new ones, and `settings`, `vault`,
// `mcp` and the rest of MOBILE_COMPUTER_ONLY still answer 403 for a phone. The window API is about THIS computer only.

import { MOBILE_EXPOSURES, type MobileExposure } from "./ipc-mobile";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const PHONE_ACCESS_LIMITS = {
  pinMin: 4,
  pinMax: 8,
  /** Wrong PINs in a row before the phone is removed. */
  pinAttempts: 5,
  /** A phone with a PIN locks after this long without a request (Q7). */
  idleLockMs: 5 * 60_000,
  /** Push subscriptions kept per paired phone (a phone has one). */
  pushSubscriptionsPerDevice: 1,
  endpoint: 2048,
  key: 256,
  agentName: 64,
  itemId: 128,
  /** Request body of the new phone paths. */
  bodyBytes: 4_096,
} as const;

/** Paths of the phone API added by W9 (JSON; `Authorization: Bearer <device token>`). */
export const MOBILE_ACCESS_PATHS = {
  /** GET: what the web app needs to draw itself (PIN set? locked? push?). Answers also while locked. */
  session: "/v1/session",
  /** PUT {pin} sets (or {pin, currentPin} changes) the PIN; DELETE {pin} removes it. */
  pin: "/v1/pin",
  /** POST {pin}: unlocks; wrong = 401 with attemptsLeft; the last wrong one removes the phone. */
  pinUnlock: "/v1/pin/unlock",
  /** POST: locks now (the page went to the background). */
  lock: "/v1/lock",
  /** GET: the public VAPID key to subscribe with (never the private one). */
  pushKey: "/v1/push/key",
  /** PUT {subscription} saves the phone's subscription; DELETE removes it. */
  pushSubscription: "/v1/push/subscription",
} as const;

/** What the phone-side service worker is told about a card (no secrets, no card text: that stays behind the PIN). */
export const PHONE_PUSH_KINDS = ["needs-you"] as const;
export type PhonePushKind = (typeof PHONE_PUSH_KINDS)[number];

export interface PhonePushPayload {
  v: 1;
  kind: PhonePushKind;
  /** The name of the agent that waits (a word, not the question). */
  agentName: string;
  /** The card to open when the notification is tapped. */
  itemId: string;
  /** A test notification from the computer: it says so and opens nothing. */
  test?: true;
}

/** The only sentence a notification shows. */
export function phonePushText(payload: Pick<PhonePushPayload, "agentName" | "test">): string {
  return payload.test ? "This is a test notification from your computer" : `${payload.agentName} is waiting for you`;
}

/** Shown next to the push switch (Q11): honest about the one thing that does leave the local network. */
export const PHONE_PUSH_NOTICE =
  "Notifications go through your phone's system (Google or Apple), encrypted for your phone. They only say that an agent is waiting. Your conversations and answers never go through it.";

/** The reason when the push switch is on but nothing can be sent yet. */
export const PHONE_PUSH_REASONS = {
  off: "Push notifications are off on this computer.",
  noKeys: "The push keys of this computer are not ready (the computer cannot keep a secret key safe).",
  noPhone: "No phone has allowed notifications yet.",
} as const;

export interface PhoneSessionPush {
  /** This computer can send push (keys ready and the switch is on). */
  available: boolean;
  /** This phone has a subscription saved. */
  subscribed: boolean;
}

/** GET MOBILE_ACCESS_PATHS.session: also answers while the phone is locked. */
export interface PhoneSessionState {
  pinSet: boolean;
  locked: boolean;
  /** Wrong PINs left before the phone is removed; null without a PIN. */
  attemptsLeft: number | null;
  idleLockSeconds: number;
  push: PhoneSessionPush;
}

/** What a locked phone gets from any other `/v1/…` path: status 423 and `{ error }` (the web app reads the status). */
export const PHONE_LOCKED_STATUS = 423;
export const PHONE_LOCKED_MESSAGE = "Enter the PIN to continue.";

export interface PhoneUnlockResponse {
  ok: true;
}

export interface PhoneWrongPinResponse {
  error: string;
  code: "wrong-pin" | "removed";
  attemptsLeft: number;
}

/** The phone's own push subscription (what the browser's Push API gives). */
export interface PhonePushSubscription {
  endpoint: string;
  /** base64url, as the browser gives them. */
  keys: { p256dh: string; auth: string };
}

export interface PhonePushKeyResponse {
  publicKey: string;
}

/** What differs for the reach away from home. */
export const PHONE_REACH = ["off", "this-computer", "local-network", "tailscale"] as const;
export type PhoneReach = (typeof PHONE_REACH)[number];

export interface PhoneDeviceAccess {
  deviceId: string;
  name: string;
  pinSet: boolean;
  locked: boolean;
  pushSubscribed: boolean;
  /** The last push to this phone failed for this plain reason (the subscription is dropped when the push service says it is gone). */
  pushError: string | null;
  lastPushAt: string | null;
}

export interface PhonePushState {
  /** The switch on this computer. Off by default. */
  enabled: boolean;
  /** The VAPID keys exist (the private one encrypted on this computer). */
  keysReady: boolean;
  /** The public key a phone subscribes with; null until the keys exist. */
  publicKey: string | null;
  /** Why nothing is sent although the person wants it; null when it works or is off. */
  unavailableReason: string | null;
  subscriptions: number;
}

export interface PhoneAccessState {
  /** The phone server listens (Mobile Connect is on). */
  enabled: boolean;
  exposure: MobileExposure;
  /** What a phone can reach: this computer only, the local network, or a Tailscale address among the URLs. */
  reach: PhoneReach;
  /** The URLs of Mobile Connect that are Tailscale addresses (100.64.0.0/10 or *.ts.net). */
  tailscaleUrls: string[];
  /** SHA-256 of the certificate in use as "AB:CD:…" to compare on the phone, or null without TLS. */
  fingerprint: string | null;
  /** The certificate is made on this computer (the only mode in W9). */
  certificate: "self-signed";
  push: PhonePushState;
  devices: PhoneDeviceAccess[];
}

export interface PhoneAccessChanged {
  state: PhoneAccessState;
}

/** The steps the window shows to reach this computer from outside the home network with Tailscale. */
export interface PhoneTailscaleGuide {
  title: string;
  /** Plain steps in English, as the window shows them. */
  steps: string[];
  /** What Tailscale does and does not do here. */
  notes: string[];
  /** What the owner does outside the program. */
  ownerSteps: string[];
}

export const PHONE_TAILSCALE_GUIDE: PhoneTailscaleGuide = {
  title: "Reach this computer from your phone away from home (Tailscale)",
  steps: [
    "Install Tailscale on this computer and on your phone and sign in with the same account on both.",
    "Turn on 'Local network' in Mobile Connect. The computer then also answers on its Tailscale address.",
    "Start pairing. If a Tailscale address is listed with the other addresses, scan the QR code with the phone's camera.",
    "If the phone opens a different address, open this one instead: the computer's Tailscale name (MagicDNS, ends in .ts.net) or its 100.x address, shown in the Tailscale app.",
    "The browser warns about the certificate the first time. Compare the fingerprint shown here with the one in the warning, then continue.",
    "Approve the pairing on this computer, then add the page to the home screen to get notifications.",
  ],
  notes: [
    "Tailscale makes a private network between your own devices. The conversation travels between them, not through a server of ours.",
    "Notifications are the one exception: they go through your phone's system, encrypted for the phone, and only say that an agent is waiting.",
    "Remove a lost phone from the device list at once. A PIN on the phone is an extra lock, not a replacement for removing it.",
  ],
  ownerSteps: [
    "Create a Tailscale account and install the app on this computer and on each phone (only you can do this).",
    "Allow notifications for the web page on the phone when it asks.",
  ],
};

export interface PhonePushTestInput {
  deviceId: string;
}

/** The answer to a test notification: sent, or why not (a plain sentence, never a key). */
export interface PhonePushTestResult {
  sent: boolean;
  reason: string | null;
}

export interface SetPhonePushInput {
  enabled: boolean;
}

/**
 * The window API (`window.openbot.phone`). This computer only: a phone or a remote server may not call it. Changes come
 * as `phone-access-changed`. Pairing, devices and the certificate stay in `window.openbot.mobile`.
 */
export interface PhoneDesktopApi {
  getState: () => Promise<PhoneAccessState>;
  /** The steps to reach this computer with Tailscale (the same text every time). */
  getTailscaleGuide: () => Promise<PhoneTailscaleGuide>;
  /** The push switch of this computer (off by default). The phone's own permission is still asked. */
  setPushEnabled: (input: SetPhonePushInput) => Promise<PhoneAccessState>;
  /** One notification to a phone, to see that it arrives. Only on request; says "test", nothing else. */
  sendTestPush: (input: PhonePushTestInput) => Promise<PhonePushTestResult>;
}

// --- rules shared by the engine, the phone web app and the mock ---

const DIGITS = /^[0-9]+$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const TAILNET_NAME = /\.ts\.net$/i;

/** The PIN is digits only, 4 to 8 of them. */
export function isValidPin(value: unknown): value is string {
  return (
    isString(value) &&
    value.length >= PHONE_ACCESS_LIMITS.pinMin &&
    value.length <= PHONE_ACCESS_LIMITS.pinMax &&
    DIGITS.test(value)
  );
}

/** A host that is a Tailscale address: 100.64.0.0/10 (100.64 - 100.127) or a name under .ts.net. */
export function isTailscaleHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  if (TAILNET_NAME.test(bare)) return true;
  const match = /^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(bare);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 64 && second <= 127;
}

/** The URLs (as Mobile Connect lists them) whose host is a Tailscale address. */
export function tailscaleUrlsOf(urls: readonly string[]): string[] {
  const found: string[] = [];
  for (const url of urls) {
    try {
      if (isTailscaleHost(new URL(url).hostname)) found.push(url);
    } catch {
      // not a URL: not a phone address
    }
  }
  return found;
}

/** What a phone can reach, from the same facts Mobile Connect shows. */
export function phoneReachOf(enabled: boolean, exposure: MobileExposure, urls: readonly string[]): PhoneReach {
  if (!enabled) return "off";
  if (exposure === "loopback") return "this-computer";
  return tailscaleUrlsOf(urls).length > 0 ? "tailscale" : "local-network";
}

/** The reason push does not work although it is wanted; null when it works or is off. */
export function phonePushUnavailableReason(input: {
  enabled: boolean;
  keysReady: boolean;
  subscriptions: number;
}): typeof PHONE_PUSH_REASONS.noKeys | typeof PHONE_PUSH_REASONS.noPhone | null {
  if (!input.enabled) return null;
  if (!input.keysReady) return PHONE_PUSH_REASONS.noKeys;
  if (input.subscriptions === 0) return PHONE_PUSH_REASONS.noPhone;
  return null;
}

/** A push endpoint is an https address (a push service); anything else is refused. */
export function isPushEndpoint(value: unknown): value is string {
  if (!isString(value) || value.length > PHONE_ACCESS_LIMITS.endpoint) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function parsePhonePushSubscription(input: unknown): PhonePushSubscription {
  const subscription = isDynamicRecord(input) && isDynamicRecord(input.subscription) ? input.subscription : input;
  if (!isDynamicRecord(subscription) || !isPushEndpoint(subscription.endpoint) || !isDynamicRecord(subscription.keys)) {
    throw new Error("The push subscription is malformed.");
  }
  const { p256dh, auth } = subscription.keys;
  const valid = (key: unknown): key is string =>
    isString(key) && key.length > 0 && key.length <= PHONE_ACCESS_LIMITS.key && BASE64URL.test(key);
  if (!valid(p256dh) || !valid(auth)) throw new Error("The push subscription keys are malformed.");
  return { endpoint: subscription.endpoint, keys: { p256dh, auth } };
}

export function parseSetPhonePushInput(input: unknown): SetPhonePushInput {
  if (!isDynamicRecord(input) || !isBoolean(input.enabled))
    throw new Error("Push must be turned on or off (true or false).");
  return { enabled: input.enabled };
}

export function parsePhonePushTestInput(input: unknown): PhonePushTestInput {
  if (
    !isDynamicRecord(input) ||
    !isString(input.deviceId) ||
    input.deviceId.length === 0 ||
    input.deviceId.length > 128
  ) {
    throw new Error("The phone is not named.");
  }
  return { deviceId: input.deviceId };
}

/** A notification payload is only what a phone may show: the agent's name and the card to open. */
export function buildPhonePushPayload(input: { agentName: string; itemId: string; test?: true }): PhonePushPayload {
  return {
    v: 1,
    kind: "needs-you",
    agentName: input.agentName.replace(/\s+/g, " ").trim().slice(0, PHONE_ACCESS_LIMITS.agentName) || "An agent",
    itemId: input.itemId.slice(0, PHONE_ACCESS_LIMITS.itemId),
    ...(input.test ? { test: true as const } : {}),
  };
}

// --- guards ---

export function isPhonePushPayload(value: unknown): value is PhonePushPayload {
  return (
    isDynamicRecord(value) &&
    value.v === 1 &&
    isOneOf(PHONE_PUSH_KINDS, value.kind) &&
    isString(value.agentName) &&
    value.agentName.length > 0 &&
    value.agentName.length <= PHONE_ACCESS_LIMITS.agentName &&
    isString(value.itemId) &&
    value.itemId.length > 0 &&
    value.itemId.length <= PHONE_ACCESS_LIMITS.itemId &&
    (value.test === undefined || value.test === true)
  );
}

export function isPhoneSessionState(value: unknown): value is PhoneSessionState {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.pinSet) &&
    isBoolean(value.locked) &&
    (value.attemptsLeft === null || isNumber(value.attemptsLeft)) &&
    isNumber(value.idleLockSeconds) &&
    isDynamicRecord(value.push) &&
    isBoolean(value.push.available) &&
    isBoolean(value.push.subscribed)
  );
}

function isPhoneDeviceAccess(value: unknown): value is PhoneDeviceAccess {
  return (
    isDynamicRecord(value) &&
    isString(value.deviceId) &&
    isString(value.name) &&
    isBoolean(value.pinSet) &&
    isBoolean(value.locked) &&
    isBoolean(value.pushSubscribed) &&
    (value.pushError === null || isString(value.pushError)) &&
    (value.lastPushAt === null || isString(value.lastPushAt))
  );
}

function isPhonePushState(value: unknown): value is PhonePushState {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.enabled) &&
    isBoolean(value.keysReady) &&
    (value.publicKey === null || isString(value.publicKey)) &&
    (value.unavailableReason === null || isString(value.unavailableReason)) &&
    isNumber(value.subscriptions)
  );
}

export function isPhoneAccessState(value: unknown): value is PhoneAccessState {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.enabled) &&
    isOneOf(MOBILE_EXPOSURES, value.exposure) &&
    isOneOf(PHONE_REACH, value.reach) &&
    Array.isArray(value.tailscaleUrls) &&
    value.tailscaleUrls.every(isString) &&
    (value.fingerprint === null || isString(value.fingerprint)) &&
    value.certificate === "self-signed" &&
    isPhonePushState(value.push) &&
    Array.isArray(value.devices) &&
    value.devices.every(isPhoneDeviceAccess)
  );
}

export function isPhoneAccessChanged(value: unknown): value is PhoneAccessChanged & { type: "phone-access-changed" } {
  return isDynamicRecord(value) && value.type === "phone-access-changed" && isPhoneAccessState(value.state);
}

export function isPhoneTailscaleGuide(value: unknown): value is PhoneTailscaleGuide {
  return (
    isDynamicRecord(value) &&
    isString(value.title) &&
    Array.isArray(value.steps) &&
    value.steps.every(isString) &&
    Array.isArray(value.notes) &&
    value.notes.every(isString) &&
    Array.isArray(value.ownerSteps) &&
    value.ownerSteps.every(isString)
  );
}

export function isPhonePushTestResult(value: unknown): value is PhonePushTestResult {
  return isDynamicRecord(value) && isBoolean(value.sent) && (value.reason === null || isString(value.reason));
}
