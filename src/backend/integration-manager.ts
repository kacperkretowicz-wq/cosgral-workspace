// COSGRAL W10-KK1: the account sign-ins of the apps (contract: ipc-integrations.ts; the flow: oauth-pkce.ts).
//
// WHAT IT KEEPS, in the database of the space the program runs on (a client space is its own database, so client A's sign-in
// is never used for client B):
//   projection_integrations   one row per service: the app's client id (public), the client secret and the tokens ENCRYPTED with
//                             the program's safe (the same SecretBox the Vault and the MCP secrets use), the MCP address, the
//                             callback port, the scopes, the tool allowlist, the id of the MCP entry it made.
// WHAT IT DOES. `connect` starts the sign-in in the system browser and answers at once with the waiting phase; when the browser
// comes back the tokens are saved and an MCP entry of the service (`github`, `google`, `notion`, `meta`; transport http, an
// `Authorization: Bearer ...` header kept encrypted by the MCP store) is made, so the agents that have it on can use its tools.
// `disconnect` removes the entry and the tokens (always: nothing is left behind). Tokens that are about to end are renewed
// with the refresh token (`refreshDue`, called every minute); a refused renewal marks the service `needs-login` and keeps
// nothing dead. An MCP entry the person removed by hand is noticed (`reconcile`) and its tokens are removed too.
//
// WHAT IT NEVER DOES. It never returns, logs, emits or puts in an error a token, a code or a secret: every message that leaves
// is a fixed or plain sentence. It never asks for a password.

import {
  type AgentEvent,
  type ConfigureIntegrationInput,
  type DisconnectIntegrationInput,
  emptyIntegrationStatus,
  INTEGRATION_INFO,
  INTEGRATION_LIMITS,
  INTEGRATION_SERVICES,
  type IntegrationDescription,
  type IntegrationList,
  type IntegrationService,
  type IntegrationStatus,
  integrationCallbackExample,
  integrationServerName,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import {
  type OAuthClient,
  type OAuthEndpoints,
  OAuthFailure,
  type OAuthTokens,
  refreshAccessToken,
  runAuthorization,
} from "./oauth-pkce";
import type { OpenBotDatabase } from "./openbot-database";
import type { SecretBox } from "./vault-store";

/** The sign-in and token addresses of the services, from each service's public OAuth documentation (see the report). */
const ENDPOINTS: ReadonlyArray<readonly [IntegrationService, OAuthEndpoints]> = [
  [
    "github",
    {
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      tokenAuth: "body",
      authorizeParams: [],
    },
  ],
  [
    "google",
    {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      tokenAuth: "body",
      authorizeParams: [
        ["access_type", "offline"],
        ["prompt", "consent"],
      ],
    },
  ],
  [
    "notion",
    {
      authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      tokenAuth: "basic",
      authorizeParams: [["owner", "user"]],
    },
  ],
  [
    "meta",
    {
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
      tokenAuth: "body",
      authorizeParams: [],
    },
  ],
];

/** The hosted MCP endpoints the program knows of. `null`: none is assumed, the owner gives one. */
const DEFAULT_MCP_URLS: ReadonlyArray<readonly [IntegrationService, string | null]> = [
  ["github", "https://api.githubcopilot.com/mcp/"],
  ["google", null],
  ["notion", "https://mcp.notion.com/mcp"],
  ["meta", null],
];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_integrations (
    service TEXT PRIMARY KEY,
    client_id TEXT,
    client_secret_enc TEXT,
    mcp_url TEXT,
    redirect_port INTEGER,
    scopes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(scopes_json)),
    tool_allowlist_json TEXT CHECK(tool_allowlist_json IS NULL OR json_valid(tool_allowlist_json)),
    token_enc TEXT,
    token_expires_ms INTEGER,
    state TEXT NOT NULL DEFAULT 'idle',
    mcp_server_id TEXT,
    connected_at TEXT,
    reason TEXT
  );
