// COSGRAL: the two things a person copies from a free ngrok account (authtoken and the free static domain).
// The authtoken is stored encrypted with the system's secure storage, like the other saved logins.

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { isNgrokHostname } from "@openbot/contracts/validation";

interface Cipher {
  encrypt: (value: string) => Buffer;
  decrypt: (value: Buffer) => string;
}

export interface NgrokSettings {
  authtoken: string;
  domain: string;
}

/** Cleans what a person pasted: the domain without `https://` and the slash, lower case. */
export function normalizeNgrokDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "");
}

export function validateNgrokSettings(input: NgrokSettings): NgrokSettings {
  const authtoken = input.authtoken.trim();
  const domain = normalizeNgrokDomain(input.domain);
  if (!/^[A-Za-z0-9_-]{20,200}$/u.test(authtoken)) {
    throw new Error("Token ngrok wygląda na nieprawidłowy. Skopiuj go w całości ze strony „Your Authtoken” w ngrok.");
  }
  if (!isNgrokHostname(domain)) {
    throw new Error(
      "Domena ngrok wygląda na nieprawidłową. Skopiuj ją ze strony „Domains” w ngrok, na przykład nazwa.ngrok-free.app.",
    );
  }
  return { authtoken, domain };
}

export class NgrokSettingsStore {
  readonly #path: string;
  readonly #cipher: Cipher;
  #settings: NgrokSettings | null = null;

  constructor(path: string, cipher: Cipher) {
    this.#path = path;
    this.#cipher = cipher;
  }

  async initialize(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.#path, "utf8"));
      if (!isDynamicRecord(value) || !isString(value.domain) || !isString(value.encryptedAuthtoken)) return;
      this.#settings = validateNgrokSettings({
        domain: value.domain,
        authtoken: this.#cipher.decrypt(Buffer.from(value.encryptedAuthtoken, "base64")),
      });
    } catch {
      this.#settings = null;
    }
  }

  get(): NgrokSettings | null {
    return this.#settings ? { ...this.#settings } : null;
  }

  async set(input: NgrokSettings): Promise<void> {
    const settings = validateNgrokSettings(input);
    await mkdir(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify({ version: 1, domain: settings.domain, encryptedAuthtoken: this.#cipher.encrypt(settings.authtoken).toString("base64") })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporary, this.#path);
    await chmod(this.#path, 0o600).catch(() => undefined);
    this.#settings = settings;
  }
}
