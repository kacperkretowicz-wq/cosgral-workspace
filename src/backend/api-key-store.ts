// COSGRAL W5-BE3: API keys of the providers in the local database.
// The key is encrypted with a SecretBox (Electron safeStorage, DPAPI on Windows) into projection_provider_api_keys.
// key_cipher; the clear text exists only in memory, only to start a provider process (as its environment variable) or
// to test the connection. Nothing about a key goes into the event log, so this store writes with plain SQL, not with
// `dispatch`. Every read API carries only a mask (the last 4 characters) and a state.

import {
  API_KEY_PROVIDERS,
  type ApiKeyEntry,
  type ApiKeyProvider,
  type ApiKeyStatus,
  isApiKeyProvider,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { ApiKeySource } from "./api-key-env";
import type { OpenBotDatabase } from "./openbot-database";
import type { SecretBox } from "./vault-store";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_provider_api_keys (
    provider TEXT PRIMARY KEY,
    key_cipher TEXT NOT NULL,
    key_mask TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    checked_at TEXT,
    updated_at TEXT NOT NULL
  );
`;

const ENV_NAMES: Record<ApiKeyProvider, "OPENAI_API_KEY" | "ANTHROPIC_API_KEY"> = {
  codex: "OPENAI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
};
const PROVIDER_NAMES: Record<ApiKeyProvider, string> = { codex: "OpenAI", claude: "Anthropic" };
/** Fixed in code. Never an address from the person or an agent. */
const CHECK_URLS: Record<ApiKeyProvider, string> = {
  codex: "https://api.openai.com/v1/models",
  claude: "https://api.anthropic.com/v1/models",
};
const CHECK_TIMEOUT_MS = 15_000;
const MASK = "••••";
const NO_ENCRYPTION =
  "This computer cannot encrypt the key (Windows data protection is not available), so it was not saved.";

export interface ApiKeyStoreOptions {
  /** Tests give a fake; the app uses the global fetch. */
  fetch?: typeof fetch;
  now?: () => Date;
}

interface Row {
  provider: ApiKeyProvider;
  keyCipher: string;
  keyMask: string;
  status: ApiKeyStatus;
  message: string | null;
  checkedAt: string | null;
  updatedAt: string;
}

/** "••••1234"; a key shorter than 12 characters shows none of its characters. */
export function maskApiKey(key: string): string {
  return key.length >= 12 ? `${MASK}${key.slice(-4)}` : MASK;
}

export class ApiKeyStore implements ApiKeySource {
  readonly #database: OpenBotDatabase;
  readonly #box: SecretBox;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  /** Counts saves per provider, so a check that finishes after a replacement does not mark the new key. */
  readonly #versions = new Map<ApiKeyProvider, number>();

  constructor(database: OpenBotDatabase, box: SecretBox, options: ApiKeyStoreOptions = {}) {
    this.#database = database;
    this.#box = box;
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
    this.#now = options.now ?? (() => new Date());
    database.connection.exec(SCHEMA);
  }

  /** One entry per provider, in the order of API_KEY_PROVIDERS. */
  list(): ApiKeyEntry[] {
    return API_KEY_PROVIDERS.map((provider) => this.#entry(provider, this.#read(provider)));
  }

  set(provider: ApiKeyProvider, key: string): ApiKeyEntry {
    const clean = key.trim();
    if (!this.#box.canEncrypt()) throw new Error(NO_ENCRYPTION);
    let cipher: string;
    try {
      cipher = this.#box.encrypt(clean);
    } catch {
      // The reason from the system may quote its input; the person gets a fixed text.
      throw new Error("The key could not be encrypted, so it was not saved.");
    }
    const at = this.#iso();
    this.#database.connection
      .prepare(
        `INSERT INTO projection_provider_api_keys (provider, key_cipher, key_mask, status, message, checked_at, updated_at)
         VALUES (?, ?, ?, 'unchecked', NULL, NULL, ?)
         ON CONFLICT(provider) DO UPDATE SET key_cipher = excluded.key_cipher, key_mask = excluded.key_mask,
           status = 'unchecked', message = NULL, checked_at = NULL, updated_at = excluded.updated_at`,
      )
      .run(provider, cipher, maskApiKey(clean), at);
    this.#bump(provider);
    return this.#entry(provider, this.#read(provider));
  }

  remove(provider: ApiKeyProvider): ApiKeyEntry {
    this.#database.connection.prepare("DELETE FROM projection_provider_api_keys WHERE provider = ?").run(provider);
    this.#bump(provider);
    return this.#entry(provider, null);
  }

  /**
   * Asks the provider's own model list with the key. Only 401/403 mean "rejected"; a busy or unreachable provider
   * leaves the state "unchecked" with a reason. Call this only when the person clicked.
   */
  async check(provider: ApiKeyProvider): Promise<ApiKeyEntry> {
    const key = this.#plain(provider);
    if (!key) throw new Error(`There is no API key for ${PROVIDER_NAMES[provider]} to check.`);
    const version = this.#versions.get(provider) ?? 0;
    const headers: Record<string, string> =
      provider === "codex"
        ? { authorization: `Bearer ${key}`, accept: "application/json" }
        : { "x-api-key": key, "anthropic-version": "2023-06-01", accept: "application/json" };
    let status: ApiKeyStatus = "unchecked";
    let message: string;
    try {
      const response = await this.#fetch(CHECK_URLS[provider], {
        method: "GET",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      await response.body?.cancel().catch(() => undefined);
      if (response.ok) {
        status = "ok";
        message = `${PROVIDER_NAMES[provider]} accepted this key.`;
      } else if (response.status === 401 || response.status === 403) {
        status = "rejected";
        message = `${PROVIDER_NAMES[provider]} rejected this key. Check it or paste a new one.`;
      } else {
        message = `${PROVIDER_NAMES[provider]} answered ${response.status}, so the key could not be confirmed. Try again later.`;
      }
    } catch {
      message = `Could not reach ${PROVIDER_NAMES[provider]}. Check the connection and try again.`;
    }
    // The key may have been replaced or removed while the request ran: that answer is about an older key.
    if ((this.#versions.get(provider) ?? 0) === version && this.#read(provider)) {
      this.#database.connection
        .prepare("UPDATE projection_provider_api_keys SET status = ?, message = ?, checked_at = ? WHERE provider = ?")
        .run(status, message, this.#iso(), provider);
    }
    return this.#entry(provider, this.#read(provider));
  }

  /** The variable for the one provider process about to start; `{}` without a key or when it cannot be read. */
  env(provider: ApiKeyProvider): NodeJS.ProcessEnv {
    const key = this.#plain(provider);
    return key ? { [ENV_NAMES[provider]]: key } : {};
  }

  /** Every saved key in clear text. Only for finding it in a text to redact. */
  values(): string[] {
    return API_KEY_PROVIDERS.flatMap((provider) => {
      const key = this.#plain(provider);
      return key ? [key] : [];
    });
  }

  #plain(provider: ApiKeyProvider): string | null {
    const row = this.#read(provider);
    if (!row) return null;
    try {
      const key = this.#box.decrypt(row.keyCipher);
      return key || null;
    } catch {
      return null;
    }
  }

  #read(provider: ApiKeyProvider): Row | null {
    const raw = this.#database.connection
      .prepare(
        "SELECT provider, key_cipher, key_mask, status, message, checked_at, updated_at FROM projection_provider_api_keys WHERE provider = ?",
      )
      .get(provider);
    if (!isDynamicRecord(raw) || !isApiKeyProvider(raw.provider)) return null;
    if (!isString(raw.key_cipher) || !isString(raw.key_mask) || !isString(raw.updated_at)) return null;
    const status: ApiKeyStatus = raw.status === "ok" || raw.status === "rejected" ? raw.status : "unchecked";
    return {
      provider: raw.provider,
      keyCipher: raw.key_cipher,
      keyMask: raw.key_mask,
      status,
      message: isString(raw.message) ? raw.message : null,
      checkedAt: isString(raw.checked_at) ? raw.checked_at : null,
      updatedAt: raw.updated_at,
    };
  }

  #entry(provider: ApiKeyProvider, row: Row | null): ApiKeyEntry {
    return row
      ? {
          provider,
          maskedKey: row.keyMask,
          status: row.status,
          message: row.message,
          checkedAt: row.checkedAt,
          updatedAt: row.updatedAt,
        }
      : { provider, maskedKey: null, status: "unchecked", message: null, checkedAt: null, updatedAt: null };
  }

  #bump(provider: ApiKeyProvider): void {
    this.#versions.set(provider, (this.#versions.get(provider) ?? 0) + 1);
  }

  #iso(): string {
    return this.#now().toISOString();
  }
}
