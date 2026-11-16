// COSGRAL W9-BE1: what the program keeps for the phones away from home, in one small JSON file next to mobile.json:
//   * per paired phone: a SALTED HASH of its PIN (scrypt; never the PIN), the count of wrong PINs in a row, and the push
//     subscription the phone gave (an address of the phone system's push service and two public keys);
//   * the push switch of this computer (off by default);
//   * the VAPID key pair: the PUBLIC key in clear (a phone needs it), the PRIVATE key only encrypted by the program's secret
//     box (the same safe the Vault and the certificate key use). When the computer cannot encrypt, there are no keys and
//     no push: a private key is never written in clear and never leaves this computer.
// Writes go through a temporary file.

import { generateKeyPairSync, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PHONE_ACCESS_LIMITS, type PhonePushSubscription, parsePhonePushSubscription } from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { SecretBox } from "./vault-store";

interface StoredDeviceAccess {
  pinSalt: string | null;
  pinHash: string | null;
  failed: number;
  push: PhonePushSubscription | null;
  lastPushAt: string | null;
  pushError: string | null;
}

interface StoredFile {
  pushEnabled: boolean;
  vapid: { publicKey: string; privateCipher: string } | null;
  devices: Record<string, StoredDeviceAccess>;
}

/** The VAPID key pair for signing; `privateKeyPem` exists only in memory while a push is signed. */
export interface PhoneVapidKeys {
  /** The public key as a phone's Push API wants it: 65 bytes, base64url. */
  publicKey: string;
  privateKeyPem: string;
}

export interface PhoneDeviceAccessRecord {
  pinSet: boolean;
  push: PhonePushSubscription | null;
  lastPushAt: string | null;
  pushError: string | null;
}

const SCRYPT = { N: 16_384, r: 8, p: 1 } as const;
const HASH_BYTES = 32;

function emptyDevice(): StoredDeviceAccess {
  return { pinSalt: null, pinHash: null, failed: 0, push: null, lastPushAt: null, pushError: null };
}

export function hashPin(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin, salt, HASH_BYTES, SCRYPT);
}

export class PhoneAccessStore {
  readonly #file: string;
  readonly #box: SecretBox | null;
  #data: StoredFile;

  constructor(file: string, secretBox?: SecretBox) {
    this.#file = file;
    this.#box = secretBox ?? null;
    this.#data = read(file);
  }

  canEncrypt(): boolean {
    try {
      return this.#box?.canEncrypt() === true;
    } catch {
      return false;
    }
  }

  // -- the switch and the keys ------------------------------------------------------------------------------------

  pushEnabled(): boolean {
    return this.#data.pushEnabled;
  }

  setPushEnabled(enabled: boolean): void {
    if (this.#data.pushEnabled === enabled) return;
    this.#data = { ...this.#data, pushEnabled: enabled };
    this.#save();
  }

  /** The public key, or null while there are no keys. */
  publicKey(): string | null {
    return this.#data.vapid?.publicKey ?? null;
  }

  /** The key pair, made the first time. Null when this computer cannot keep the private key encrypted. */
  vapid(): PhoneVapidKeys | null {
    if (!this.#box || !this.canEncrypt()) return null;
    const saved = this.#data.vapid;
    if (saved) {
      try {
        return { publicKey: saved.publicKey, privateKeyPem: this.#box.decrypt(saved.privateCipher) };
      } catch {
        return null;
      }
    }
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    if (!isString(jwk.x) || !isString(jwk.y)) throw new Error("The push key could not be made.");
    const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const keys: PhoneVapidKeys = { publicKey: raw.toString("base64url"), privateKeyPem };
    this.#data = {
      ...this.#data,
      vapid: { publicKey: keys.publicKey, privateCipher: this.#box.encrypt(privateKeyPem) },
    };
    this.#save();
    return keys;
  }

  // -- a phone --------------------------------------------------------------------------------------------------------

  device(deviceId: string): PhoneDeviceAccessRecord {
    const saved = this.#data.devices[deviceId] ?? emptyDevice();
    return {
      pinSet: saved.pinHash !== null,
      push: saved.push,
      lastPushAt: saved.lastPushAt,
      pushError: saved.pushError,
    };
  }

  /** Sets (or changes) the PIN of a phone: a new random salt each time; the wrong-PIN count starts again. */
  setPin(deviceId: string, pin: string): void {
    const salt = randomBytes(16);
    this.#update(deviceId, {
      pinSalt: salt.toString("base64"),
      pinHash: hashPin(pin, salt).toString("base64"),
      failed: 0,
    });
  }

  clearPin(deviceId: string): void {
    this.#update(deviceId, { pinSalt: null, pinHash: null, failed: 0 });
  }

  /**
   * Checks a PIN in constant time. A right one resets the count; a wrong one counts, and the count is kept on disk so a
   * restart of the program does not give new tries. `attemptsLeft` is what remains after this try.
   */
  verifyPin(deviceId: string, pin: string): { ok: true } | { ok: false; attemptsLeft: number } {
    const saved = this.#data.devices[deviceId];
    if (!saved?.pinHash || !saved.pinSalt) return { ok: true };
    const expected = Buffer.from(saved.pinHash, "base64");
    const given = hashPin(pin, Buffer.from(saved.pinSalt, "base64"));
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      if (saved.failed !== 0) this.#update(deviceId, { failed: 0 });
      return { ok: true };
    }
    const failed = saved.failed + 1;
    this.#update(deviceId, { failed });
    return { ok: false, attemptsLeft: Math.max(0, PHONE_ACCESS_LIMITS.pinAttempts - failed) };
  }

