// COSGRAL: shows the team server of this computer at the free static address of a ngrok account
// (`<name>.ngrok-free.app`). The address never changes, so the people who joined never need a new link. The person
// creates a free ngrok account once and pastes its authtoken and its free domain into COSGRAL.

import { type SpawnOptions, spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { installNgrok, managedNgrokPath, NgrokInstallError } from "./ngrok-installer";
import type { NgrokSettings } from "./ngrok-settings-store";
import { appendDiagnosticLog, stopOwnedProcess } from "./remote-mac";

export const NGROK_MESSAGES = {
  notConfigured:
    "Najpierw wpisz token i domenę z darmowego konta ngrok (instrukcja jest na ekranie), a potem włącz udostępnianie.",
  ready:
    "Udostępnione pod stałym adresem. Osoby, które dołączyły, wchodzą tym samym adresem za każdym razem. Wejść mogą tylko osoby z Twoim zaproszeniem, a udostępnianie działa, dopóki ten program jest włączony.",
  badToken: "ngrok nie przyjął tokenu. Skopiuj go jeszcze raz ze strony „Your Authtoken” w ngrok i zapisz.",
  badDomain:
    "ngrok mówi, że ta domena nie należy do Twojego konta. Skopiuj domenę ze strony „Domains” w ngrok (darmowe konto ma jedną) i zapisz.",
  domainBusy:
    "Ta domena ngrok jest już w użyciu, na przykład przez inny działający program ngrok. Zamknij go i spróbuj jeszcze raz.",
  limit:
    "Darmowy plan ngrok wyczerpał limit na ten miesiąc. Wybierz darmowy tunel Cloudflare albo poczekaj do nowego miesiąca.",
  noAnswer: "ngrok nie odpowiedział. Sprawdź połączenie z internetem i spróbuj jeszcze raz.",
  stopped: "Połączenie z ngrok zostało przerwane, więc udostępnianie przestało działać. Włącz je jeszcze raz.",
  notReachable: "ngrok połączył się, ale adres nie jest jeszcze widoczny z internetu. Spróbuj jeszcze raz za chwilę.",
} as const;

export class NgrokError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NgrokError";
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

export interface NgrokPublisherOptions {
  binDirectory: string;
  /** The saved authtoken and domain, or null when the person has not entered them. */
  getSettings: () => NgrokSettings | null;
  resolveExecutable?: () => Promise<string | null>;
  install?: (onProgress: (message: string) => void) => Promise<string>;
  spawnProcess?: (executable: string, args: readonly string[], options: SpawnOptions) => TunnelProcess;
  timeoutMs?: number;
  logDirectory?: string;
}

export interface NgrokListeners {
  closed?: () => void;
  progress?: (message: string) => void;
}

type AddressFlag = "url" | "domain";

export function buildNgrokArgs(port: number, domain: string, flag: AddressFlag = "url"): string[] {
  return [
    "http",
    `http://127.0.0.1:${port}`,
    flag === "url" ? `--url=https://${domain}` : `--domain=${domain}`,
    "--log=stdout",
    "--log-format=json",
  ];
}

/** Turns what ngrok printed when it failed into a plain sentence, or null when it is not a known failure. */
export function explainNgrokFailure(output: string): (typeof NGROK_MESSAGES)[keyof typeof NGROK_MESSAGES] | null {
  const code = /ERR_NGROK_(\d+)/u.exec(output)?.[1];
  if (code && ["105", "106", "107", "108", "100"].includes(code)) return NGROK_MESSAGES.badToken;
  if (code === "334") return NGROK_MESSAGES.domainBusy;
  if (code && ["313", "314", "315", "320", "321"].includes(code)) return NGROK_MESSAGES.badDomain;
  if (code && ["725", "726", "727"].includes(code)) return NGROK_MESSAGES.limit;
  if (/authentication failed|authtoken/iu.test(output)) return NGROK_MESSAGES.badToken;
  return null;
}

/** An installed program, if there is one: fetched by COSGRAL, on the PATH, or in the folders installers use. */
export async function resolveNgrokExecutable(
  binDirectory: string,
  pathValue = process.env.PATH ?? "",
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const name = platform === "win32" ? "ngrok.exe" : "ngrok";
  const candidates = [
    managedNgrokPath(binDirectory, platform),
    ...pathValue
      .split(delimiter)
      .filter(Boolean)
      .map((folder) => join(folder, name)),
    ...(platform === "darwin" ? ["/opt/homebrew/bin/ngrok", "/usr/local/bin/ngrok"] : []),
    ...(platform === "linux" ? ["/usr/local/bin/ngrok", "/usr/bin/ngrok", "/snap/bin/ngrok"] : []),
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

export class NgrokPublisher {
  readonly #options: NgrokPublisherOptions;
  #child: TunnelProcess | null = null;
  #stopping = false;
  #listeners: NgrokListeners = {};

  constructor(options: NgrokPublisherOptions) {
    this.#options = options;
  }

  setListeners(listeners: NgrokListeners): void {
    this.#listeners = listeners;
  }

  /** Makes the local server on `port` reachable at the static domain of the person; returns that address. */
  async publish(port: number): Promise<string> {
    const settings = this.#options.getSettings();
    if (!settings) throw new NgrokError(NGROK_MESSAGES.notConfigured);
    await this.unpublish();
    const executable = await this.#executable();
    try {
      return await this.#run(executable, port, settings, "url");
    } catch (error) {
      if (error instanceof NgrokError && error.message === "unknown-flag") {
        // An older ngrok program calls the same option `--domain`.
        return await this.#run(executable, port, settings, "domain");
      }
      throw error;
    }
  }

  async unpublish(): Promise<void> {
    const child = this.#child;
    this.#child = null;
    this.#stopping = true;
    if (child) await stopOwnedProcess(child).catch(() => undefined);
  }

  async #run(executable: string, port: number, settings: NgrokSettings, flag: AddressFlag): Promise<string> {
    this.#stopping = false;
    const spawnProcess = this.#options.spawnProcess ?? spawn;
    const child = spawnProcess(executable, buildNgrokArgs(port, settings.domain, flag), {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NGROK_AUTHTOKEN: settings.authtoken },
    });
    this.#child = child;
    const logDirectory = this.#options.logDirectory;
    if (logDirectory) {
      // The token is never printed by ngrok; the log helps when something does not work.
      child.stdout?.on("data", (chunk) => void appendDiagnosticLog(logDirectory, "host-ngrok", chunk));
      child.stderr?.on("data", (chunk) => void appendDiagnosticLog(logDirectory, "host-ngrok", chunk));
    }
    child.once("exit", () => {
      if (this.#child === child) this.#child = null;
      if (!this.#stopping) this.#listeners.closed?.();
    });
    try {
      await waitForNgrokTunnel(child, settings.domain, this.#options.timeoutMs ?? 40_000);
      return `https://${settings.domain}`;
    } catch (error) {
      await this.unpublish();
      throw error;
    }
  }

  async #executable(): Promise<string> {
    const found = await (this.#options.resolveExecutable?.() ?? resolveNgrokExecutable(this.#options.binDirectory));
    if (found) return found;
    const report = this.#listeners.progress ?? (() => undefined);
    try {
      return await (this.#options.install?.(report) ??
        installNgrok({ directory: this.#options.binDirectory, onProgress: report }));
    } catch (error) {
      if (error instanceof NgrokInstallError) throw new NgrokError(error.message);
      throw error;
    }
  }
}

/** Waits for the line in which ngrok says the tunnel at the domain started; explains a failure in plain words. */
export function waitForNgrokTunnel(child: TunnelProcess, domain: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const fail = () => {
      if (/unknown flag|flag provided but not defined/iu.test(buffer)) finish(new NgrokError("unknown-flag"));
      else finish(new NgrokError(explainNgrokFailure(buffer) ?? NGROK_MESSAGES.noAnswer));
    };
    const onData = (chunk: Buffer) => {
      buffer = `${buffer}${chunk.toString("utf8")}`.slice(-16_000);
      if (/started tunnel/iu.test(buffer) && buffer.toLowerCase().includes(domain)) finish(null);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", fail);
    child.once("exit", fail);
    const timer = setTimeout(fail, timeoutMs);
  });
}
