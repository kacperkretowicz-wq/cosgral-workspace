// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MOBILE_API_PATHS } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { buildMobileAppAssets } from "../../scripts/build-mobile-app";
import { MOBILE_APP_FILES } from "./mobile-app-assets";
import { MobileConnect } from "./mobile-connect";
import { MobileStore } from "./mobile-store";

const roots: string[] = [];
const running: MobileConnect[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((mobile) => mobile.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function server() {
  const root = await mkdtemp(join(tmpdir(), "mobile-app-"));
  roots.push(root);
  const mobile = new MobileConnect({
    store: new MobileStore(join(root, "mobile.json")),
    agents: () => [],
    needsYou: () => [],
    confirm: async () => "send",
    canAsk: () => true,
    emit: () => undefined,
  });
  running.push(mobile);
  const ticket = await mobile.startPairing({ port: 0 });
  return { base: ticket.urls[0] ?? "", ticket };
}

describe("phone web app files", () => {
  it("are built from the sources (run `bun run build:mobile-app` after editing src/mobile-app)", () => {
    expect(buildMobileAppAssets()).toEqual(MOBILE_APP_FILES);
  });

  it("have no external addresses, no inline scripts and no inline styles", () => {
    const text = Object.values(MOBILE_APP_FILES)
      .map((file) => file.body)
      .join("\n");
    expect(text).not.toMatch(/https?:\/\/(?!www\.w3\.org\/)/);
    const html = MOBILE_APP_FILES["/app/"].body;
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toContain("<style");
  });
});

describe("phone web app on the phone server", () => {
  it("serves the shell, script, styles, manifest, icon and worker without a token, with a strict policy", async () => {
    const { base } = await server();
    for (const [path, type] of [
      ["/app/", "text/html"],
      ["/app/app.js", "text/javascript"],
      ["/app/app.css", "text/css"],
      ["/app/manifest.webmanifest", "application/manifest+json"],
      ["/app/icon.svg", "image/svg+xml"],
      ["/app/sw.js", "text/javascript"],
    ] as const) {
      const response = await fetch(`${base}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toContain(type);
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(response.headers.get("cache-control"), path).toBe("no-cache");
      expect((await response.text()).length, path).toBeGreaterThan(20);
    }
    const shell = await fetch(`${base}/app/`);
    const policy = shell.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe");
    expect(shell.headers.get("x-frame-options")).toBe("DENY");
  });

  it("answers 304 for an unchanged file, redirects /app and /, and refuses other methods and unknown files", async () => {
    const { base } = await server();
    const first = await fetch(`${base}/app/app.js`);
    const etag = first.headers.get("etag") ?? "";
    expect(etag).not.toBe("");
    await first.text();
    const again = await fetch(`${base}/app/app.js`, { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    for (const path of ["/app", "/"]) {
      const redirect = await fetch(`${base}${path}`, { redirect: "manual" });
      expect(redirect.status, path).toBe(302);
      expect(redirect.headers.get("location"), path).toBe("/app/");
    }
    expect((await fetch(`${base}/app/`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${base}/app/secret.txt`)).status).toBe(404);
    // A path with dots is not looked up on disk: the files are in memory, so it is simply unknown.
    const url = new URL(base);
    const traversal = await new Promise<number>((resolve, reject) => {
      get({ host: url.hostname, port: url.port, path: "/app/../v1/me" }, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      }).on("error", reject);
    });
    expect(traversal).toBe(404);
    // The API still needs the device token.
    expect((await fetch(`${base}${MOBILE_API_PATHS.me}`)).status).toBe(401);
  });
});
