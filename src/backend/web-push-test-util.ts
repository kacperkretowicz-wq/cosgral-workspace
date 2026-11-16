// COSGRAL W9-BE1: the phone's side of Web Push for tests only (RFC 8291 section 3.4): what a browser does with the body of a
// push message before its service worker sees it. Never imported by the program.

import { createDecipheriv, createECDH, hkdfSync } from "node:crypto";
import type { PhonePushSubscription } from "@openbot/contracts/ipc";

export interface TestPhoneKeys {
  subscription: PhonePushSubscription;
  privateKey: Buffer;
  publicKey: Buffer;
  authSecret: Buffer;
}

/** A phone's push keys and the subscription it would give (the endpoint is a made-up https address). */
export function newTestPhone(endpoint = "https://push.example.test/send/abc123"): TestPhoneKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const authSecret = Buffer.from("0123456789abcdef");
  return {
    subscription: {
      endpoint,
      keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url") },
    },
    privateKey: ecdh.getPrivateKey(),
    publicKey: ecdh.getPublicKey(),
    authSecret,
  };
}

export function decryptAsPhone(
  body: Buffer,
  phone: Pick<TestPhoneKeys, "privateKey" | "publicKey" | "authSecret">,
): Buffer {
  const salt = body.subarray(0, 16);
  const keyLength = body.readUInt8(20);
  const senderPublic = body.subarray(21, 21 + keyLength);
  const sealed = body.subarray(21 + keyLength);
  const receiver = createECDH("prime256v1");
  receiver.setPrivateKey(phone.privateKey);
  const shared = receiver.computeSecret(senderPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), phone.publicKey, senderPublic]);
  const inputKey = Buffer.from(hkdfSync("sha256", shared, phone.authSecret, keyInfo, 32));
  const key = Buffer.from(hkdfSync("sha256", inputKey, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", inputKey, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  let end = padded.length;
  while (end > 0 && padded[end - 1] === 0) end -= 1;
  if (padded[end - 1] !== 2) throw new Error("The record has no delimiter.");
  return padded.subarray(0, end - 1);
}
