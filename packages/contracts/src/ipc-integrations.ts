// COSGRAL W10-KK1: connecting the apps of an agency with an account sign-in (spec-w10.md 1A, W10-01 ... W10-06; decisions
// Q3, Q4, Q6). Four services (GitHub, Google, Notion, Meta), each its OWN MCP server entry (Q4) with the same
// "Connect account" way: the person's system browser opens the service's sign-in page, the service sends the browser back
// to this computer (a loopback address, Q3), the program swaps the one-time code for tokens (PKCE) and keeps the tokens
// ENCRYPTED on this computer (the same safe the Vault and the MCP secrets use). After that an MCP entry exists and the
// agents that have it switched on can use its tools. Disconnecting removes the entry and the tokens.
//
// WHAT NEVER HAPPENS: a password, a code, a token or a client secret is never asked for in an agent's chat, never put in
// the repo, a log, an event, an error message or an answer of this API. The API only says "connected", "waiting",
// "failed because ..." in plain words. The apps (a GitHub App, a Google OAuth client, a Notion integration, a Meta app)
// are registered by the OWNER with the service; the program only keeps the public client id (and a secret, write-only,
// where the service insists on one).
//
// SPACES: the integrations belong to the space the program runs on (ipc-spaces.ts). A client space has its own list of
// connected accounts in its own database, so client A's sign-in is never used for client B. Inside a space the person can
// also narrow which tools of a service the agents may call (`toolAllowlist`; null = all of them).
//
// Everything here is about THIS computer only (a phone or a remote server may not call it).

import { isBoolean, isDynamicRecord, isNumber, isString } from "./runtime-values";

export const INTEGRATION_SERVICES = ["github", "google", "notion", "meta"] as const;
export type IntegrationService = (typeof INTEGRATION_SERVICES)[number];

/**
 * not-configured: the app's client id is not set yet (the owner registers the app first).
 * disconnected: ready to connect.
 * waiting-for-browser: the sign-in page is open; the program waits for the browser to come back (a limited time).
 * connected: signed in, the MCP entry exists.
 * failed: the last try did not work (`reason` says why in plain words); it can be tried again.
 * needs-login: it was connected, but the service refused the saved sign-in (expired or revoked); connect again.
 */
export const INTEGRATION_PHASES = [
  "not-configured",
  "disconnected",
  "waiting-for-browser",
  "connected",
  "failed",
  "needs-login",
] as const;
export type IntegrationPhase = (typeof INTEGRATION_PHASES)[number];

export const INTEGRATION_LIMITS = {
  clientId: 300,
  clientSecret: 500,
  scope: 300,
  scopes: 30,
  toolName: 64,
  tools: 200,
  /** Seconds the program waits for the browser to come back before the try fails. */
  waitSeconds: 300,
  /** Loopback ports below this are the system's. */
  minPort: 1024,
} as const;

/** What is the same for everybody about a service (the sign-in and token addresses are the engine's). */
export interface IntegrationInfo {
  service: IntegrationService;
  label: string;
  /** Scopes asked at sign-in by default: read-only. The person can change them in `configure`. */
  defaultScopes: string[];
  /** The service insists on a client secret next to the client id (kept encrypted, never shown again). */
  needsClientSecret: boolean;
  /** Short steps the OWNER does at the service before connecting (in English, as the window shows them). */
  ownerSteps: string[];
}

