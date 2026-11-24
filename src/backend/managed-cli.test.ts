// @vitest-environment node
// COSGRAL W5-BE1: the managed CLI engine against a loopback stand-in for the official release servers.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ManagedCliState } from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { checkCliDownloadUrl, OfficialCliCatalog } from "./cli-catalog";
import { checkLoopbackUrl, LoopbackDownloadSource } from "./cli-loopback-source";
import { ManagedCliManager } from "./managed-cli";

interface StandIn {
  base: string;
  /** File bytes per version (both CLIs). */
  files: Map<string, Buffer>;
  latest: { codex: string; claude: string };
  /** Serve other bytes than the manifest says (a failed SHA-256 check). */
  corrupt: boolean;
  /** Cut the next N file downloads half way. */
  interrupt: number;
  /** Codex helper `codex-code-mode-host` per version (only releases listed here have one). */
  hosts: Map<string, Buffer>;
  /** Serve other bytes for the helper than the release says. */
  corruptHost: boolean;
  fileRequests: number;
  server: Server;
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

function sha(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function portOf(server: Server): number {
  const address = server.address();
  if (!address || isString(address)) throw new Error("The stand-in server has no port.");
  return address.port;
}

async function standIn(): Promise<StandIn> {
  const state: Omit<StandIn, "base" | "server"> = {
    files: new Map([
      ["0.1.0", Buffer.from("cli build 0.1.0 ".repeat(4096))],
      ["0.2.0", Buffer.from("cli build 0.2.0 ".repeat(4096))],
    ]),
    latest: { codex: "0.1.0", claude: "0.1.0" },
    corrupt: false,
    interrupt: 0,
    fileRequests: 0,
    hosts: new Map(),
    corruptHost: false,
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const base = `http://127.0.0.1:${portOf(server)}`;
    const codexRelease = (version: string) => {
      const bytes = state.files.get(version);
      if (!bytes) return null;
      return {
        tag_name: `rust-v${version}`,
        assets: [
          {
            name: "codex-x86_64-pc-windows-msvc.exe",
            size: bytes.length,
            digest: `sha256:${sha(bytes)}`,
            browser_download_url: `${base}/files/codex/${version}`,
          },
          ...(state.hosts.has(version)
            ? [
                {
                  name: "codex-code-mode-host-x86_64-pc-windows-msvc.exe",
                  size: state.hosts.get(version)?.length ?? 0,
                  digest: `sha256:${sha(state.hosts.get(version) ?? Buffer.alloc(0))}`,
                  browser_download_url: `${base}/files/codex-host/${version}`,
                },
              ]
            : []),
        ],
      };
    };
    const json = (value: unknown) => {
      if (value === null) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(value));
    };
    const pick = (pattern: RegExp) => url.pathname.match(pattern)?.[1] ?? null;
    if (url.pathname === "/gh/latest") return json(codexRelease(state.latest.codex));
    const tag = pick(/^\/gh\/tags\/rust-v(.+)$/);
    if (tag) return json(codexRelease(tag));
    if (url.pathname === "/claude/latest") return response.writeHead(200).end(`${state.latest.claude}\n`);
    const manifestVersion = pick(/^\/claude\/([^/]+)\/manifest\.json$/);
    if (manifestVersion) {
      const bytes = state.files.get(manifestVersion);
      return json(
        bytes
          ? { version: manifestVersion, platforms: { "win32-x64": { checksum: sha(bytes), size: bytes.length } } }
          : null,
      );
    }
    const hostVersion = pick(/^\/files\/codex-host\/(.+)$/);
    if (hostVersion) {
      const bytes = state.hosts.get(hostVersion);
      if (!bytes) return response.writeHead(404).end();
      const body = state.corruptHost ? Buffer.from(bytes).fill(0x42) : bytes;
      return response.writeHead(200, { "content-length": String(body.length) }).end(body);
    }
    const fileVersion = pick(/^\/files\/codex\/(.+)$/) ?? pick(/^\/claude\/([^/]+)\/win32-x64\/claude\.exe$/);
    if (fileVersion) {
      const bytes = state.files.get(fileVersion);
      if (!bytes) return response.writeHead(404).end();
      state.fileRequests += 1;
      const body = state.corrupt ? Buffer.from(bytes).fill(0x41) : bytes;
      response.writeHead(200, { "content-length": String(body.length) });
      if (state.interrupt > 0) {
        state.interrupt -= 1;
        response.write(body.subarray(0, body.length / 2));
        setTimeout(() => response.destroy(), 20);
        return;
      }
      return response.end(body);
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${portOf(server)}`;
  return Object.assign(state, { base, server });
}

async function setup(
  options: { confirm?: boolean; system?: string | null; remove?: (path: string) => Promise<void> } = {},
) {
  const server = await standIn();
  const root = await mkdtemp(join(tmpdir(), "cosgral-managed-cli-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const source = new LoopbackDownloadSource();
  const confirms: string[] = [];
  const events: ManagedCliState[] = [];
  const changed: string[] = [];
  const probes: string[] = [];
  const make = () =>
    new ManagedCliManager({
      root: join(root, "cli"),
      catalog: new OfficialCliCatalog({
        source,
        githubApiBase: `${server.base}/gh`,
        claudeBase: `${server.base}/claude`,
      }),
      source,
      checkUrl: checkLoopbackUrl,
      confirm: async ({ title }) => {
        confirms.push(title);
        return options.confirm ?? true;
      },
      probe: async (executable) => {
        probes.push(executable);
        return "0.0.0";
      },
      findSystem: async () => (options.system ? { executable: options.system, version: "9.9.9" } : null),
      emit: (state) => events.push(state),
      onExecutableChanged: (id) => changed.push(id),
      ...(options.remove ? { remove: options.remove } : {}),
    });
  const manager = make();
  await manager.init();
  return { server, root, manager, make, confirms, events, changed, probes };
}

describe("a CLI that is still running while its version changes (W5-G2, Windows)", () => {
  // Windows cannot delete the file of a running program. The stand-in refuses to remove a folder the way it does.
  const locked = new Set<string>();
  const remove = async (path: string) => {
    if ([...locked].some((name) => path.endsWith(name)))
      throw Object.assign(new Error(`EPERM: operation not permitted, unlink '${path}'`), { code: "EPERM" });
    await rm(path, { recursive: true, force: true });
  };

  it("switches back to a version whose old folder could not be deleted: the same verified file stays in place", async () => {
    locked.clear();
    const { manager, server, root, confirms } = await setup({ remove });
    await manager.install("codex"); // 0.1.0, the first yes
    await manager.pin("codex", "0.2.0");
    locked.add("0.1.0");
    await manager.update("codex"); // 0.2.0 now; the folder of 0.1.0 stays (it is "running")
    expect(manager.state("codex")).toMatchObject({ managedVersion: "0.2.0", error: null });
    expect(existsSync(join(root, "cli", "codex", "0.1.0", "codex.exe"))).toBe(true);

    await manager.pin("codex", null);
    server.latest.codex = "0.1.0";
    const back = await manager.update("codex");
    expect(back).toMatchObject({ managedVersion: "0.1.0", phase: "idle", error: null });
    expect(await readFile(join(root, "cli", "codex", "0.1.0", "codex.exe"))).toEqual(server.files.get("0.1.0"));
    expect(existsSync(join(root, "cli", "codex", ".0.1.0.download"))).toBe(false);
    expect(confirms).toHaveLength(1);
  });

  it("says plainly that a different file cannot replace one that is running, and keeps the working version", async () => {
    locked.clear();
    const { manager, server, root } = await setup({ remove });
    await manager.install("codex");
    // A damaged leftover of 0.2.0 that is "running" and differs from the release.
    await mkdir(join(root, "cli", "codex", "0.2.0"), { recursive: true });
    await writeFile(join(root, "cli", "codex", "0.2.0", "codex.exe"), "something else");
    locked.add("0.2.0");
    server.latest.codex = "0.2.0";
    const after = await manager.update("codex");
    expect(after.phase).toBe("error");
    expect(after.error).toMatch(/still running, so it cannot be replaced/);
    expect(after.managedVersion).toBe("0.1.0");
    expect(server.fileRequests).toBeGreaterThanOrEqual(2);
  });
});

describe("official CLI sources (W5-BE1)", () => {
  it("allows only HTTPS to the official hosts", () => {
    expect(checkCliDownloadUrl("https://github.com/openai/codex/releases/download/x/codex.exe").hostname).toBe(
      "github.com",
    );
    expect(checkCliDownloadUrl("https://downloads.claude.ai/claude-code-releases/latest").hostname).toBe(
      "downloads.claude.ai",
    );
    expect(() => checkCliDownloadUrl("http://github.com/x")).toThrow(/not allowed/);
    expect(() => checkCliDownloadUrl("https://evil.example/codex.exe")).toThrow(/not allowed/);
    expect(() => checkCliDownloadUrl("https://github.com.evil.example/x")).toThrow(/not allowed/);
    expect(() => checkCliDownloadUrl("https://github.com:8443/x")).toThrow(/not allowed/);
    expect(() => checkCliDownloadUrl("https://user:pw@github.com/x")).toThrow(/not allowed/);
    expect(() => checkLoopbackUrl("http://example.com/x")).toThrow(/not allowed/);
  });

  it("reads version, SHA-256 and size from the release metadata", async () => {
    const { server } = await setup();
    const source = new LoopbackDownloadSource();
    const catalog = new OfficialCliCatalog({
      source,
      githubApiBase: `${server.base}/gh`,
      claudeBase: `${server.base}/claude`,
    });
    const bytes = server.files.get("0.1.0") ?? Buffer.alloc(0);
    const signal = new AbortController().signal;
    expect(await catalog.latest("codex", signal)).toMatchObject({
      version: "0.1.0",
      sha256: sha(bytes),
      sizeBytes: bytes.length,
    });
    expect(await catalog.latest("claude", signal)).toMatchObject({
      version: "0.1.0",
      url: `${server.base}/claude/0.1.0/win32-x64/claude.exe`,
      sha256: sha(bytes),
    });
    await expect(catalog.release("codex", "../x", signal)).rejects.toThrow(/Not a CLI version/);
  });
});

describe("managed CLI engine (W5-BE1)", () => {
  it("asks before the first download and installs nothing when declined", async () => {
    const { manager, confirms, root } = await setup({ confirm: false });
    const state = await manager.install("codex");
    expect(confirms).toEqual(["Download Codex CLI 0.1.0?"]);
    expect(state).toMatchObject({ source: "none", managedVersion: null, error: "The download was declined." });
    expect(existsSync(join(root, "cli", "codex", "0.1.0"))).toBe(false);
  });

  it("installs into a folder per version after a yes, then updates without asking", async () => {
    const { manager, server, confirms, root, changed, probes, make } = await setup({ system: "C:\\system\\codex.exe" });
    const first = await manager.install("codex");
    expect(first).toMatchObject({
      source: "managed",
      version: "0.1.0",
      managedVersion: "0.1.0",
      error: null,
      phase: "idle",
    });
    expect(first.executable).toBe(join(root, "cli", "codex", "0.1.0", "codex.exe"));
    expect(await readFile(join(root, "cli", "codex", "0.1.0", "codex.exe"))).toEqual(server.files.get("0.1.0"));
    expect(probes).toHaveLength(1);
    expect(changed).toEqual(["codex"]);

    server.latest.codex = "0.2.0";
    await manager.autoUpdate();
    expect(confirms).toHaveLength(1);
    expect(manager.state("codex")).toMatchObject({ managedVersion: "0.2.0", latestVersion: "0.2.0" });
    expect(existsSync(join(root, "cli", "codex", "0.1.0"))).toBe(false);
    expect(existsSync(join(root, "cli", "codex", "0.2.0", "codex.exe"))).toBe(true);

    // A folder left by an update whose old CLI was still running, and a half-finished download: gone at next start.
    await mkdir(join(root, "cli", "codex", "0.1.0"), { recursive: true });
    await mkdir(join(root, "cli", "codex", ".0.3.0.download"), { recursive: true });
    const again = make();
    await again.init();
    expect(again.state("codex")).toMatchObject({ source: "managed", managedVersion: "0.2.0", autoUpdate: true });
    expect(existsSync(join(root, "cli", "codex", "0.1.0"))).toBe(false);
    expect(existsSync(join(root, "cli", "codex", ".0.3.0.download"))).toBe(false);
    expect(existsSync(join(root, "cli", "codex", "0.2.0", "codex.exe"))).toBe(true);
  });

  it("refuses a file that fails the SHA-256 check, without a second try, and keeps nothing", async () => {
    const { manager, server, root } = await setup();
    server.corrupt = true;
    const state = await manager.install("claude");
    expect(state.error).toMatch(/SHA-256/);
    expect(state).toMatchObject({ phase: "error", source: "none", managedVersion: null });
    expect(server.fileRequests).toBe(1);
    expect(existsSync(join(root, "cli", "claude", "0.1.0"))).toBe(false);
    expect(existsSync(join(root, "cli", "claude", ".0.1.0.download"))).toBe(false);
  });

  it("tries once more after a broken download", async () => {
    const { manager, server } = await setup();
    server.interrupt = 1;
    const state = await manager.install("claude");
    expect(server.fileRequests).toBe(2);
    expect(state).toMatchObject({ source: "managed", managedVersion: "0.1.0", error: null });
  });

  it("reports a download that breaks twice and keeps the current version", async () => {
    const { manager, server } = await setup();
    await manager.install("claude");
    server.latest.claude = "0.2.0";
    server.interrupt = 2;
    await manager.autoUpdate();
    expect(manager.state("claude")).toMatchObject({ managedVersion: "0.1.0", phase: "error" });
    expect(manager.state("claude").error).not.toBeNull();
  });

  it("keeps a pinned version: no automatic update, update installs the pin", async () => {
    const { manager, server } = await setup();
    await manager.install("codex");
    server.latest.codex = "0.2.0";
    await manager.pin("codex", "0.1.0");
    await manager.autoUpdate();
    expect(manager.state("codex").managedVersion).toBe("0.1.0");
    await manager.setSettings({ id: "codex", autoUpdate: false });
    await manager.pin("codex", null);
    await manager.autoUpdate();
    expect(manager.state("codex").managedVersion).toBe("0.1.0");
    await manager.install("codex", "0.2.0");
    expect(manager.state("codex").managedVersion).toBe("0.2.0");
  });

  it("uses the custom path first, then the downloaded CLI, then the system one; removes only the downloaded", async () => {
    const { manager, root } = await setup({ system: "C:\\system\\codex.exe" });
    expect(manager.state("codex")).toMatchObject({
      source: "system",
      executable: "C:\\system\\codex.exe",
      version: "9.9.9",
    });
    await manager.install("codex");
    expect(manager.state("codex").source).toBe("managed");

    const ownDir = join(root, "own");
    await mkdir(ownDir, { recursive: true });
    const own = join(ownDir, "codex.exe");
    await writeFile(own, "mine");
    await manager.setSettings({ id: "codex", customPath: own });
    expect(manager.resolve("codex")).toEqual({
      custom: own,
      managed: join(root, "cli", "codex", "0.1.0", "codex.exe"),
    });
    expect(manager.state("codex")).toMatchObject({ source: "custom", executable: own, managedVersion: "0.1.0" });
    await expect(manager.setSettings({ id: "codex", customPath: join(ownDir, "missing.exe") })).rejects.toThrow(
      /No file/,
    );

    await manager.remove("codex");
    expect(existsSync(join(root, "cli", "codex"))).toBe(false);
    expect(existsSync(own)).toBe(true);
    expect(manager.state("codex")).toMatchObject({ source: "custom", managedVersion: null });

    await manager.setSettings({ id: "codex", customPath: null });
    expect(manager.state("codex")).toMatchObject({ source: "system", executable: "C:\\system\\codex.exe" });
  });

  it("never asks on an automatic update before the first yes", async () => {
    const { manager, confirms } = await setup();
    const state = await manager.install("codex", undefined, { automatic: true });
    expect(confirms).toEqual([]);
    expect(state).toMatchObject({ phase: "error", managedVersion: null });
  });

  it("downloads Codex's code-mode host next to codex.exe and checks it like the executable", async () => {
    const { manager, server, root } = await setup();
    const host = Buffer.from("code mode host 0.1.0 ".repeat(512));
    server.hosts.set("0.1.0", host);
    const state = await manager.install("codex");
    expect(state).toMatchObject({ managedVersion: "0.1.0", error: null });
    const folder = join(root, "cli", "codex", "0.1.0");
    expect(await readFile(join(folder, "codex-code-mode-host.exe"))).toEqual(host);
    expect(existsSync(join(folder, "codex.exe"))).toBe(true);
  });

  it("an install without the helper is repaired by the next automatic update of the same version", async () => {
    const { manager, server, root } = await setup();
    await manager.install("codex");
    const folder = join(root, "cli", "codex", "0.1.0");
    expect(existsSync(join(folder, "codex-code-mode-host.exe"))).toBe(false);
    server.hosts.set("0.1.0", Buffer.from("code mode host 0.1.0 ".repeat(512)));
    await manager.autoUpdate();
    expect(existsSync(join(folder, "codex-code-mode-host.exe"))).toBe(true);
    expect(manager.state("codex")).toMatchObject({ managedVersion: "0.1.0", error: null });
    const requests = server.fileRequests;
    await manager.autoUpdate();
    expect(server.fileRequests).toBe(requests);
  });

  it("a helper that fails its SHA-256 check keeps the release from installing", async () => {
    const { manager, server, root } = await setup();
    server.hosts.set("0.1.0", Buffer.from("code mode host 0.1.0 ".repeat(512)));
    server.corruptHost = true;
    const state = await manager.install("codex");
    expect(state).toMatchObject({ phase: "error", managedVersion: null });
    expect(state.error).toMatch(/SHA-256|unexpected size/);
    expect(existsSync(join(root, "cli", "codex", "0.1.0"))).toBe(false);
  });
});
