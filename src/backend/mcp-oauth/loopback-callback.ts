// COSGRAL W12-KK (1): the one-time address the browser returns to after the sign-in on the service's page. It listens on 127.0.0.1 only,
// on a random port, answers the FIRST request that carries a result and then closes (or closes after the time limit). The page it
// shows is fixed text: nothing from the address (code, state, error text) is ever written into it. Nothing here logs the address.

import { createServer, type Server } from "node:http";
import { MCP_OAUTH_LIMITS } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";

/** The port the server listens on (0 when it does not listen yet). */
function portOf(server: Server | null): number {
  const address = server?.address();
  return isDynamicRecord(address) && isNumber(address.port) ? address.port : 0;
}

export type CallbackResult =
  | { kind: "code"; code: string }
  | { kind: "denied" }
  | { kind: "state-mismatch" }
  | { kind: "timeout" }
  | { kind: "closed" };

export interface CallbackServer {
  /** `http://127.0.0.1:<port>/mcp-oauth/callback` */
  redirectUrl: string;
  /** Settles once: with the code, a refusal, a wrong state, the time limit, or `closed` when `close()` ran first. */
  result: Promise<CallbackResult>;
  close: () => void;
}

const PAGE = (title: string, line: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;margin:3rem"><h1>${title}</h1><p>${line}</p></body>`;

export function startCallbackServer(options: { expectedState: string; timeoutMs?: number }): Promise<CallbackServer> {
  const timeoutMs = options.timeoutMs ?? MCP_OAUTH_LIMITS.waitSeconds * 1_000;
  return new Promise((resolveStart, rejectStart) => {
    let settle: (result: CallbackResult) => void = () => undefined;
    const result = new Promise<CallbackResult>((resolve) => {
      settle = resolve;
    });
    let server: Server | null = null;
    let timer: NodeJS.Timeout | null = null;
    let done = false;
    const finish = (value: CallbackResult) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      settle(value);
      // Close after the answer page was sent.
      setTimeout(() => server?.close(), 50).unref();
    };
    server = createServer((request, response) => {
      const port = portOf(server);
      // Only a request addressed to this computer's own loopback address (a page on the web cannot reach it by another name).
      const host = request.headers.host ?? "";
      if (request.method !== "GET" || host !== `127.0.0.1:${port}`) {
        response.writeHead(404).end();
        return;
      }
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== MCP_OAUTH_LIMITS.callbackPath) {
        response.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const state = url.searchParams.get("state");
      if (done || (!code && !error)) {
        response.writeHead(404).end();
        return;
      }
      let outcome: CallbackResult;
      if (state !== options.expectedState) outcome = { kind: "state-mismatch" };
      else if (error) outcome = { kind: "denied" };
      else outcome = { kind: "code", code: code ?? "" };
      const ok = outcome.kind === "code";
      response.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(
        ok
          ? PAGE("Signed in", "You can close this window and go back to COSGRAL Workspace.")
          : PAGE("Sign-in did not finish", "Go back to COSGRAL Workspace and try again."),
      );
      finish(outcome);
    });
    server.once("error", rejectStart);
    server.listen(0, "127.0.0.1", () => {
      const port = portOf(server);
      if (port === 0) {
        rejectStart(new Error("The sign-in address could not be opened."));
        return;
      }
      timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
      timer.unref();
      resolveStart({
        redirectUrl: `http://127.0.0.1:${port}${MCP_OAUTH_LIMITS.callbackPath}`,
        result,
        close: () => finish({ kind: "closed" }),
      });
    });
  });
}