export const INTEGRATION_INFO: Record<IntegrationService, IntegrationInfo> = {
  github: {
    service: "github",
    label: "GitHub",
    defaultScopes: [],
    needsClientSecret: false,
    ownerSteps: [
      "Register a GitHub App (not a personal token) and give it only the read permissions you need.",
      "Add the callback address shown below (a loopback address of this computer) to the app.",
      "Copy the app's client id here.",
    ],
  },
  google: {
    service: "google",
    label: "Google Workspace",
    defaultScopes: ["openid", "email"],
    needsClientSecret: true,
    ownerSteps: [
      "Create an OAuth client of the type Desktop app in a Google Cloud project and turn on the APIs you need.",
      "Choose read-only scopes first; raise them here only when you must.",
      "Copy the client id and the client secret here.",
    ],
  },
  notion: {
    service: "notion",
    label: "Notion",
    defaultScopes: [],
    needsClientSecret: true,
    ownerSteps: [
      "Create a public Notion integration and choose only the capabilities you need (read first).",
      "Add the callback address shown below, with a fixed port, to the integration.",
      "Copy the client id and the client secret here.",
    ],
  },
  meta: {
    service: "meta",
    label: "Meta",
    defaultScopes: ["public_profile"],
    needsClientSecret: true,
    ownerSteps: [
      "Create a Meta app and add the sign-in product; the app needs review for most permissions.",
      "Add the callback address shown below, with a fixed port, to the app.",
      "Copy the app id and the app secret here.",
    ],
  },
};

export interface IntegrationStatus {
  service: IntegrationService;
  label: string;
  phase: IntegrationPhase;
  /** A plain sentence for `failed` and `needs-login` (and a hint for `not-configured`); never a secret. */
  reason: string | null;
  /** When it was connected; null if it is not. */
  connectedAt: string | null;
  /** While `waiting-for-browser`: when the try gives up (ISO time). */
  waitingUntil: string | null;
  /** While `waiting-for-browser`: the sign-in address, for a person whose browser did not open. It holds no secret. */
  signInUrl: string | null;
  /** The MCP entry of this service while connected (agents switch it on per agent as for any MCP server). */
  mcpServerName: string | null;
  /** The scopes of the sign-in. */
  scopes: string[];
  /** The tools agents may call; null = all tools of the service. */
  toolAllowlist: string[] | null;
}

export interface IntegrationList {
  /** The space the program runs on (the accounts listed belong to it). */
  spaceId: string;
  services: IntegrationStatus[];
}

export interface IntegrationDescription extends IntegrationInfo {
  /** The shape of the callback address to register: always a loopback address of this computer. */
  callbackExample: string;
  /** Where the tokens are kept. */
  tokenStorage: "encrypted-on-this-computer";
  /** The sign-in uses PKCE (a one-time proof only this program knows). */
  pkce: true;
  /** The address of the service's MCP endpoint; null = the owner must give it (no hosted endpoint is assumed). */
  mcpUrl: string | null;
  clientIdSet: boolean;
  clientSecretSet: boolean;
  /** A fixed callback port, or null = any free port. */
  redirectPort: number | null;
}

export interface IntegrationServiceInput {
  service: IntegrationService;
}

export interface ConfigureIntegrationInput extends IntegrationServiceInput {
  /** Public. Empty after trimming is refused. */
  clientId?: string;
  /** Write-only: `null` removes the saved secret, omitted keeps it. It is never returned. */
  clientSecret?: string | null;
  /** The service's MCP endpoint (https, or a loopback address for a lab); null = use the known one. */
  mcpUrl?: string | null;
  /** A fixed callback port (1024-65535) for services that need an exact address; null = any free port. */
  redirectPort?: number | null;
  /** Scopes asked at sign-in. */
  scopes?: string[];
  /** The tools agents may call; null = all. */
  toolAllowlist?: string[] | null;
}

export interface DisconnectIntegrationInput extends IntegrationServiceInput {
  /** Also forget the client id and secret (else only the sign-in and the MCP entry go). */
  forgetClient: boolean;
}

export interface IntegrationsDesktopApi {
  list: () => Promise<IntegrationList>;
  describe: (input: IntegrationServiceInput) => Promise<IntegrationDescription>;
  status: (input: IntegrationServiceInput) => Promise<IntegrationStatus>;
  /** Saves the app's client id (and secret) and the options. Changes no sign-in. */
  configure: (input: ConfigureIntegrationInput) => Promise<IntegrationList>;
  /** Opens the sign-in in the system browser and answers at once with `waiting-for-browser`; the end comes as an event. */
  connect: (input: IntegrationServiceInput) => Promise<IntegrationStatus>;
  /** Stops a try that waits for the browser. */
  cancel: (input: IntegrationServiceInput) => Promise<IntegrationStatus>;
  /** Removes the MCP entry and the saved tokens. Always removes the tokens: nothing is left behind. */
  disconnect: (input: DisconnectIntegrationInput) => Promise<IntegrationList>;
}