  /** Wrong PINs left before the phone is removed. */
  attemptsLeft(deviceId: string): number {
    return Math.max(0, PHONE_ACCESS_LIMITS.pinAttempts - (this.#data.devices[deviceId]?.failed ?? 0));
  }

  setSubscription(deviceId: string, subscription: PhonePushSubscription | null): void {
    this.#update(deviceId, { push: subscription, pushError: null });
  }

  recordPush(deviceId: string, result: { at: string } | { error: string }): void {
    if ("at" in result) this.#update(deviceId, { lastPushAt: result.at, pushError: null });
    else this.#update(deviceId, { pushError: result.error });
  }

  subscriptionCount(): number {
    return Object.values(this.#data.devices).filter((device) => device.push !== null).length;
  }

  /** Everything about phones that are no longer paired is dropped. */
  prune(pairedIds: readonly string[]): void {
    const keep = new Set(pairedIds);
    const gone = Object.keys(this.#data.devices).filter((id) => !keep.has(id));
    if (gone.length === 0) return;
    const devices = { ...this.#data.devices };
    for (const id of gone) delete devices[id];
    this.#data = { ...this.#data, devices };
    this.#save();
  }

  #update(deviceId: string, change: Partial<StoredDeviceAccess>): void {
    const current = this.#data.devices[deviceId] ?? emptyDevice();
    this.#data = { ...this.#data, devices: { ...this.#data.devices, [deviceId]: { ...current, ...change } } };
    this.#save();
  }

  #save(): void {
    mkdirSync(dirname(this.#file), { recursive: true });
    const temporary = `${this.#file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.#data, null, 2));
    renameSync(temporary, this.#file);
  }
}

function read(file: string): StoredFile {
  const empty: StoredFile = { pushEnabled: false, vapid: null, devices: {} };
  if (!existsSync(file)) return empty;
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (!isDynamicRecord(value)) return empty;
    const devices: Record<string, StoredDeviceAccess> = {};
    if (isDynamicRecord(value.devices)) {
      for (const [id, raw] of Object.entries(value.devices)) {
        if (!isDynamicRecord(raw)) continue;
        let push: PhonePushSubscription | null = null;
        try {
          push = raw.push === null || raw.push === undefined ? null : parsePhonePushSubscription(raw.push);
        } catch {
          push = null;
        }
        const hasPin = isString(raw.pinSalt) && isString(raw.pinHash);
        devices[id] = {
          pinSalt: hasPin && isString(raw.pinSalt) ? raw.pinSalt : null,
          pinHash: hasPin && isString(raw.pinHash) ? raw.pinHash : null,
          failed: isNumber(raw.failed) && raw.failed >= 0 ? Math.floor(raw.failed) : 0,
          push,
          lastPushAt: isString(raw.lastPushAt) ? raw.lastPushAt : null,
          pushError: isString(raw.pushError) ? raw.pushError : null,
        };
      }
    }
    const vapid =
      isDynamicRecord(value.vapid) && isString(value.vapid.publicKey) && isString(value.vapid.privateCipher)
        ? { publicKey: value.vapid.publicKey, privateCipher: value.vapid.privateCipher }
        : null;
    return { pushEnabled: isBoolean(value.pushEnabled) ? value.pushEnabled : false, vapid, devices };
  } catch {
    return empty;
  }
}
