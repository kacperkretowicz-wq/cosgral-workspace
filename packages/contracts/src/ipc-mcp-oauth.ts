// COSGRAL W12-KK (1): sign-in (OAuth) to an MCP server over HTTP, in the program. Most plugins of the Marketplace "Apps" tab are of
// this kind (`link`): the server answers 401 until the person signs in on the service's own page.
//
// THE FLOW (the standard MCP authorization, with PKCE): the program finds the server's sign-in settings, registers itself as a client
// if the server allows it, opens the system browser at the service's page, waits for the browser to come back to a one-time address on
// THIS computer (127.0.0.1, random port, closed after the first answer or after 5 minutes), checks the `state`, trades the code for
// tokens, saves them ENCRYPTED, and reconnects the server (`needs-login` -> `available`). Tokens are refreshed by themselves; nothing
// of them (token, code, client secret, address with a code) is ever put in a status, an event, a log or an error. Only this computer.

import { isDynamicRecord, isOneOf, isString } from "./runtime-values";

/**
 * signed-out: no tokens saved for this server.
 * waiting-browser: the browser was opened; the program waits for the person to finish there (it can be cancelled).
 * exchanging: the browser came back; the program trades the code for tokens.
 * signed-in: tokens are saved (the server may still say `needs-login` for a moment until it reconnects).
 * failed: the last attempt ended; `errorCode` and `error` say why. Tokens saved before are kept when the attempt was a new one that failed.
 */
export const MCP_OAUTH_STATES = ["signed-out", "waiting-browser", "exchanging", "signed-in", "failed"] as const;
export type McpOAuthState = (typeof MCP_OAUTH_STATES)[number];

/**
 * not-http: only a server over http(s) signs in this way.
 * no-sign-in: the server does not offer a sign-in the program can use (no discovery document).
 * registration-failed: the server did not let the program register as a client.
 * denied: the person refused on the service's page.
 * timeout: nothing came back within 5 minutes.
 * state-mismatch: the answer did not belong to this attempt (it is ignored; the attempt ends).
 * exchange-failed: the code could not be traded for tokens.
 * unknown: anything else (the sentence is fixed, never the server's text).
 */
export const MCP_OAUTH_ERROR_CODES = [
  "not-http",
  "no-sign-in",
  "registration-failed",
  "denied",
  "timeout",
  "state-mismatch",
  "exchange-failed",
  "unknown",
] as const;
export type McpOAuthErrorCode = (typeof MCP_OAUTH_ERROR_CODES)[number];

export const MCP_OAUTH_LIMITS = {
  /** Seconds the program waits for the browser to come back. */
  waitSeconds: 300,
  /** The loopback path the browser returns to. */
  callbackPath: "/mcp-oauth/callback",
} as const;

export const MCP_OAUTH_ERROR_SENTENCES: Readonly<Record<McpOAuthErrorCode, string>> = {
  "not-http": "Only a server reached over the web can be signed in to this way.",
  "no-sign-in": "This server does not offer a sign-in the program can use.",
  "registration-failed": "The server did not let the program register for a sign-in.",
  denied: "The sign-in was refused on the service's page.",
  timeout: "The sign-in was not finished in time. Try again.",
  "state-mismatch": "That answer did not belong to this sign-in, so it was ignored. Try again.",
  "exchange-failed": "The sign-in could not be completed. Try again.",
  unknown: "Something went wrong with the sign-in. Try again.",
};

export interface McpOAuthStatus {
  serverId: string;
  serverName: string;
  state: McpOAuthState;
  /** When the current state began. */
  since: string | null;
  /** signed-in: when the access token expires (it is renewed by itself); null when the server gives none. */
  tokenExpiresAt: string | null;
  /** A fixed sentence for `failed`; never a token, a code or the server's text. */
  error: string | null;
  errorCode: McpOAuthErrorCode | null;
}

export interface McpOAuthList {
  statuses: McpOAuthStatus[];
}

export interface McpOAuthServerInput {
  serverId: string;
}

export interface McpOAuthDesktopApi {
  /** One status per MCP server over http. */
  list: () => Promise<McpOAuthList>;
  status: (input: McpOAuthServerInput) => Promise<McpOAuthStatus>;
  /** Opens the system browser at the service's page and answers `waiting-browser` at once; the end comes as `mcp-oauth-changed`. A new attempt replaces one that waits. */
  signIn: (input: McpOAuthServerInput) => Promise<McpOAuthStatus>;
  /** Stops an attempt that waits for the browser. */
  cancel: (input: McpOAuthServerInput) => Promise<McpOAuthStatus>;
  /** Forgets the tokens and the registration of this server; the server goes back to `needs-login`. Nothing is revoked at the service (the person does that there). */
  signOut: (input: McpOAuthServerInput) => Promise<McpOAuthStatus>;
}

/** Event `mcp-oauth-changed`: every status. */
export interface McpOAuthChanged extends McpOAuthList {}

// --- rules shared by the engine and the mock ---

export function emptyMcpOAuthStatus(serverId: string, serverName: string): McpOAuthStatus {
  return { serverId, serverName, state: "signed-out", since: null, tokenExpiresAt: null, error: null, errorCode: null };
}

// --- guards and parsers ---

export function isMcpOAuthStatus(value: unknown): value is McpOAuthStatus {
  if (
    !(
      isDynamicRecord(value) &&
      isString(value.serverId) &&
      value.serverId.length > 0 &&
      isString(value.serverName) &&
      isOneOf(MCP_OAUTH_STATES, value.state) &&
      (value.since === null || isString(value.since)) &&
      (value.tokenExpiresAt === null || isString(value.tokenExpiresAt)) &&
      (value.error === null || isString(value.error)) &&
      (value.errorCode === null || isOneOf(MCP_OAUTH_ERROR_CODES, value.errorCode))
    )
  )
    return false;
  if (value.state === "failed") return value.error !== null && value.errorCode !== null;
  return value.error === null && value.errorCode === null;
}

export function isMcpOAuthList(value: unknown): value is McpOAuthList {
  return isDynamicRecord(value) && Array.isArray(value.statuses) && value.statuses.every(isMcpOAuthStatus);
}

export function isMcpOAuthChanged(value: unknown): value is McpOAuthChanged & { type: "mcp-oauth-changed" } {
  return isDynamicRecord(value) && value.type === "mcp-oauth-changed" && isMcpOAuthList(value);
}

export function parseMcpOAuthServerInput(input: unknown): McpOAuthServerInput {
  if (
    !isDynamicRecord(input) ||
    !isString(input.serverId) ||
    input.serverId.length === 0 ||
    input.serverId.length > 200
  ) {
    throw new Error("Choose a server.");
  }
  return { serverId: input.serverId };
}
