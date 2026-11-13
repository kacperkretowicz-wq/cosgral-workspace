// COSGRAL W3: paired phones of Mobile Connect in one small JSON file next to the program's data. A device token is
// never stored: only its SHA-256, so a copy of the file does not let anyone in. Writes go through a temporary file.

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  MOBILE_DEFAULT_PORT,
  MOBILE_EXPOSURES,
  MOBILE_LIMITS,
  type MobileDevice,
  type MobileExposure,
} from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import type { MobileCertificate } from "./mobile-certificate";
import type { SecretBox } from "./vault-store";

interface StoredDevice extends MobileDevice {
  tokenHash: string;
}

/** COSGRAL W3-BE7: the TLS certificate; the private key only encrypted by the program's secret box. */
interface StoredCertificate {
  certPem: string;
  keyCipher: string;
  fingerprint: string;
  notAfter: string;
}

interface StoredFile {
  enabled: boolean;
  exposure: MobileExposure;
  port: number;
  devices: StoredDevice[];
  tls: StoredCertificate | null;
}

/** The certificate with its decrypted key, for the HTTPS server only. */
export interface MobileStoredCertificate {
  certPem: string;
  keyPem: string;
  fingerprint: string;
  notAfter: string;
}

export interface MobileSettings {
  /** The server ran when the program closed; it starts again with the program. */
  enabled: boolean;
  exposure: MobileExposure;
  port: number;
}

