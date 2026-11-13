// COSGRAL W3-BE7: the phone web app on the phone server (`/app/…`). The files are built into the program (see
// scripts/build-mobile-app.ts) and need no token: they hold no secret. The page may talk only to its own server, run
// only its own script, and cannot be put in a frame.

import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MOBILE_APP_FILES } from "./mobile-app-assets";
import { HttpError } from "./mobile-http";

const POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "content-security-policy": POLICY,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cache-control": "no-cache",
} as const;

const etags = new Map<string, string>();
function etag(path: string, body: string): string {
  let value = etags.get(path);
  if (!value) {
    value = `"${createHash("sha256").update(body).digest("hex").slice(0, 20)}"`;
    etags.set(path, value);
  }
  return value;
}

/** True when the path belongs to the app (served, redirected or refused); false for any other path. */
export function isMobileAppPath(path: string): boolean {
  return path === "/" || path === "/app" || path.startsWith("/app/");
}

export function serveMobileApp(request: IncomingMessage, response: ServerResponse, path: string): void {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    throw new HttpError(405, "Use GET.");
  }
  if (path === "/" || path === "/app") {
    response.writeHead(302, { location: "/app/", ...SECURITY_HEADERS });
    response.end();
    return;
  }
  const file = Object.hasOwn(MOBILE_APP_FILES, path) ? MOBILE_APP_FILES[path] : undefined;
  if (!file) throw new HttpError(404, "Not found.");
  const tag = etag(path, file.body);
  if (request.headers["if-none-match"] === tag) {
    response.writeHead(304, { etag: tag, ...SECURITY_HEADERS });
    response.end();
    return;
  }
  const body = Buffer.from(file.body, "utf8");
  response.writeHead(200, {
    "content-type": file.type,
    "content-length": body.length,
    etag: tag,
    ...SECURITY_HEADERS,
  });
  response.end(method === "HEAD" ? undefined : body);
}
