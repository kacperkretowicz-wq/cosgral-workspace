// COSGRAL W12-KK (1): the sign-in (OAuth) of MCP servers over http, in the program. The MCP SDK does the protocol (discovery, client
// registration, PKCE, the token exchange and renewal); this class owns what the SDK leaves to the application: the one-time loopback
// address, the system browser, the encrypted tokens, the status the window shows, and the reconnect of the server afterwards.
//
// The server list belongs to `McpManager`; this class only reads it and asks it to reconnect. `McpManager` asks `providerFor` for the
// provider of a normal connection (saved tokens only, never a browser). Nothing of a token, a code, a client secret or an address with
// a code is put in a status, an event, a log or an error: every failure is mapped to a code with a fixed sentence.

import { randomBytes } from "node:crypto";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  type AgentEvent,
  emptyMcpOAuthStatus,
  MCP_OAUTH_ERROR_SENTENCES,
  type McpOAuthErrorCode,
  type McpOAuthList,
  type McpOAuthStatus,
} from "@openbot/contracts/ipc";
import { isNumber } from "@openbot/contracts/runtime-values";
import { type CallbackServer, startCallbackServer } from "./loopback-callback";
import { McpOAuthProvider } from "./oauth-provider";
import type { McpOAuthStore } from "./oauth-store";

/** What the service needs of the MCP engine (the real `McpManager` fits; tests use a fake). */
export interface McpOAuthMcpPort {
  list(): Array<{ id: string; name: string; transport: "stdio" | "http"; url: string | null }>;
  reconnect(input: { serverId: string }): Promise<unknown>;
}

export interface McpOAuthServiceOptions {
  store: McpOAuthStore;
  mcp: McpOAuthMcpPort;
  emit: (event: AgentEvent) => void;
  /** Opens an address in the system browser (the program passes an https-only guard around `shell.openExternal`). */
  openBrowser: (url: string) => Promise<void>;
  now?: () => Date;
  /** For tests: how long the program waits for the browser. */
  waitMs?: number;
  /** For tests: the fetch of the protocol steps. */
  fetchFn?: FetchLike;
  /** For tests: the protocol function (default: the MCP SDK's `auth`). */
  authFn?: typeof auth;
}

interface Attempt {
  status: McpOAuthStatus;
  callback: CallbackServer | null;
}

/** The kind of failure from what the SDK threw (its text is never kept). */
function classify(error: unknown, phase: "start" | "exchange"): McpOAuthErrorCode {
  const text = error instanceof Error ? `${error.name} ${error.message}` : "";
  if (/registration|register/i.test(text)) return "registration-failed";
  if (/metadata|well-known|discover|resource|authorization server/i.test(text)) return "no-sign-in";
  return phase === "exchange" ? "exchange-failed" : "unknown";
}

export class McpOAuthService {
  readonly #options: McpOAuthServiceOptions;
  readonly #now: () => Date;
  readonly #attempts = new Map<string, Attempt>();

  constructor(options: McpOAuthServiceOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
  }