/** How long lastSeenAt may lag behind before it is written again. */
const TOUCH_WRITE_MS = 60_000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class MobileStore {
  readonly #file: string;
  readonly #box: SecretBox | null;
  #data: StoredFile;

  /** Without a secret box (or one that cannot encrypt) there is no TLS: plain HTTP on loopback only. */
  constructor(file: string, secretBox?: SecretBox) {
    this.#file = file;
    this.#box = secretBox ?? null;
    this.#data = read(file);
  }

  /** True when the certificate key can be kept encrypted, so TLS is used. */
  canEncrypt(): boolean {
    try {
      return this.#box?.canEncrypt() === true;
    } catch {
      return false;
    }
  }

  /** The saved certificate with its key, or null when there is none or its key cannot be read. */
  certificate(): MobileStoredCertificate | null {
    const tls = this.#data.tls;
    if (!tls || !this.#box || !this.canEncrypt()) return null;
    try {
      const keyPem = this.#box.decrypt(tls.keyCipher);
      return { certPem: tls.certPem, keyPem, fingerprint: tls.fingerprint, notAfter: tls.notAfter };
    } catch {
      return null;
    }
  }

  /** The fingerprint of the saved certificate, without decrypting its key. */
  certificateFingerprint(): string | null {
    return this.#data.tls?.fingerprint ?? null;
  }

  saveCertificate(certificate: MobileCertificate): void {
    if (!this.#box || !this.canEncrypt()) throw new Error("This computer cannot keep the certificate key safe.");
    this.#data = {
      ...this.#data,
      tls: {
        certPem: certificate.certPem,
        keyCipher: this.#box.encrypt(certificate.keyPem),
        fingerprint: certificate.fingerprint,
        notAfter: certificate.notAfter,
      },
    };
    this.#save();
  }

  /** Every paired phone is removed (after a new certificate: they pinned the old one). Returns how many. */
  removeAllDevices(): number {
    const count = this.#data.devices.length;
    if (count === 0) return 0;
    this.#data = { ...this.#data, devices: [] };
    this.#save();
    return count;
  }

  settings(): MobileSettings {
    return { enabled: this.#data.enabled, exposure: this.#data.exposure, port: this.#data.port };
  }

  setNetwork(input: { enabled: boolean; exposure?: MobileExposure; port?: number }): void {
    this.#data = {
      ...this.#data,
      enabled: input.enabled,
      exposure: input.exposure ?? this.#data.exposure,
      port: input.port ?? this.#data.port,
    };
    this.#save();
  }

  listDevices(): MobileDevice[] {
    return this.#data.devices.map(publicDevice);
  }

  /** A new device and its token; the token is returned only here. */
  addDevice(input: { name: string; platform: string | null; address: string | null; now: Date }): {
    device: MobileDevice;
    token: string;
  } {
    if (this.#data.devices.length >= MOBILE_LIMITS.devices) {
      throw new Error(`At most ${MOBILE_LIMITS.devices} phones can be paired; remove one first.`);
    }
    const token = randomBytes(32).toString("base64url");
    const at = input.now.toISOString();
    const device: StoredDevice = {
      id: randomUUID(),
      name: input.name,
      platform: input.platform,
      pairedAt: at,
      lastSeenAt: at,
      lastAddress: input.address,
      tokenHash: hashToken(token),
    };
    this.#data = { ...this.#data, devices: [...this.#data.devices, device] };
    this.#save();
    return { device: publicDevice(device), token };
  }

  /** The device of a token, compared by hash in constant time. */
  findByToken(token: string): MobileDevice | null {
    const wanted = Buffer.from(hashToken(token), "hex");
    let found: StoredDevice | null = null;
    for (const device of this.#data.devices) {
      const stored = Buffer.from(device.tokenHash, "hex");
      if (stored.length === wanted.length && timingSafeEqual(stored, wanted)) found = device;
    }
    return found ? publicDevice(found) : null;
  }

  /** Remembers when and from where a device was last seen (written at most once a minute). */
  touch(deviceId: string, address: string | null, now: Date): void {
    const device = this.#data.devices.find((candidate) => candidate.id === deviceId);
    if (!device) return;
    const previous = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
    const moved = device.lastAddress !== address;
    device.lastSeenAt = now.toISOString();
    device.lastAddress = address;
    if (moved || now.getTime() - previous >= TOUCH_WRITE_MS) this.#save();
  }

  removeDevice(deviceId: string): boolean {
    const devices = this.#data.devices.filter((device) => device.id !== deviceId);
    if (devices.length === this.#data.devices.length) return false;
    this.#data = { ...this.#data, devices };
    this.#save();
    return true;
  }

  #save(): void {
    mkdirSync(dirname(this.#file), { recursive: true });
    const temporary = `${this.#file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.#data, null, 2));
    renameSync(temporary, this.#file);
  }
}

function publicDevice(device: StoredDevice): MobileDevice {
  return {
    id: device.id,
    name: device.name,
    platform: device.platform,
    pairedAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt,
    lastAddress: device.lastAddress,
  };
}

function read(file: string): StoredFile {
  const empty: StoredFile = {
    enabled: false,
    exposure: "loopback",
    port: MOBILE_DEFAULT_PORT,
    devices: [],
    tls: null,
  };
  if (!existsSync(file)) return empty;
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (!isDynamicRecord(value)) return empty;
    const devices = Array.isArray(value.devices)
      ? value.devices.flatMap((device): StoredDevice[] =>
          isDynamicRecord(device) &&
          isString(device.id) &&
          isString(device.name) &&
          isString(device.pairedAt) &&
          isString(device.tokenHash) &&
          /^[0-9a-f]{64}$/.test(device.tokenHash)
            ? [
                {
                  id: device.id,
                  name: device.name,
                  platform: isString(device.platform) ? device.platform : null,
                  pairedAt: device.pairedAt,
                  lastSeenAt: isString(device.lastSeenAt) ? device.lastSeenAt : null,
                  lastAddress: isString(device.lastAddress) ? device.lastAddress : null,
                  tokenHash: device.tokenHash,
                },
              ]
            : [],
        )
      : [];
    return {
      enabled: isBoolean(value.enabled) ? value.enabled : false,
      exposure: isOneOf(MOBILE_EXPOSURES, value.exposure) ? value.exposure : "loopback",
      port: isNumber(value.port) && Number.isInteger(value.port) ? value.port : MOBILE_DEFAULT_PORT,
      devices,
      tls:
        isDynamicRecord(value.tls) &&
        isString(value.tls.certPem) &&
        isString(value.tls.keyCipher) &&
        isString(value.tls.fingerprint) &&
        /^[0-9a-f]{64}$/.test(value.tls.fingerprint) &&
        isString(value.tls.notAfter)
          ? {
              certPem: value.tls.certPem,
              keyCipher: value.tls.keyCipher,
              fingerprint: value.tls.fingerprint,
              notAfter: value.tls.notAfter,
            }
          : null,
    };
  } catch {
    return empty;
  }
}