/** Event `integrations-changed`: the whole list. */
export interface IntegrationsChanged extends IntegrationList {}

// --- rules shared by the engine and the mock ---

const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/** An MCP address the program may talk to with a token: https, or http on this computer (a lab or a test). */
export function isAllowedMcpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

/** The MCP server name of a service: `github`, `google`, `notion`, `meta` (the tools become `mcp_github` ...). */
export function integrationServerName(service: IntegrationService): string {
  return service;
}

export function integrationCallbackExample(port: number | null): string {
  return `http://127.0.0.1:${port ?? "<a free port>"}/callback`;
}

/** The status of a service nothing is saved for. */
export function emptyIntegrationStatus(service: IntegrationService, configured: boolean): IntegrationStatus {
  return {
    service,
    label: INTEGRATION_INFO[service].label,
    phase: configured ? "disconnected" : "not-configured",
    reason: configured
      ? null
      : "The app's client id is not set yet. Register the app with the service and enter its client id.",
    connectedAt: null,
    waitingUntil: null,
    signInUrl: null,
    mcpServerName: null,
    scopes: [...INTEGRATION_INFO[service].defaultScopes],
    toolAllowlist: null,
  };
}

// --- guards and parsers ---

function isService(value: unknown): value is IntegrationService {
  return INTEGRATION_SERVICES.some((service) => service === value);
}

export function isIntegrationStatus(value: unknown): value is IntegrationStatus {
  if (!isDynamicRecord(value)) return false;
  if (!(isService(value.service) && isString(value.label) && INTEGRATION_PHASES.some((phase) => phase === value.phase)))
    return false;
  const nullableString = (x: unknown) => x === null || isString(x);
  if (
    !(
      nullableString(value.reason) &&
      nullableString(value.connectedAt) &&
      nullableString(value.waitingUntil) &&
      nullableString(value.signInUrl) &&
      nullableString(value.mcpServerName) &&
      Array.isArray(value.scopes) &&
      value.scopes.every(isString) &&
      (value.toolAllowlist === null || (Array.isArray(value.toolAllowlist) && value.toolAllowlist.every(isString)))
    )
  )
    return false;
  // The phase and the fields agree: a sign-in address and a deadline exist only while waiting; a connected service has a
  // time and an MCP entry; a failed one says why.
  const waiting = value.phase === "waiting-for-browser";
  if (waiting !== (value.waitingUntil !== null)) return false;
  if (!waiting && value.signInUrl !== null) return false;
  if (value.phase === "connected" && !(value.connectedAt !== null && value.mcpServerName !== null)) return false;
  if ((value.phase === "failed" || value.phase === "needs-login") && value.reason === null) return false;
  if (
    (value.phase === "not-configured" || value.phase === "disconnected") &&
    (value.mcpServerName !== null || value.connectedAt !== null)
  )
    return false;
  return true;
}

export function isIntegrationList(value: unknown): value is IntegrationList {
  if (!isDynamicRecord(value) || !isString(value.spaceId) || !Array.isArray(value.services)) return false;
  const services: unknown[] = value.services;
  if (!services.every(isIntegrationStatus)) return false;
  return new Set(services.map((entry) => (isIntegrationStatus(entry) ? entry.service : ""))).size === services.length;
}

export function isIntegrationsChanged(value: unknown): value is IntegrationsChanged & { type: "integrations-changed" } {
  return isDynamicRecord(value) && value.type === "integrations-changed" && isIntegrationList(value);
}