  /** One status per MCP server over http. Rows of servers that were removed are dropped. */
  list(): McpOAuthList {
    const servers = this.#options.mcp.list();
    for (const serverId of this.#options.store.serverIdsWithTokens()) {
      if (!servers.some((server) => server.id === serverId)) this.#options.store.clear(serverId);
    }
    return {
      statuses: servers
        .filter((server) => server.transport === "http")
        .map((server) => this.#status(server.id, server.name)),
    };
  }

  status(serverId: string): McpOAuthStatus {
    const server = this.#server(serverId);
    return this.#status(serverId, server.name);
  }

  /** The provider of a NORMAL connection: only when tokens are saved (a server without them keeps answering `needs-login`). */
  providerFor(serverId: string): OAuthClientProvider | undefined {
    if (this.#options.store.read(serverId).tokens === null) return undefined;
    return new McpOAuthProvider({ serverId, store: this.#options.store });
  }

  /** Starts a sign-in and answers `waiting-browser` at once; the end comes as `mcp-oauth-changed`. */
  async signIn(serverId: string): Promise<McpOAuthStatus> {
    const server = this.#server(serverId);
    this.#end(serverId);
    if (server.transport !== "http" || !server.url) return this.#fail(serverId, server.name, "not-http");
    // A new sign-in registers again: the one-time address changes with every attempt.
    this.#options.store.clearClient(serverId);
    const state = randomBytes(24).toString("hex");
    let callback: CallbackServer;
    try {
      callback = await startCallbackServer({ expectedState: state, timeoutMs: this.#options.waitMs });
    } catch {
      return this.#fail(serverId, server.name, "unknown");
    }
    const provider = new McpOAuthProvider({
      serverId,
      store: this.#options.store,
      redirectUrl: callback.redirectUrl,
      state,
      openBrowser: this.#options.openBrowser,
    });
    const status = this.#set(
      serverId,
      server.name,
      { state: "waiting-browser", error: null, errorCode: null, tokenExpiresAt: null },
      callback,
    );
    void this.#run(serverId, server.name, server.url, provider, callback);
    return status;
  }

  cancel(serverId: string): McpOAuthStatus {
    const server = this.#server(serverId);
    if (this.#attempts.get(serverId)?.status.state !== "waiting-browser") return this.#status(serverId, server.name);
    this.#end(serverId);
    this.#attempts.delete(serverId);
    this.#publish();
    return this.#status(serverId, server.name);
  }

  /** Forgets the tokens and the registration; the server goes back to `needs-login`. Nothing is revoked at the service. */
  async signOut(serverId: string): Promise<McpOAuthStatus> {
    const server = this.#server(serverId);
    this.#end(serverId);
    this.#attempts.delete(serverId);
    this.#options.store.clear(serverId);
    this.#publish();
    await this.#options.mcp.reconnect({ serverId }).catch(() => undefined);
    return this.#status(serverId, server.name);
  }

  dispose(): void {
    for (const serverId of [...this.#attempts.keys()]) this.#end(serverId);
    this.#attempts.clear();
  }

  // --- internals ---

  async #run(
    serverId: string,
    name: string,
    url: string,
    provider: McpOAuthProvider,
    callback: CallbackServer,
  ): Promise<void> {
    const protocol = this.#options.authFn ?? auth;
    const fetchFn = this.#options.fetchFn;
    const mine = () => this.#attempts.get(serverId)?.callback === callback;
    let phase: "start" | "exchange" = "start";
    try {
      const first = await protocol(provider, { serverUrl: url, ...(fetchFn ? { fetchFn } : {}) });
      if (!mine()) return;
      if (first !== "AUTHORIZED") {
        const outcome = await callback.result;
        if (!mine()) return;
        if (outcome.kind !== "code") {
          if (outcome.kind === "closed") return;
          this.#fail(
            serverId,
            name,
            outcome.kind === "denied" ? "denied" : outcome.kind === "timeout" ? "timeout" : "state-mismatch",
          );
          return;
        }
        this.#set(serverId, name, { state: "exchanging" }, callback);
        phase = "exchange";
        const second = await protocol(provider, {
          serverUrl: url,
          authorizationCode: outcome.code,
          ...(fetchFn ? { fetchFn } : {}),
        });
        if (second !== "AUTHORIZED") throw new Error("exchange");
      }
      if (!mine()) return;
      this.#attempts.delete(serverId);
      this.#publish();
      await this.#options.mcp.reconnect({ serverId }).catch(() => undefined);
    } catch (error) {
      if (mine()) this.#fail(serverId, name, classify(error, phase));
    } finally {
      callback.close();
    }
  }

  #server(serverId: string) {
    const server = this.#options.mcp.list().find((candidate) => candidate.id === serverId);
    if (!server) throw new Error("That server is not known.");
    return server;
  }

  #end(serverId: string): void {
    this.#attempts.get(serverId)?.callback?.close();
  }

  #status(serverId: string, name: string): McpOAuthStatus {
    const attempt = this.#attempts.get(serverId);
    if (attempt) return structuredClone(attempt.status);
    const stored = this.#options.store.read(serverId);
    if (stored.tokens === null) return emptyMcpOAuthStatus(serverId, name);
    const expiresIn = isNumber(stored.tokens.expires_in) ? stored.tokens.expires_in : null;
    return {
      ...emptyMcpOAuthStatus(serverId, name),
      state: "signed-in",
      tokenExpiresAt:
        expiresIn !== null && stored.tokensSavedAt !== null
          ? new Date(stored.tokensSavedAt + expiresIn * 1_000).toISOString()
          : null,
    };
  }

  #set(
    serverId: string,
    name: string,
    change: Partial<McpOAuthStatus>,
    callback: CallbackServer | null,
  ): McpOAuthStatus {
    const previous = this.#attempts.get(serverId)?.status ?? emptyMcpOAuthStatus(serverId, name);
    const status: McpOAuthStatus = { ...previous, serverName: name, ...change, since: this.#now().toISOString() };
    this.#attempts.set(serverId, { status, callback: callback ?? this.#attempts.get(serverId)?.callback ?? null });
    this.#publish();
    return structuredClone(status);
  }

  #fail(serverId: string, name: string, code: McpOAuthErrorCode): McpOAuthStatus {
    return this.#set(
      serverId,
      name,
      { state: "failed", error: MCP_OAUTH_ERROR_SENTENCES[code], errorCode: code },
      null,
    );
  }

  #publish(): void {
    this.#options.emit({ type: "mcp-oauth-changed", ...this.list() });
  }
}
