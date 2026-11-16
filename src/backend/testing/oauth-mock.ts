// COSGRAL W10-KK1 (test support): a mock OAuth "service" on 127.0.0.1 (authorize address, token endpoint that checks PKCE) and a
// "browser" that follows the sign-in address back to the callback. No real account and no call outside this computer.

import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import type { OAuthEndpoints, OAuthRunOptions } from "../oauth-pkce";

export function portOf(server: Server): number {
  const address = server.address();
  if (!isDynamicRecord(address) || !isNumber(address.port)) throw new Error("no address");
  return address.port;
}

export interface Seen {
  path: string;
  authorization: string | undefined;
  contentType: string | undefined;
  form: URLSearchParams;
}

export class MockService {
  readonly seen: Seen[] = [];
  /** Answer of the token endpoint: status, body and content type. */
  answer: { status: number; body: string; type: string } | null = null;
  readonly #server: Server;
  #challenge = "";
  base = "";

  constructor() {
    this.#server = createServer((request, response) => {
      void this.#handle(request).then((out) => {
        response.writeHead(out.status, { "Content-Type": out.type });
        response.end(out.body);
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((done) => this.#server.listen(0, "127.0.0.1", done));
    this.base = `http://127.0.0.1:${portOf(this.#server)}`;
  }

  stop(): Promise<void> {
    this.#server.closeAllConnections();
    return new Promise((done) => this.#server.close(() => done()));
  }

  get endpoints(): OAuthEndpoints {
    return {
      authorizeUrl: `${this.base}/authorize`,
      tokenUrl: `${this.base}/token`,
      tokenAuth: "body",
      authorizeParams: [["access_type", "offline"]],
    };
  }

  rememberChallenge(challenge: string): void {
    this.#challenge = challenge;
  }

  async #handle(request: IncomingMessage): Promise<{ status: number; body: string; type: string }> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    this.seen.push({
      path: request.url ?? "",
      authorization: request.headers.authorization,
      contentType: request.headers["content-type"],
      form,
    });
    if (this.answer) return this.answer;
    if (form.get("grant_type") === "authorization_code") {
      const proof = createHash("sha256")
        .update(form.get("code_verifier") ?? "")
        .digest("base64url");
      if (proof !== this.#challenge)
        return { status: 400, body: JSON.stringify({ error: "invalid_grant" }), type: "application/json" };
      return {
        status: 200,
        type: "application/json",
        body: JSON.stringify({
          access_token: "access-1",
          refresh_token: "refresh-1",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "read",
        }),
      };
    }
    return {
      status: 200,
      type: "application/json",
      body: JSON.stringify({ access_token: "access-2", token_type: "bearer", expires_in: 1800 }),
    };
  }
}

/** The "browser": follows the sign-in address back to the callback it names, like a person who allowed the access. */
export function browserThatAllows(
  mock: MockService,
  calls: Array<{ url: string }> = [],
  code = "one-time-code",
): OAuthRunOptions["openBrowser"] {
  return async (signInUrl) => {
    calls.push({ url: signInUrl });
    const url = new URL(signInUrl);
    mock.rememberChallenge(url.searchParams.get("code_challenge") ?? "");
    const back = new URL(url.searchParams.get("redirect_uri") ?? "");
    back.searchParams.set("code", code);
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    setTimeout(() => {
      void fetch(back).catch(() => undefined);
    }, 20);
  };
}
