// COSGRAL W9-BE1: Web Push without a library (RFC 8030 delivery, RFC 8291 message encryption with aes128gcm, RFC 8292 VAPID),
// only node:crypto. The message is encrypted for the phone's own keys, so the push service of the phone system (Google, Apple,
// Mozilla) carries bytes it cannot read. The VAPID key proves to that service that the message comes from this computer.
// Nothing here knows what a notification says: callers pass the bytes.

import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createSign,
  hkdfSync,
  type KeyObject,
  randomBytes,
} from "node:crypto";
import type { PhonePushSubscription } from "@openbot/contracts/ipc";

/** The record size announced in the body; one record holds the whole (short) message. */
const RECORD_SIZE = 4096;
/** The most a short message may hold: record size, minus the 16-byte tag and the delimiter byte. */
export const WEB_PUSH_MAX_PLAINTEXT = RECORD_SIZE - 16 - 1;
/** Seconds the push service may keep a message for a phone that is off. A card that waits is still worth showing. */
export const WEB_PUSH_TTL_SECONDS = 3_600;
const VAPID_LIFETIME_SECONDS = 12 * 3_600;
/** A contact address the push service may use about misbehaving senders; a reserved example address, nobody's own. */
export const DEFAULT_VAPID_SUBJECT = "mailto:noreply@example.com";

export interface EncryptedPush {
  body: Buffer;
}

/** Test hooks: RFC 8291 gives fixed values for the sender's one-time key and the salt. */
export interface EncryptOverrides {
  senderPrivateKey?: Buffer;
  salt?: Buffer;
}

/** The message as the phone's service worker receives it after decrypting: `plaintext`. */
export function encryptWebPush(
  plaintext: Buffer,
  subscription: PhonePushSubscription,
  overrides: EncryptOverrides = {},
): EncryptedPush {
  if (plaintext.length > WEB_PUSH_MAX_PLAINTEXT) throw new Error("The notification is too long.");
  const userPublic = Buffer.from(subscription.keys.p256dh, "base64url");
  const authSecret = Buffer.from(subscription.keys.auth, "base64url");
  if (userPublic.length !== 65 || userPublic[0] !== 4) throw new Error("The phone's push key is not valid.");
  if (authSecret.length < 16) throw new Error("The phone's push secret is not valid.");

  const sender = createECDH("prime256v1");
  if (overrides.senderPrivateKey) sender.setPrivateKey(overrides.senderPrivateKey);
  else sender.generateKeys();
  const senderPublic = sender.getPublicKey();
  const shared = sender.computeSecret(userPublic);
  const salt = overrides.salt ?? randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), userPublic, senderPublic]);
  const inputKey = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const contentKey = Buffer.from(
    hkdfSync("sha256", inputKey, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16),
  );
  const nonce = Buffer.from(hkdfSync("sha256", inputKey, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12));

  // One record, the last one: the message, then the delimiter 0x02 (RFC 8188), no padding.
  const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
  const sealed = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(senderPublic.length, 20);
  return { body: Buffer.concat([header, senderPublic, sealed]) };
}

/** The `Authorization` header of RFC 8292: a signed token for the push service's origin, and the public key. */
export function vapidAuthorization(input: {
  endpoint: string;
  privateKeyPem: string;
  publicKey: string;
  subject?: string;
  now?: Date;
}): string {
  const audience = new URL(input.endpoint).origin;
  const expires = Math.floor((input.now ?? new Date()).getTime() / 1000) + VAPID_LIFETIME_SECONDS;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const unsigned = `${encode({ typ: "JWT", alg: "ES256" })}.${encode({ aud: audience, exp: expires, sub: input.subject ?? DEFAULT_VAPID_SUBJECT })}`;
  const key: KeyObject = createPrivateKey(input.privateKeyPem);
  const signature = createSign("SHA256").update(unsigned).sign({ key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${signature.toString("base64url")}, k=${input.publicKey}`;
}

export interface PushRequest {
  url: string;
  headers: Record<string, string>;
  body: Buffer;
}

/** What the push service answered; only the status matters. */
export type PushPost = (request: PushRequest) => Promise<{ status: number }>;

/** The one real network call of the program's push: a POST to the phone system's push service. Tests never use it. */
export const fetchPushPost: PushPost = async (request) => {
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: new Uint8Array(request.body),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: response.status };
};

export type PushOutcome = { ok: true } | { ok: false; gone: boolean; reason: string };

/** Sends one message. `gone` is true when the push service says the subscription no longer exists (the phone removed it). */
export async function sendWebPush(input: {
  subscription: PhonePushSubscription;
  payload: Buffer;
  privateKeyPem: string;
  publicKey: string;
  post?: PushPost;
  subject?: string;
  now?: Date;
}): Promise<PushOutcome> {
  try {
    const encrypted = encryptWebPush(input.payload, input.subscription);
    const post = input.post ?? fetchPushPost;
    const { status } = await post({
      url: input.subscription.endpoint,
      headers: {
        authorization: vapidAuthorization({
          endpoint: input.subscription.endpoint,
          privateKeyPem: input.privateKeyPem,
          publicKey: input.publicKey,
          ...(input.subject ? { subject: input.subject } : {}),
          ...(input.now ? { now: input.now } : {}),
        }),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        "content-length": String(encrypted.body.length),
        ttl: String(WEB_PUSH_TTL_SECONDS),
        urgency: "high",
      },
      body: encrypted.body,
    });
    if (status >= 200 && status < 300) return { ok: true };
    if (status === 404 || status === 410)
      return { ok: false, gone: true, reason: "The phone removed its subscription." };
    if (status === 413) return { ok: false, gone: false, reason: "The push service refused the message as too large." };
    if (status === 429)
      return { ok: false, gone: false, reason: "The push service asked to slow down; it will be tried again." };
    return { ok: false, gone: false, reason: `The push service answered ${status}.` };
  } catch (error) {
    // Never echo the endpoint or a key: only a plain sentence.
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      gone: false,
      reason: timedOut ? "The push service did not answer in time." : "The push service could not be reached.",
    };
  }
}
