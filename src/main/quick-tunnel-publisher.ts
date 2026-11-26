// COSGRAL: shows the team server of this computer at a random https address (`<words>.trycloudflare.com`) with a free
// Cloudflare "quick tunnel". It needs no account: the computer calls out to Cloudflare, so no router setting is needed.
// The address is new every time the tunnel starts, and works only while this program is running.

import { type SpawnOptions, spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { CloudflaredInstallError, installCloudflared, managedCloudflaredPath } from "./cloudflared-installer";
import { appendDiagnosticLog, stopOwnedProcess } from "./remote-mac";

export const QUICK_TUNNEL_MESSAGES = {
  ready:
    "Udostępnione. Adres jest losowy i działa, dopóki ten program jest włączony. Wejść mogą tylko osoby z Twoim zaproszeniem.",
  noAddress:
    "Cloudflare nie podał adresu. Sprawdź połączenie z internetem i spróbuj jeszcze raz. Jeśli to się powtarza, w ustawieniach zaawansowanych możesz wybrać Tailscale.",
  stopped: "Połączenie z Cloudflare zostało przerwane, więc udostępnienie przestało działać. Włącz je jeszcze raz.",
  notReachable: "Cloudflare dał adres, ale nie widać go jeszcze z internetu. Spróbuj jeszcze raz za chwilę.",
} as const;

export class QuickTunnelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickTunnelError";
  }
}

interface TunnelProcess {
  exitCode: number | null;
  killed: boolean;
  kill: (signal?: NodeJS.Signals) => boolean;
  once(event: string, listener: (...args: unknown[]) => unknown): unknown;
  stdout?: { on: (event: string, listener: (chunk: Buffer) => void) => unknown } | null;
  stderr?: { on: (event: string, listener: (chunk: Buffer) => void) => unknown } | null;
}

export interface QuickTunnelPublisherOptions {
  /** Folder for the program fetched by COSGRAL, for example `<user data>/bin`. */
  binDirectory: string;
  /** Where to look for an installed program. Default: the fetched copy, the PATH and the usual installer folders. */
  resolveExecutable?: () => Promise<string | null>;
  /** Fetches the program when none is found. Default: {@link installCloudflared}. */
  install?: (onProgress: (message: string) => void) => Promise<string>;
  spawnProcess?: (executable: string, args: readonly string[], options: SpawnOptions) => TunnelProcess;
  /** How long to wait for the random address. */
  timeoutMs?: number;
  logDirectory?: string;
}

export interface QuickTunnelListeners {
  /** Called when the tunnel stops without {@link QuickTunnelPublisher.unpublish}. */
  closed?: () => void;
  /** Called with a plain sentence while the program is being fetched. */
  progress?: (message: string) => void;
}

export function buildQuickTunnelArgs(port: number): string[] {
  return ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`];
}

/** The first random address in the output of cloudflared. `api.trycloudflare.com` is Cloudflare itself, not our tunnel. */
export function findQuickTunnelUrl(output: string): string | null {
  const pattern = /https:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.trycloudflare\.com/giu;
  for (const match of output.matchAll(pattern)) {
    const label = match[1]?.toLowerCase();
    if (label && label !== "api") return `https://${label}.trycloudflare.com`;
  }
  return null;
}

/** An installed program, if there is one: fetched by COSGRAL, on the PATH, or in the folders installers use. */
export async function resolveQuickTunnelExecutable(
  binDirectory: string,
  pathValue = process.env.PATH ?? "",
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const name = platform === "win32" ? "cloudflared.exe" : "cloudflared";
  const candidates = [
    managedCloudflaredPath(binDirectory, platform),
    ...pathValue
      .split(delimiter)
      .filter(Boolean)
      .map((folder) => join(folder, name)),
    ...(platform === "win32"
      ? ["C:\\Program Files (x86)\\cloudflared\\cloudflared.exe", "C:\\Program Files\\cloudflared\\cloudflared.exe"]
      : ["/opt/homebrew/bin/cloudflared", "/usr/local/bin/cloudflared", "/usr/bin/cloudflared"]),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next place.
    }
  }
  return null;
}

export class QuickTunnelPublisher {
  readonly #options: QuickTunnelPublisherOptions;
  #child: TunnelProcess | null = null;
  #stopping = false;
  #listeners: QuickTunnelListeners = {};

  constructor(options: QuickTunnelPublisherOptions) {
    this.#options = options;
  }

  setListeners(listeners: QuickTunnelListeners): void {
    this.#listeners = listeners;
  }

  /** Makes the local server on `port` reachable at a new random https address; returns that address. */
  async publish(port: number): Promise<string> {
    await this.unpublish();
    const executable = await this.#executable();
    this.#stopping = false;
    const spawnProcess = this.#options.spawnProcess ?? spawn;
    const child = spawnProcess(executable, buildQuickTunnelArgs(port), {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    this.#child = child;
    const logDirectory = this.#options.logDirectory;
    if (logDirectory) {
      child.stdout?.on("data", (chunk) => void appendDiagnosticLog(logDirectory, "host-quick-tunnel", chunk));
      child.stderr?.on("data", (chunk) => void appendDiagnosticLog(logDirectory, "host-quick-tunnel", chunk));
    }
    child.once("exit", () => {
      if (this.#child === child) this.#child = null;
      if (!this.#stopping) this.#listeners.closed?.();
    });
    try {
      return await waitForQuickTunnelUrl(child, this.#options.timeoutMs ?? 45_000);
    } catch (error) {
      await this.unpublish();
      throw error;
    }
  }

  /** Stops the tunnel. Never fails. */
  async unpublish(): Promise<void> {
    const child = this.#child;
    this.#child = null;
    this.#stopping = true;
    if (child) await stopOwnedProcess(child).catch(() => undefined);
  }

  async #executable(): Promise<string> {
    const found = await (this.#options.resolveExecutable?.() ??
      resolveQuickTunnelExecutable(this.#options.binDirectory));
    if (found) return found;
    const report = this.#listeners.progress ?? (() => undefined);
    try {
      return await (this.#options.install?.(report) ??
        installCloudflared({ directory: this.#options.binDirectory, onProgress: report }));
    } catch (error) {
      if (error instanceof CloudflaredInstallError) throw new QuickTunnelError(error.message);
      throw error;
    }
  }
}

/** Waits for the line in which cloudflared prints the random address of the tunnel. */
export function waitForQuickTunnelUrl(child: TunnelProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const finish = (error: Error | null, url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error || !url) reject(error ?? new QuickTunnelError(QUICK_TUNNEL_MESSAGES.noAddress));
      else resolve(url);
    };
    const onData = (chunk: Buffer) => {
      buffer = `${buffer}${chunk.toString("utf8")}`.slice(-16_000);
      const url = findQuickTunnelUrl(buffer);
      if (url) finish(null, url);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", () => finish(new QuickTunnelError(QUICK_TUNNEL_MESSAGES.noAddress)));
    child.once("exit", () => finish(new QuickTunnelError(QUICK_TUNNEL_MESSAGES.noAddress)));
    const timer = setTimeout(() => finish(new QuickTunnelError(QUICK_TUNNEL_MESSAGES.noAddress)), timeoutMs);
  });
}
