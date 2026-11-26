// COSGRAL: shows the team server of this computer to the other people of a private Tailscale network. Tailscale
// ("tailscale serve") puts the local server behind an https address that only the computers of the same Tailscale
// network can open (`<computer>.<network>.ts.net`). Nothing here creates an account or opens the server to the internet.

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { isTailscaleHostname } from "@openbot/contracts/validation";

export interface TailscaleRunResult {
  code: number;
  output: string;
}

/** Runs the Tailscale program with the given arguments. */
export type TailscaleRun = (executable: string, args: string[]) => Promise<TailscaleRunResult>;

export interface TailscalePublisherOptions {
  resolveExecutable?: () => Promise<string | null>;
  run?: TailscaleRun;
}

const RUN_TIMEOUT_MS = 20_000;

export const TAILSCALE_MESSAGES = {
  notInstalled:
    "Nie znalazłem programu Tailscale na tym komputerze. Zainstaluj Tailscale (tailscale.com/download), zaloguj się i spróbuj jeszcze raz.",
  needsLogin:
    "Tailscale jest zainstalowany, ale nie jesteś w nim zalogowany. Otwórz Tailscale, zaloguj się i spróbuj jeszcze raz.",
  stopped: "Tailscale jest wyłączony. Włącz go i spróbuj jeszcze raz.",
  noName:
    "Tailscale nie podał nazwy tego komputera. Włącz w panelu Tailscale (zakładka DNS) nazwy MagicDNS i spróbuj jeszcze raz.",
  needsHttps:
    "W panelu Tailscale (zakładka DNS) włącz HTTPS dla Waszej sieci i spróbuj jeszcze raz. Tylko wtedy można udostępnić ten program bezpiecznym adresem.",
  timeout: "Tailscale nie odpowiedział na czas. Sprawdź, czy działa, i spróbuj jeszcze raz.",
  ready: "Udostępnione w Tailscale. Wejść mogą tylko zaproszone osoby, które są w Waszej sieci Tailscale.",
} as const;

export class TailscaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TailscaleError";
  }
}

const runWithExecFile: TailscaleRun = (executable, args) =>
  new Promise((resolve) => {
    execFile(
      executable,
      args,
      { timeout: RUN_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && "killed" in error && error.killed) {
          resolve({ code: -1, output: "timeout" });
          return;
        }
        const code = error ? (isNumber(error.code) ? error.code : 1) : 0;
        resolve({ code, output: `${stdout}\n${stderr}`.trim() });
      },
    );
  });

/** Where Tailscale usually is: the PATH, and the places the installers use on Windows and macOS. */
export async function resolveTailscaleExecutable(
  pathValue = process.env.PATH ?? "",
  platform = process.platform,
): Promise<string | null> {
  const name = platform === "win32" ? "tailscale.exe" : "tailscale";
  const candidates = [
    ...pathValue
      .split(delimiter)
      .filter(Boolean)
      .map((folder) => join(folder, name)),
    ...(platform === "win32"
      ? ["C:\\Program Files\\Tailscale\\tailscale.exe", "C:\\Program Files (x86)\\Tailscale\\tailscale.exe"]
      : []),
    ...(platform === "darwin" ? ["/Applications/Tailscale.app/Contents/MacOS/Tailscale"] : []),
    ...(platform === "linux" ? ["/usr/bin/tailscale", "/usr/local/bin/tailscale"] : []),
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

/** The name of this computer in the Tailscale network, read from `tailscale status --json`. */
export function tailscaleHostFromStatus(output: string): string {
  let status: unknown;
  try {
    status = JSON.parse(output);
  } catch {
    throw new TailscaleError(TAILSCALE_MESSAGES.stopped);
  }
  if (!isDynamicRecord(status)) throw new TailscaleError(TAILSCALE_MESSAGES.stopped);
  if (status.BackendState === "NeedsLogin" || status.BackendState === "NoState") {
    throw new TailscaleError(TAILSCALE_MESSAGES.needsLogin);
  }
  if (status.BackendState !== "Running") throw new TailscaleError(TAILSCALE_MESSAGES.stopped);
  const self = isDynamicRecord(status.Self) ? status.Self : null;
  const name = self && isString(self.DNSName) ? self.DNSName.replace(/\.$/u, "").toLowerCase() : "";
  if (!isTailscaleHostname(name)) throw new TailscaleError(TAILSCALE_MESSAGES.noName);
  return name;
}

export class TailscalePublisher {
  readonly #resolve: () => Promise<string | null>;
  readonly #run: TailscaleRun;

  constructor(options: TailscalePublisherOptions = {}) {
    this.#resolve = options.resolveExecutable ?? (() => resolveTailscaleExecutable());
    this.#run = options.run ?? runWithExecFile;
  }

  /** Makes the local server on `port` reachable at the https address of this computer; returns that address. */
  async publish(port: number): Promise<string> {
    const executable = await this.#resolve();
    if (!executable) throw new TailscaleError(TAILSCALE_MESSAGES.notInstalled);
    const status = await this.#run(executable, ["status", "--json"]);
    if (status.output === "timeout") throw new TailscaleError(TAILSCALE_MESSAGES.timeout);
    const host = tailscaleHostFromStatus(status.output);
    const served = await this.#run(executable, ["serve", "--bg", "--https=443", `http://127.0.0.1:${port}`]);
    if (served.output === "timeout") throw new TailscaleError(TAILSCALE_MESSAGES.timeout);
    if (served.code !== 0) {
      if (/https|enable|not enabled/iu.test(served.output)) throw new TailscaleError(TAILSCALE_MESSAGES.needsHttps);
      const firstLine = served.output.split("\n")[0]?.trim().slice(0, 200) ?? "";
      throw new TailscaleError(`Tailscale nie przyjął polecenia udostępnienia${firstLine ? `: ${firstLine}` : "."}`);
    }
    return `https://${host}`;
  }

  /** Stops showing the server. Never fails: a missing Tailscale means there is nothing to stop. */
  async unpublish(): Promise<void> {
    const executable = await this.#resolve().catch(() => null);
    if (!executable) return;
    await this.#run(executable, ["serve", "--https=443", "off"]).catch(() => undefined);
  }
}
