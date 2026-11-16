// COSGRAL W10-KK1: the sign-in of an app with OAuth, PKCE and a loopback callback (decision Q3). No Electron here, so the
// whole flow is tested against a mock server on this computer.
//
// THE FLOW. 1) A one-time secret (the verifier) and its public fingerprint (the challenge, S256) and a random `state` are
// made. 2) A tiny web server starts on 127.0.0.1 (a fixed port when the service needs an exact address, else any free
// port). 3) The sign-in address is handed to `openBrowser` (the system browser). 4) The service sends the browser back to
// `http://127.0.0.1:<port>/callback?code=...&state=...`; the server takes it ONCE, checks the state and shuts down. 5) The
// code is swapped for tokens at the service, with the verifier. Only the program that made the verifier can finish it, so a
// code stolen on the way is worthless.
//
// WHAT IT REFUSES. A callback with a wrong state, a wrong path, another method, or another Host header (a web page trying to
// reach the loopback server through a rebound name) is answered with an error and IGNORED: it neither completes nor aborts the
// sign-in. The first valid callback ends the server; nothing else is ever served. The page it shows says only that the
// sign-in is finished: it never echoes what the address carried.
//
// WHAT IT NEVER DOES. It never logs or returns a code, a verifier, a token or the body the service answered: a failure is
// one of the fixed sentences below, or a short plain one made here.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";

export interface OAuthEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  /** Where the client id and secret go in the token request: the body (most services) or a Basic header (Notion). */
  tokenAuth: "body" | "basic";
  /** Extra fixed parameters of the sign-in address (for example Google's offline access); names and values, in order. */
  authorizeParams: ReadonlyArray<readonly [string, string]>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  /** When the access token ends (Unix milliseconds); null when the service did not say. */
  expiresAtMs: number | null;
  scope: string | null;
}

/** A failure the person can read. `needsLogin`: the saved sign-in is dead (refused refresh), not a passing problem. */
export class OAuthFailure extends Error {
  readonly needsLogin: boolean;
  constructor(message: string, needsLogin = false) {
    super(message);
    this.name = "OAuthFailure";
    this.needsLogin = needsLogin;
  }
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string | null;
}

export interface OAuthRunOptions {
  endpoints: OAuthEndpoints;
  client: OAuthClient;
  scopes: readonly string[];
  /** A fixed callback port, or null for any free port. */
  redirectPort: number | null;
  /** Hands the sign-in address to the system browser. */
  openBrowser: (url: string) => Promise<void>;
  /** Tells the caller the address and the time the try gives up, as soon as the server listens. */
  onWaiting: (info: { signInUrl: string; waitingUntilMs: number }) => void;
  timeoutMs: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: (bytes: number) => Buffer;
}

const CALLBACK_PATH = "/callback";
const MAX_TOKEN_BODY = 64 * 1024;
const TOKEN_TIMEOUT_MS = 15_000;

/** Sentences for the error codes services send back to the callback and the token endpoint. Anything else is generic. */
const ERROR_SENTENCES: ReadonlyArray<readonly [string, string]> = [
  ["access_denied", "The access was not allowed on the sign-in page."],
  ["invalid_client", "The service does not accept this app's client id or secret. Check them in the settings."],
  [
    "invalid_grant",
    "The service refused the sign-in code or the saved sign-in (it may have expired or been used already).",
  ],
  ["unauthorized_client", "The service does not allow this app to sign in this way."],
  ["invalid_scope", "The service does not accept the requested permissions."],
  [
    "redirect_uri_mismatch",
    "The callback address is not registered for this app. Register the address shown in the settings.",
  ],
  ["server_error", "The service had an error. Try again later."],
  ["temporarily_unavailable", "The service is busy. Try again later."],
];

function sentenceFor(code: unknown, fallback: string): string {
  const found = isString(code) ? ERROR_SENTENCES.find(([known]) => known === code) : undefined;
  return found ? found[1] : fallback;
}

export function base64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A verifier (43 characters of 32 random bytes) and its S256 challenge. */
export function createPkce(random: (bytes: number) => Buffer = randomBytes): { verifier: string; challenge: string } {
  const verifier = base64Url(random(32));
  return { verifier, challenge: base64Url(createHash("sha256").update(verifier).digest()) };
}

export function createState(random: (bytes: number) => Buffer = randomBytes): string {
  return base64Url(random(24));
}

