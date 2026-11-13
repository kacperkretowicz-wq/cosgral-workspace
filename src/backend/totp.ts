// COSGRAL W2: time-based one-time passwords (RFC 6238, on HOTP from RFC 4226) for the Vault.
// The program makes the code; an agent only asks to type it into a page and never sees the key.

import { createHmac } from "node:crypto";

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export interface TotpConfig {
  /** Base32 shared secret (RFC 4648), spaces and hyphens allowed. */
  secret: string;
  algorithm?: TotpAlgorithm;
  digits?: number;
  /** Time step in seconds. */
  period?: number;
  issuer?: string;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ALGORITHMS: Record<TotpAlgorithm, string> = { SHA1: "sha1", SHA256: "sha256", SHA512: "sha512" };

export function base32Encode(bytes: Buffer): string {
  let output = "";
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = normalizeSecret(text);
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error("The setup key is not valid base32.");
  const output: number[] = [];
  let value = 0;
  let bits = 0;
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(output);
}

/** The code for the time step that contains `nowMs`. */
export function totp(config: TotpConfig, nowMs: number = Date.now()): string {
  const digits = config.digits ?? 6;
  const period = config.period ?? 30;
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / 1000 / period)));
  const hmac = createHmac(ALGORITHMS[config.algorithm ?? "SHA1"], base32Decode(config.secret))
    .update(counter)
    .digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** A setup key as sites show it: the raw base32 key or an otpauth://totp/… link. */
export function parseTotpSetupKey(text: string): Required<Omit<TotpConfig, "issuer">> & { issuer?: string } {
  const value = text.trim();
  if (!value) throw new Error("The setup key is empty.");
  if (!value.toLowerCase().startsWith("otpauth://")) {
    const secret = normalizeSecret(value);
    base32Decode(secret);
    return { secret, algorithm: "SHA1", digits: 6, period: 30 };
  }
  const url = new URL(value);
  if (url.host.toLowerCase() !== "totp") throw new Error("Only time-based (totp) setup keys are supported.");
  const secret = normalizeSecret(url.searchParams.get("secret") ?? "");
  base32Decode(secret);
  const algorithm = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
  if (algorithm !== "SHA1" && algorithm !== "SHA256" && algorithm !== "SHA512") {
    throw new Error("The setup key uses an unsupported algorithm.");
  }
  const digits = Number(url.searchParams.get("digits") ?? 6);
  const period = Number(url.searchParams.get("period") ?? 30);
  if (![6, 7, 8].includes(digits) || !Number.isInteger(period) || period < 1 || period > 300) {
    throw new Error("The setup key has unsupported digits or period.");
  }
  const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const issuer = url.searchParams.get("issuer") ?? (label.includes(":") ? label.split(":")[0] : undefined);
  return { secret, algorithm, digits, period, ...(issuer ? { issuer } : {}) };
}

function normalizeSecret(text: string): string {
  return text.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
}