export function isIntegrationDescription(value: unknown): value is IntegrationDescription {
  if (!isDynamicRecord(value) || !isService(value.service)) return false;
  return (
    isString(value.label) &&
    Array.isArray(value.defaultScopes) &&
    isBoolean(value.needsClientSecret) &&
    Array.isArray(value.ownerSteps) &&
    isString(value.callbackExample) &&
    value.callbackExample.startsWith("http://127.0.0.1:") &&
    value.tokenStorage === "encrypted-on-this-computer" &&
    value.pkce === true &&
    (value.mcpUrl === null || isString(value.mcpUrl)) &&
    isBoolean(value.clientIdSet) &&
    isBoolean(value.clientSecretSet) &&
    (value.redirectPort === null || isNumber(value.redirectPort))
  );
}

function parseService(value: unknown): IntegrationService {
  if (!isService(value)) throw new Error(`The service is one of: ${INTEGRATION_SERVICES.join(", ")}.`);
  return value;
}

export function parseIntegrationServiceInput(input: unknown): IntegrationServiceInput {
  if (!isDynamicRecord(input)) throw new Error("The integration request is malformed.");
  return { service: parseService(input.service) };
}

function parseNameList(value: unknown, what: string, max: number, pattern: RegExp, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`The ${what} must be a list of at most ${max}.`);
  const out: string[] = [];
  for (const entry of value) {
    if (!isString(entry) || !pattern.test(entry) || entry.length > maxLength) {
      throw new Error(`"${isString(entry) ? entry.slice(0, 40) : "?"}" is not a valid ${what.replace(/s$/, "")}.`);
    }
    if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

export function parseConfigureIntegrationInput(input: unknown): ConfigureIntegrationInput {
  if (!isDynamicRecord(input)) throw new Error("The integration request is malformed.");
  const parsed: ConfigureIntegrationInput = { service: parseService(input.service) };
  if (input.clientId !== undefined) {
    const id = isString(input.clientId) ? input.clientId.trim() : "";
    if (id.length === 0 || id.length > INTEGRATION_LIMITS.clientId || /\s/.test(id)) {
      throw new Error("The client id is a single word of at most 300 characters.");
    }
    parsed.clientId = id;
  }
  if (input.clientSecret !== undefined) {
    if (
      input.clientSecret !== null &&
      !(
        isString(input.clientSecret) &&
        input.clientSecret.length > 0 &&
        input.clientSecret.length <= INTEGRATION_LIMITS.clientSecret
      )
    ) {
      throw new Error("The client secret is text of at most 500 characters, or null to remove it.");
    }
    parsed.clientSecret = input.clientSecret;
  }
  if (input.mcpUrl !== undefined) {
    if (input.mcpUrl !== null && !(isString(input.mcpUrl) && isAllowedMcpUrl(input.mcpUrl))) {
      throw new Error("The MCP address must be an https address (or http on this computer for a lab).");
    }
    parsed.mcpUrl = input.mcpUrl;
  }
  if (input.redirectPort !== undefined) {
    const port = input.redirectPort;
    if (
      port !== null &&
      !(isNumber(port) && Number.isInteger(port) && port >= INTEGRATION_LIMITS.minPort && port <= 65535)
    ) {
      throw new Error("A fixed callback port is a whole number from 1024 to 65535, or null for any free port.");
    }
    parsed.redirectPort = port;
  }
  if (input.scopes !== undefined) {
    parsed.scopes = parseNameList(
      input.scopes,
      "scopes",
      INTEGRATION_LIMITS.scopes,
      /^[^\s]+$/,
      INTEGRATION_LIMITS.scope,
    );
  }
  if (input.toolAllowlist !== undefined) {
    parsed.toolAllowlist =
      input.toolAllowlist === null
        ? null
        : parseNameList(input.toolAllowlist, "tools", INTEGRATION_LIMITS.tools, TOOL_NAME, INTEGRATION_LIMITS.toolName);
  }
  return parsed;
}

export function parseDisconnectIntegrationInput(input: unknown): DisconnectIntegrationInput {
  if (!isDynamicRecord(input)) throw new Error("The integration request is malformed.");
  if (!isBoolean(input.forgetClient))
    throw new Error("Say whether the client id and secret are forgotten too (true or false).");
  return { service: parseService(input.service), forgetClient: input.forgetClient };
}