`;

/** The part of the MCP manager this needs; `McpManager` has all of it. */
export interface IntegrationMcpPort {
  list(): Array<{ id: string; name: string; status: string }>;
  add(input: {
    name: string;
    transport: "http";
    url: string;
    secrets: { Authorization: string };
  }): Promise<{ id: string }>;
  update(input: { serverId: string; url?: string; secrets?: { Authorization: string } }): Promise<unknown>;
  remove(input: { serverId: string }): Promise<void>;
}

export interface IntegrationManagerOptions {
  database: OpenBotDatabase;
  box: SecretBox;
  mcp: IntegrationMcpPort;
  /** The space the program runs on. */
  spaceId: string;
  emit: (event: AgentEvent) => void;
  /** Hands the sign-in address to the system browser. */
  openBrowser: (url: string) => Promise<void>;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  /** Tests: the addresses of a mock service instead of the real ones. */
  endpointsFor?: (service: IntegrationService) => OAuthEndpoints;
  timeoutMs?: number;
  /** Renew a token this long before it ends. */
  renewBeforeMs?: number;
}

interface Row {
  clientId: string | null;
  clientSecret: string | null;
  mcpUrl: string | null;
  redirectPort: number | null;
  scopes: string[];
  toolAllowlist: string[] | null;
  tokens: StoredTokens | null;
  tokenExpiresMs: number | null;
  state: "idle" | "connected" | "needs-login";
  mcpServerId: string | null;
  connectedAt: string | null;
  reason: string | null;
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
}

interface Attempt {
  controller: AbortController;
  signInUrl: string | null;
  waitingUntilMs: number | null;
  failed: string | null;
  done: Promise<void>;
}

const NEEDS_LOGIN = "The service no longer accepts the saved sign-in. Connect again.";

export class IntegrationManager {
  readonly #options: IntegrationManagerOptions;
  readonly #now: () => Date;
  readonly #attempts = new Map<IntegrationService, Attempt>();
  #ready = false;

  constructor(options: IntegrationManagerOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
  }

  list(): IntegrationList {
    return { spaceId: this.#options.spaceId, services: INTEGRATION_SERVICES.map((service) => this.status(service)) };
  }

  status(service: IntegrationService): IntegrationStatus {
    const row = this.#row(service);
    const base = emptyIntegrationStatus(service, row.clientId !== null);
    const scopes = row.scopes.length > 0 ? row.scopes : base.scopes;
    const attempt = this.#attempts.get(service);
    if (attempt && attempt.failed === null) {
      return {
        ...base,
        scopes,
        toolAllowlist: row.toolAllowlist,
        phase: "waiting-for-browser",
        reason: null,
        waitingUntil: new Date(attempt.waitingUntilMs ?? this.#now().getTime() + this.#timeoutMs()).toISOString(),
        signInUrl: attempt.signInUrl,
      };
    }
    if (attempt?.failed) {
      return { ...base, scopes, toolAllowlist: row.toolAllowlist, phase: "failed", reason: attempt.failed };
    }
    if (row.state === "connected" || row.state === "needs-login") {
      const entry = this.#options.mcp.list().find((server) => server.id === row.mcpServerId);
      const refused = row.state === "needs-login" || entry?.status === "needs-login";
      return {
        ...base,
        scopes,
        toolAllowlist: row.toolAllowlist,
        phase: refused ? "needs-login" : "connected",
        reason: refused ? (row.reason ?? NEEDS_LOGIN) : null,
        connectedAt: refused ? null : row.connectedAt,
        mcpServerName: refused ? null : integrationServerName(service),
      };
    }
    return { ...base, scopes, toolAllowlist: row.toolAllowlist };
  }

  describe(service: IntegrationService): IntegrationDescription {
    const row = this.#row(service);
    return {
      ...INTEGRATION_INFO[service],
      defaultScopes: [...INTEGRATION_INFO[service].defaultScopes],
      callbackExample: integrationCallbackExample(row.redirectPort),
      tokenStorage: "encrypted-on-this-computer",
      pkce: true,
      mcpUrl: row.mcpUrl ?? this.#defaultMcpUrl(service),
      clientIdSet: row.clientId !== null,
      clientSecretSet: row.clientSecret !== null,
      redirectPort: row.redirectPort,
    };
  }

  configure(input: ConfigureIntegrationInput): IntegrationList {
    const row = this.#row(input.service);
    if (
      input.clientId !== undefined &&
      input.clientId !== row.clientId &&
      (row.state !== "idle" || this.#attempts.has(input.service))
    ) {
      throw new Error(
        "Disconnect this service before changing its client id: the saved sign-in belongs to the old one.",
      );
    }
    if (input.clientId !== undefined) row.clientId = input.clientId;
    if (input.clientSecret !== undefined) row.clientSecret = input.clientSecret;
    if (input.mcpUrl !== undefined) row.mcpUrl = input.mcpUrl;
    if (input.redirectPort !== undefined) row.redirectPort = input.redirectPort;
    if (input.scopes !== undefined) row.scopes = input.scopes;
    if (input.toolAllowlist !== undefined) row.toolAllowlist = input.toolAllowlist;
    this.#save(input.service, row);
    return this.#publish();
  }

  /** Starts the sign-in; answers once the program listens for the browser (the sign-in address is then in the status). */
  async connect(service: IntegrationService): Promise<IntegrationStatus> {
    const existing = this.#attempts.get(service);
    if (existing && existing.failed === null) return this.status(service);
    this.#attempts.delete(service);
    const row = this.#row(service);
    if (row.clientId === null) throw new Error("Set the app's client id first: the sign-in needs it.");
    if (INTEGRATION_INFO[service].needsClientSecret && row.clientSecret === null) {
      throw new Error(
        `${INTEGRATION_INFO[service].label} needs the app's client secret next to the client id. Enter it in the settings.`,
      );
    }
    const mcpUrl = row.mcpUrl ?? this.#defaultMcpUrl(service);
    if (mcpUrl === null) {
      throw new Error(
        `The MCP address of ${INTEGRATION_INFO[service].label} is not known. Enter it in the settings before connecting.`,
      );
    }
    const taken = this.#options.mcp.list().find((server) => server.name === integrationServerName(service));
    if (taken && taken.id !== row.mcpServerId) {
      throw new Error(
        `An MCP server named ${integrationServerName(service)} already exists. Rename or remove it first.`,
      );
    }
    const controller = new AbortController();
    let signal: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      signal = resolve;
    });
    const attempt: Attempt = {
      controller,
      signInUrl: null,
      waitingUntilMs: null,
      failed: null,
      done: Promise.resolve(),
    };
    this.#attempts.set(service, attempt);
    attempt.done = this.#run(service, row, mcpUrl, attempt, signal).finally(signal);
    await ready;
    this.#publish();
    return this.status(service);
  }

  cancel(service: IntegrationService): IntegrationStatus {
    const attempt = this.#attempts.get(service);
    if (attempt && attempt.failed === null) attempt.controller.abort();
    return this.status(service);
  }

  /** Removes the MCP entry and the saved tokens (always); the client id and secret too when asked. */
  async disconnect(input: DisconnectIntegrationInput): Promise<IntegrationList> {
    const attempt = this.#attempts.get(input.service);
    if (attempt) {
      attempt.controller.abort();
      await attempt.done.catch(() => undefined);
      this.#attempts.delete(input.service);
    }
    const row = this.#row(input.service);
    if (row.mcpServerId !== null) await this.#options.mcp.remove({ serverId: row.mcpServerId }).catch(() => undefined);
    row.tokens = null;
    row.tokenExpiresMs = null;
    row.state = "idle";
    row.mcpServerId = null;
    row.connectedAt = null;
    row.reason = null;
    if (input.forgetClient) {
      row.clientId = null;
      row.clientSecret = null;
      row.mcpUrl = null;
      row.redirectPort = null;
    }
    this.#save(input.service, row);
    return this.#publish();
  }

  /** At start: a connected service whose MCP entry is gone (the person removed it) loses its tokens too. */
  async reconcile(): Promise<void> {
    const present = new Set(this.#options.mcp.list().map((server) => server.id));
    let changed = false;
    for (const service of INTEGRATION_SERVICES) {
      const row = this.#row(service);
      if (
        (row.state === "connected" || row.state === "needs-login") &&
        (row.mcpServerId === null || !present.has(row.mcpServerId))
      ) {
        row.tokens = null;
        row.tokenExpiresMs = null;
        row.state = "idle";
        row.mcpServerId = null;
        row.connectedAt = null;
        row.reason = null;
        this.#save(service, row);
        changed = true;
      }
    }
    if (changed) this.#publish();
  }

  /** Renews the tokens that end soon. A refused renewal is a dead sign-in (needs-login), a bad moment is tried again next time. */
  async refreshDue(): Promise<void> {
    const limit = this.#now().getTime() + (this.#options.renewBeforeMs ?? 120_000);
    for (const service of INTEGRATION_SERVICES) {
      const row = this.#row(service);
      if (
        row.state !== "connected" ||
        row.tokens?.refreshToken == null ||
        row.tokenExpiresMs === null ||
        row.tokenExpiresMs > limit
      )
        continue;
      if (row.clientId === null || row.mcpServerId === null) continue;
      try {
        const tokens = await refreshAccessToken({
          endpoints: this.#endpoints(service),
          client: this.#client(row),
          refreshToken: row.tokens.refreshToken,
          fetchImpl: this.#options.fetchImpl,
          now: () => this.#now().getTime(),
        });
        await this.#options.mcp.update({
          serverId: row.mcpServerId,
          secrets: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        row.tokens = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
        row.tokenExpiresMs = tokens.expiresAtMs;
        this.#save(service, row);
      } catch (error) {
        if (error instanceof OAuthFailure && error.needsLogin) {
          row.tokens = null;
          row.tokenExpiresMs = null;
          row.state = "needs-login";
          row.reason = NEEDS_LOGIN;
          this.#save(service, row);
          this.#publish();
        }
      }
    }
  }

  /** May an agent call this tool of this MCP server? A server this does not manage, or without an allowlist, allows all. */
  toolAllowed(serverName: string, tool: string): boolean {
    const service = INTEGRATION_SERVICES.find((candidate) => integrationServerName(candidate) === serverName);
    if (service === undefined) return true;
    const row = this.#row(service);
    return row.mcpServerId === null || row.toolAllowlist === null || row.toolAllowlist.includes(tool);
  }

  /** Tests: resolves when the try of a service is over. */
  whenIdle(service: IntegrationService): Promise<void> {
    return this.#attempts.get(service)?.done ?? Promise.resolve();
  }

  // --- internals ---

  async #run(
    service: IntegrationService,
    row: Row,
    mcpUrl: string,
    attempt: Attempt,
    listening: () => void,
  ): Promise<void> {
    try {
      const tokens = await runAuthorization({
        endpoints: this.#endpoints(service),
        client: this.#client(row),
        scopes: row.scopes.length > 0 ? row.scopes : INTEGRATION_INFO[service].defaultScopes,
        redirectPort: row.redirectPort,
        openBrowser: this.#options.openBrowser,
        onWaiting: (info) => {
          attempt.signInUrl = info.signInUrl;
          attempt.waitingUntilMs = info.waitingUntilMs;
          listening();
        },
        timeoutMs: this.#timeoutMs(),
        signal: attempt.controller.signal,
        fetchImpl: this.#options.fetchImpl,
        now: () => this.#now().getTime(),
      });
      await this.#finish(service, tokens, mcpUrl);
      this.#attempts.delete(service);
    } catch (error) {
      attempt.failed =
        error instanceof OAuthFailure
          ? error.message
          : "The sign-in worked, but the program could not set up the MCP server. Nothing was saved.";
      attempt.signInUrl = null;
      attempt.waitingUntilMs = null;
      if (attempt.controller.signal.aborted) this.#attempts.delete(service);
    }
    this.#publish();
  }

  /** The tokens are saved and the MCP entry exists; if the entry cannot be made nothing is kept. */
  async #finish(service: IntegrationService, tokens: OAuthTokens, mcpUrl: string): Promise<void> {
    const row = this.#row(service);
    const header = { Authorization: `Bearer ${tokens.accessToken}` };
    let serverId = row.mcpServerId;
    const present = serverId !== null && this.#options.mcp.list().some((server) => server.id === serverId);
    if (serverId !== null && present) {
      await this.#options.mcp.update({ serverId, url: mcpUrl, secrets: header });
    } else {
      serverId = (
        await this.#options.mcp.add({
          name: integrationServerName(service),
          transport: "http",
          url: mcpUrl,
          secrets: header,
        })
      ).id;
    }
    row.tokens = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    row.tokenExpiresMs = tokens.expiresAtMs;
    row.state = "connected";
    row.mcpServerId = serverId;
    row.connectedAt = this.#now().toISOString();
    row.reason = null;
    this.#save(service, row);
  }

  #timeoutMs(): number {
    return this.#options.timeoutMs ?? INTEGRATION_LIMITS.waitSeconds * 1000;
  }

  #endpoints(service: IntegrationService): OAuthEndpoints {
    if (this.#options.endpointsFor) return this.#options.endpointsFor(service);
    const found = ENDPOINTS.find(([known]) => known === service);
    if (!found) throw new Error("This service does not exist.");
    return found[1];
  }

  #defaultMcpUrl(service: IntegrationService): string | null {
    return DEFAULT_MCP_URLS.find(([known]) => known === service)?.[1] ?? null;
  }

  #client(row: Row): OAuthClient {
    if (row.clientId === null) throw new Error("The app's client id is not set.");
    return { clientId: row.clientId, clientSecret: row.clientSecret };
  }

  #db() {
    const connection = this.#options.database.connection;
    if (!this.#ready) {
      connection.exec(SCHEMA);
      this.#ready = true;
    }
    return connection;
  }

  #row(service: IntegrationService): Row {
    const raw = this.#db().prepare("SELECT * FROM projection_integrations WHERE service = ?").get(service);
    const empty: Row = {
      clientId: null,
      clientSecret: null,
      mcpUrl: null,
      redirectPort: null,
      scopes: [],
      toolAllowlist: null,
      tokens: null,
      tokenExpiresMs: null,
      state: "idle",
      mcpServerId: null,
      connectedAt: null,
      reason: null,
    };
    if (!isDynamicRecord(raw)) return empty;
    const text = (value: unknown) => (isString(value) ? value : null);
    const decrypt = (value: unknown): string | null => {
      const cipher = text(value);
      if (cipher === null) return null;
      try {
        return this.#options.box.decrypt(cipher);
      } catch {
        return null;
      }
    };
    const list = (value: unknown): string[] | null => {
      const json = text(value);
      if (json === null) return null;
      try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) && parsed.every(isString) ? parsed : null;
      } catch {
        return null;
      }
    };
    return {
      clientId: text(raw.client_id),
      clientSecret: decrypt(raw.client_secret_enc),
      mcpUrl: text(raw.mcp_url),
      redirectPort: isNumber(raw.redirect_port) ? raw.redirect_port : null,
      scopes: list(raw.scopes_json) ?? [],
      toolAllowlist: list(raw.tool_allowlist_json),
      tokens: parseTokens(decrypt(raw.token_enc)),
      tokenExpiresMs: isNumber(raw.token_expires_ms) ? raw.token_expires_ms : null,
      state: raw.state === "connected" || raw.state === "needs-login" ? raw.state : "idle",
      mcpServerId: text(raw.mcp_server_id),
      connectedAt: text(raw.connected_at),
      reason: text(raw.reason),
    };
  }

  #save(service: IntegrationService, row: Row): void {
    const box = this.#options.box;
    this.#db()
      .prepare(
        `INSERT INTO projection_integrations
           (service, client_id, client_secret_enc, mcp_url, redirect_port, scopes_json, tool_allowlist_json, token_enc,
            token_expires_ms, state, mcp_server_id, connected_at, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(service) DO UPDATE SET
           client_id = excluded.client_id, client_secret_enc = excluded.client_secret_enc, mcp_url = excluded.mcp_url,
           redirect_port = excluded.redirect_port, scopes_json = excluded.scopes_json,
           tool_allowlist_json = excluded.tool_allowlist_json, token_enc = excluded.token_enc,
           token_expires_ms = excluded.token_expires_ms, state = excluded.state, mcp_server_id = excluded.mcp_server_id,
           connected_at = excluded.connected_at, reason = excluded.reason`,
      )
      .run(
        service,
        row.clientId,
        row.clientSecret === null ? null : box.encrypt(row.clientSecret),
        row.mcpUrl,
        row.redirectPort,
        JSON.stringify(row.scopes),
        row.toolAllowlist === null ? null : JSON.stringify(row.toolAllowlist),
        row.tokens === null ? null : box.encrypt(JSON.stringify(row.tokens)),
        row.tokenExpiresMs,
        row.state,
        row.mcpServerId,
        row.connectedAt,
        row.reason,
      );
  }

  #publish(): IntegrationList {
    const list = this.list();
    this.#options.emit({ type: "integrations-changed", ...list });
    return list;
  }
}

function parseTokens(json: string | null): StoredTokens | null {
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json);
    if (!isDynamicRecord(parsed) || !isString(parsed.accessToken)) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: isString(parsed.refreshToken) ? parsed.refreshToken : null,
    };
  } catch {
    return null;
  }
}