export function buildSignInUrl(input: {
  endpoints: OAuthEndpoints;
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  challenge: string;
}): string {
  const url = new URL(input.endpoints.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  if (input.scopes.length > 0) url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  for (const [name, value] of input.endpoints.authorizeParams) url.searchParams.set(name, value);
  return url.toString();
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const FINISHED_PAGE =
  '<!doctype html><meta charset="utf-8"><title>COSGRAL Workspace</title><body style="font-family:system-ui;margin:3rem">' +
  "<h1>You can close this window</h1><p>Go back to COSGRAL Workspace.</p>";
const FAILED_PAGE =
  '<!doctype html><meta charset="utf-8"><title>COSGRAL Workspace</title><body style="font-family:system-ui;margin:3rem">' +
  "<h1>The sign-in did not finish</h1><p>Go back to COSGRAL Workspace for the reason.</p>";

function reply(response: ServerResponse, status: number, page: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    "X-Content-Type-Options": "nosniff",
    Connection: "close",
  });
  response.end(page);
}

/** What the loopback server decided about one request. */
type CallbackVerdict = { kind: "ignore" } | { kind: "code"; code: string } | { kind: "failed"; reason: string };

function judgeCallback(request: IncomingMessage, port: number, state: string): CallbackVerdict {
  if (request.method !== "GET") return { kind: "ignore" };
  if (request.headers.host !== `127.0.0.1:${port}`) return { kind: "ignore" };
  let url: URL;
  try {
    url = new URL(request.url ?? "", `http://127.0.0.1:${port}`);
  } catch {
    return { kind: "ignore" };
  }
  if (url.pathname !== CALLBACK_PATH) return { kind: "ignore" };
  const given = url.searchParams.get("state");
  if (given === null || !sameText(given, state)) return { kind: "ignore" };
  const error = url.searchParams.get("error");
  if (error !== null) return { kind: "failed", reason: sentenceFor(error, "The service did not allow the sign-in.") };
  const code = url.searchParams.get("code");
  if (code === null || code.length === 0 || code.length > 4_000) {
    return { kind: "failed", reason: "The service came back without a sign-in code." };
  }
  return { kind: "code", code };
}

/** The port a server listens on; null while it does not (the address of a TCP server is an object, never a string here). */
function listeningPort(server: Server): number | null {
  const address = server.address();
  return isDynamicRecord(address) && isNumber(address.port) ? address.port : null;
}

/** Runs the server until the first valid callback; resolves with the code. Rejects with an OAuthFailure. */
function waitForCode(options: {
  port: number | null;
  state: string;
  timeoutMs: number;
  signal: AbortSignal | undefined;
  onListening: (port: number) => Promise<void> | void;
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let finished = false;
    let timer: NodeJS.Timeout | null = null;
    const server: Server = createServer();
    const finish = (settle: () => void) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      server.close();
      server.closeAllConnections();
      settle();
    };
    const onAbort = () => finish(() => reject(new OAuthFailure("The sign-in was cancelled.")));
    server.on("error", (error: NodeJS.ErrnoException) => {
      const reason =
        error.code === "EADDRINUSE"
          ? `Port ${options.port ?? "?"} is already in use by another program. Free it or choose another callback port.`
          : "The program could not listen for the sign-in to come back.";
      finish(() => reject(new OAuthFailure(reason)));
    });
    server.on("request", (request: IncomingMessage, response: ServerResponse) => {
      const verdict = judgeCallback(request, listeningPort(server) ?? 0, options.state);
      if (verdict.kind === "ignore") {
        reply(response, 404, FAILED_PAGE);
        return;
      }
      if (verdict.kind === "failed") {
        reply(response, 400, FAILED_PAGE);
        const reason = verdict.reason;
        finish(() => reject(new OAuthFailure(reason)));
        return;
      }
      reply(response, 200, FINISHED_PAGE);
      const code = verdict.code;
      finish(() => resolve(code));
    });
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      const listening = listeningPort(server);
      if (listening === null) {
        finish(() => reject(new OAuthFailure("The program could not listen for the sign-in to come back.")));
        return;
      }
      timer = setTimeout(
        () => finish(() => reject(new OAuthFailure("The sign-in was not finished in time. Try again."))),
        options.timeoutMs,
      );
      timer.unref();
      if (options.signal?.aborted) {
        onAbort();
        return;
      }
      options.signal?.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(options.onListening(listening)).catch(() => {
        finish(() => reject(new OAuthFailure("The browser could not be opened. Open the sign-in address by hand.")));
      });
    });
  });
}

