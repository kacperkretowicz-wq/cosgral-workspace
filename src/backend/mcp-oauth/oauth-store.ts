// COSGRAL W12-KK (1): the tokens and the client registration of the MCP sign-ins, ENCRYPTED with the program's safe (the same box as
// the Vault: DPAPI on Windows) in the database of the current space. One row per MCP server. A row that this computer cannot decrypt
// is treated as "signed out" and removed. Nothing here is ever returned by IPC; only the provider below reads it.

import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "../openbot-database";
import type { SecretBox } from "../vault-store";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_mcp_oauth (
    server_id TEXT PRIMARY KEY,
    client_enc TEXT,
    tokens_enc TEXT,
    tokens_saved_at INTEGER,
    updated_at TEXT NOT NULL
  );
`;

export interface StoredOAuth {
  client: OAuthClientInformationMixed | null;
  tokens: OAuthTokens | null;
  /** Milliseconds since 1970 when the tokens were saved (the answer's `expires_in` counts from then). */
  tokensSavedAt: number | null;
}

export class McpOAuthStore {
  readonly #database: OpenBotDatabase;
  readonly #box: SecretBox;
  readonly #now: () => Date;
  #ready = false;

  constructor(database: OpenBotDatabase, box: SecretBox, now: () => Date = () => new Date()) {
    this.#database = database;
    this.#box = box;
    this.#now = now;
  }

  read(serverId: string): StoredOAuth {
    const raw = this.#db().prepare("SELECT * FROM projection_mcp_oauth WHERE server_id = ?").get(serverId);
    if (!isDynamicRecord(raw)) return { client: null, tokens: null, tokensSavedAt: null };
    try {
      return {
        client: isString(raw.client_enc) ? JSON.parse(this.#box.decrypt(raw.client_enc)) : null,
        tokens: isString(raw.tokens_enc) ? JSON.parse(this.#box.decrypt(raw.tokens_enc)) : null,
        tokensSavedAt: isNumber(raw.tokens_saved_at) ? raw.tokens_saved_at : null,
      };
    } catch {
      this.clear(serverId);
      return { client: null, tokens: null, tokensSavedAt: null };
    }
  }

  writeClient(serverId: string, client: OAuthClientInformationMixed): void {
    this.#requireBox();
    this.#db()
      .prepare(
        `INSERT INTO projection_mcp_oauth (server_id, client_enc, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET client_enc = excluded.client_enc, updated_at = excluded.updated_at`,
      )
      .run(serverId, this.#box.encrypt(JSON.stringify(client)), this.#now().toISOString());
  }

  writeTokens(serverId: string, tokens: OAuthTokens): void {
    this.#requireBox();
    this.#db()
      .prepare(
        `INSERT INTO projection_mcp_oauth (server_id, tokens_enc, tokens_saved_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET tokens_enc = excluded.tokens_enc, tokens_saved_at = excluded.tokens_saved_at,
           updated_at = excluded.updated_at`,
      )
      .run(serverId, this.#box.encrypt(JSON.stringify(tokens)), this.#now().getTime(), this.#now().toISOString());
  }

  /** Forgets only the registration (a new sign-in registers again, because the loopback address changes). */
  clearClient(serverId: string): void {
    this.#db().prepare("UPDATE projection_mcp_oauth SET client_enc = NULL WHERE server_id = ?").run(serverId);
  }

  /** Forgets only the tokens (the server refused them for good); the registration stays. */
  clearTokens(serverId: string): void {
    this.#db()
      .prepare("UPDATE projection_mcp_oauth SET tokens_enc = NULL, tokens_saved_at = NULL WHERE server_id = ?")
      .run(serverId);
  }

  clear(serverId: string): void {
    this.#db().prepare("DELETE FROM projection_mcp_oauth WHERE server_id = ?").run(serverId);
  }

  serverIdsWithTokens(): string[] {
    return this.#db()
      .prepare("SELECT server_id FROM projection_mcp_oauth WHERE tokens_enc IS NOT NULL")
      .all()
      .flatMap((row) => (isDynamicRecord(row) && isString(row.server_id) ? [row.server_id] : []));
  }

  #requireBox(): void {
    if (!this.#box.canEncrypt())
      throw new Error("This computer cannot encrypt secrets right now, so nothing was saved.");
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
