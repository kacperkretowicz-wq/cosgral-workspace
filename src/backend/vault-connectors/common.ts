// COSGRAL W11-KK (d): what the Vault connectors have in common: the failure type (always a fixed sentence), the port that runs a
// manager's command-line tool, the encrypted store of a connection, the source of logins that agents read, and the rule that decides
// which saved website may fill which page. No secret is ever put in an error, a status or a log line made here.

import {
  VAULT_CONNECTOR_ERROR_SENTENCES,
  type VaultConnectorErrorCode,
  type VaultConnectorId,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "../openbot-database";
import type { SecretBox } from "../vault-store";

/** A failure whose message is already the fixed sentence of its code. Never the manager's own text. */
export class ConnectorFailure extends Error {
  readonly code: VaultConnectorErrorCode;
  constructor(code: VaultConnectorErrorCode) {
    super(VAULT_CONNECTOR_ERROR_SENTENCES[code]);
    this.name = "ConnectorFailure";
    this.code = code;
  }
}

export function failureCode(error: unknown): VaultConnectorErrorCode {
  return error instanceof ConnectorFailure ? error.code : "unknown";
}

/**
 * Runs one command of a manager's tool with no shell. `env` is added to the tool's environment (that is where tokens go:
 * never in the arguments, which other processes can read). Rejects with anything; callers turn it into a `ConnectorFailure`.
 */
export type RunCli = (
  executable: string,
  args: readonly string[],
  options: { env?: Readonly<Record<string, string>>; signal?: AbortSignal },
) => Promise<string>;

/** A login an agent may use on a page: no secret value. */
export interface ConnectorLogin {
  id: string;
  title: string;
  username: string | null;
  hasOneTimePassword: boolean;
}

/** A login as the Vault screen lists it: no secret value. */
export interface ConnectorLoginListing {
  id: string;
  title: string;
  username: string | null;
  hosts: string[];
  hasOneTimePassword: boolean;
}

/** The host of a saved website ("https://login.example.test/x" and "example.test" both give a host); null when there is none. */
export function hostOfWebsite(url: string): string | null {
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);
    return parsed.hostname.length > 0 ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** What the agent tools read. A manager that is not connected answers `null`; secrets go to the browser only. */
export interface ConnectorLoginSource {
  readonly connector: VaultConnectorId;
  connected(): boolean;
  loginsFor(origin: string): Promise<ConnectorLogin[] | null>;
  /** Every login agents may use (for the Vault screen); null when not connected. */
  listAll(): Promise<ConnectorLoginListing[] | null>;
  secretFor(loginId: string, origin: string, kind: "password" | "otp"): Promise<string | null>;
}

export type AutofillRule = "anywhere" | "exact" | "never";

/**
 * Whether a saved website may fill the page at `origin`: only https pages; "exact" needs the same host, "anywhere" the same host
 * or a subdomain of the saved host (so `example.test` fills `login.example.test`, never `example.test.evil.test`); "never" no page.
 */
export function websiteMatchesOrigin(website: { url: string; autofill: AutofillRule }, origin: string): boolean {
  if (website.autofill === "never") return false;
  let page: URL;
  let saved: URL;
  try {
    page = new URL(origin);
    saved = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(website.url) ? website.url : `https://${website.url}`);
  } catch {
    return false;
  }
  if (page.protocol !== "https:" || saved.protocol !== "https:") return false;
  if (page.port !== saved.port) return false;
  const pageHost = page.hostname.toLowerCase();
  const savedHost = saved.hostname.toLowerCase();
  if (pageHost === savedHost) return true;
  return website.autofill === "anywhere" && pageHost.endsWith(`.${savedHost}`);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_vault_connectors (
    connector TEXT PRIMARY KEY,
    secret_enc TEXT NOT NULL,
    meta_json TEXT NOT NULL,
    connected_at TEXT NOT NULL
  );
`;

export interface ConnectorRecord {
  secret: string;
  /** Not secret: account id, server address. */
  meta: { accountId?: string | null; serverUrl?: string | null };
  connectedAt: string;
}

/** One encrypted record per connector in the database of the current space (the same box as the Vault: DPAPI on Windows). */
export class ConnectorStore {
  readonly #database: OpenBotDatabase;
  readonly #box: SecretBox;
  #ready = false;

  constructor(database: OpenBotDatabase, box: SecretBox) {
    this.#database = database;
    this.#box = box;
  }

  read(connector: VaultConnectorId): ConnectorRecord | null {
    const raw = this.#db().prepare("SELECT * FROM projection_vault_connectors WHERE connector = ?").get(connector);
    if (!isDynamicRecord(raw) || !isString(raw.secret_enc) || !isString(raw.meta_json) || !isString(raw.connected_at)) {
      return null;
    }
    try {
      const meta = JSON.parse(raw.meta_json);
      return {
        secret: this.#box.decrypt(raw.secret_enc),
        meta: {
          accountId: isDynamicRecord(meta) && isString(meta.accountId) ? meta.accountId : null,
          serverUrl: isDynamicRecord(meta) && isString(meta.serverUrl) ? meta.serverUrl : null,
        },
        connectedAt: raw.connected_at,
      };
    } catch {
      // A record this computer cannot read (another computer's key): treated as no connection and removed.
      this.clear(connector);
      return null;
    }
  }

  write(connector: VaultConnectorId, record: ConnectorRecord): void {
    if (!this.#box.canEncrypt()) {
      throw new Error("This computer cannot encrypt secrets right now, so nothing was saved.");
    }
    this.#db()
      .prepare(
        `INSERT INTO projection_vault_connectors (connector, secret_enc, meta_json, connected_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(connector) DO UPDATE SET secret_enc = excluded.secret_enc, meta_json = excluded.meta_json,
           connected_at = excluded.connected_at`,
      )
      .run(connector, this.#box.encrypt(record.secret), JSON.stringify(record.meta), record.connectedAt);
  }

  clear(connector: VaultConnectorId): void {
    this.#db().prepare("DELETE FROM projection_vault_connectors WHERE connector = ?").run(connector);
  }

  #db() {
    const connection = this.#database.connection;
    if (!this.#ready) {
      connection.exec(SCHEMA);
      this.#ready = true;
    }
    return connection;
  }
}