async function readBody(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > MAX_TOKEN_BODY ? "" : text;
}

/** The answer of a token endpoint: JSON, or (GitHub without the Accept header) a form body. Never returned to the person. */
function parseTokenAnswer(text: string): ReadonlyMap<string, unknown> {
  const out = new Map<string, unknown>();
  try {
    const parsed = JSON.parse(text);
    if (isDynamicRecord(parsed)) for (const [key, value] of Object.entries(parsed)) out.set(key, value);
    return out;
  } catch {
    for (const [key, value] of new URLSearchParams(text)) out.set(key, value);
    return out;
  }
}

async function postToken(
  endpoints: OAuthEndpoints,
  client: OAuthClient,
  form: URLSearchParams,
  fetchImpl: typeof fetch,
  now: () => number,
  refreshing: boolean,
): Promise<OAuthTokens> {
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  });
  if (endpoints.tokenAuth === "basic") {
    const pair = `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret ?? "")}`;
    headers.set("Authorization", `Basic ${Buffer.from(pair).toString("base64")}`);
  } else {
    form.set("client_id", client.clientId);
    if (client.clientSecret !== null) form.set("client_secret", client.clientSecret);
  }
  let response: Response;
  try {
    response = await fetchImpl(endpoints.tokenUrl, {
      method: "POST",
      headers,
      body: form.toString(),
      redirect: "error",
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch {
    throw new OAuthFailure(
      "The service could not be reached to finish the sign-in. Check the connection and try again.",
    );
  }
  const answer = parseTokenAnswer(await readBody(response));
  const errorCode = answer.get("error");
  if (!response.ok || errorCode !== undefined) {
    // A refused refresh (the token is revoked or expired) is a dead sign-in; a busy or broken service is only a bad moment.
    const dead = refreshing && (errorCode === "invalid_grant" || response.status === 400 || response.status === 401);
    throw new OAuthFailure(
      sentenceFor(errorCode, `The service refused the sign-in (answer ${response.status}).`),
      dead,
    );
  }
  const access = answer.get("access_token");
  const type = answer.get("token_type");
  if (!isString(access) || access.length === 0) throw new OAuthFailure("The service answered without an access token.");
  if (isString(type) && type.toLowerCase() !== "bearer")
    throw new OAuthFailure("The service sent a kind of token this program does not use.");
  const refresh = answer.get("refresh_token");
  const expires = answer.get("expires_in");
  const seconds = isNumber(expires) ? expires : isString(expires) && /^\d+$/.test(expires) ? Number(expires) : null;
  const scope = answer.get("scope");
  return {
    accessToken: access,
    refreshToken: isString(refresh) && refresh.length > 0 ? refresh : null,
    expiresAtMs: seconds !== null && seconds > 0 ? now() + seconds * 1000 : null,
    scope: isString(scope) && scope.length > 0 ? scope : null,
  };
}

/** The whole sign-in: start the server, open the browser, wait for the one callback, swap the code for tokens. */
export async function runAuthorization(options: OAuthRunOptions): Promise<OAuthTokens> {
  const random = options.random ?? randomBytes;
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
  const { verifier, challenge } = createPkce(random);
  const state = createState(random);
  let redirectUri = "";
  const code = await waitForCode({
    port: options.redirectPort,
    state,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    onListening: async (port) => {
      redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
      const signInUrl = buildSignInUrl({
        endpoints: options.endpoints,
        clientId: options.client.clientId,
        redirectUri,
        scopes: options.scopes,
        state,
        challenge,
      });
      options.onWaiting({ signInUrl, waitingUntilMs: now() + options.timeoutMs });
      try {
        await options.openBrowser(signInUrl);
      } catch {
        // The browser did not open: the address is in the status, the person opens it by hand and the try goes on waiting.
      }
    },
  });
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  return postToken(options.endpoints, options.client, form, fetchImpl, now, false);
}

/** A new access token from the saved refresh token. A refused one is `needsLogin`: the sign-in is dead. */
export async function refreshAccessToken(input: {
  endpoints: OAuthEndpoints;
  client: OAuthClient;
  refreshToken: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<OAuthTokens> {
  const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken });
  const tokens = await postToken(
    input.endpoints,
    input.client,
    form,
    input.fetchImpl ?? fetch,
    input.now ?? Date.now,
    true,
  );
  // Some services answer a refresh without a new refresh token: the old one stays valid.
  return { ...tokens, refreshToken: tokens.refreshToken ?? input.refreshToken };
}
