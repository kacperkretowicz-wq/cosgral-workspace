// COSGRAL B1: a stand-in for the account service, for LOOPBACK use with a sandbox COPY of the program under inspection.
//
// The program asks for an account before it shows its main window, and it can be pointed at another account service on a
// loopback address (that is how it is meant to be developed). This stand-in answers on 127.0.0.1 only. It has no account of
// anybody: the one "person" is made up (probe@example.invalid), any "e-mail code" is accepted (the sign-in screen shows 23456789 as the development code), nothing is sent anywhere,
// nothing is kept, and a request for anything it does not know gets a plain "not found" and is written to the log, so the probe
// can see what the program wanted. It never talks to the outside.
//
//   node scripts/openbot-probe/stub-account-service.ts [--port 3199] [--log <file outside the repo>]
//   (start the program copy with OPENBOT_AUTH_API_URL=http://127.0.0.1:3199)
//
// SAFE BY DESIGN: it refuses to listen on anything but 127.0.0.1, and what it answers is only what a signed-in person who has
// nothing (no servers, no teams) would see.

import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";

const FAKE_USER = {
  id: "probe-user",
  email: "probe@example.invalid",
  name: null,
  avatarUrl: null,
  analyticsEnabled: false,
};
const CODE = "23456789";
const TOKEN = "probe-session-token";

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const port = Number(argument("port", "3199"));
const logFile = argument("log", "");

function note(line: string): void {
  const text = `${new Date().toISOString()} ${line}`;
  console.log(text);
  if (logFile) appendFileSync(logFile, `${text}\n`);
}

function respond(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  if (status === 204) {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function problem(code: string, message: string) {
  return { error: { code, message } };
}

async function readBody(request: import("node:http").IncomingMessage): Promise<DynamicRecord> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    return isDynamicRecord(value) ? value : {};
  } catch {
    return {};
  }
}

const signedIn = (authorization: string | undefined): boolean => authorization === `Bearer ${TOKEN}`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const route = `${request.method} ${url.pathname}`;
  note(`request ${route}`);
  if (route === "POST /v1/auth/email/start") {
    const now = Date.now();
    return respond(response, 200, {
      challengeId: "probe-challenge",
      expiresAt: now + 10 * 60_000,
      resendAt: now + 30_000,
      developmentCode: CODE,
    });
  }
  if (route === "POST /v1/auth/email/verify") {
    const body = await readBody(request);
    // The stand-in has no account to protect: any code of a plausible length opens the made-up person's session.
    if (isString(body.code) && body.code.length >= 4)
      return respond(response, 200, { sessionToken: TOKEN, user: FAKE_USER });
    return respond(response, 400, problem("invalid_code", "That code is not right."));
  }
  if (route === "GET /v1/me") {
    return signedIn(request.headers.authorization)
      ? respond(response, 200, FAKE_USER)
      : respond(response, 401, problem("unauthorized", "Sign in is required."));
  }
  if (route === "POST /v1/auth/logout") return respond(response, 204, null);
  // A person with nothing: no joined servers, no hosted servers, no remote hosts.
  if (route === "GET /v2/hosting/servers/")
    return signedIn(request.headers.authorization)
      ? respond(response, 200, { available: false, lifecycleAvailable: false, servers: [], maxServers: 0 })
      : respond(response, 401, problem("unauthorized", "Sign in is required."));
  if (route === "GET /v2/remote/hosts/")
    return signedIn(request.headers.authorization)
      ? respond(response, 200, { hosts: [] })
      : respond(response, 401, problem("unauthorized", "Sign in is required."));
  if (route === "GET /health/live") return respond(response, 200, { ok: true });
  note(`  not known: ${route}`);
  return respond(response, 404, problem("not_found", "This stand-in does not know that."));
});

server.listen(port, "127.0.0.1", () => note(`stand-in account service on http://127.0.0.1:${port} (code ${CODE})`));
