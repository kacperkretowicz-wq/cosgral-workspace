import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, win32 } from "node:path";
import { promisify } from "node:util";
import { isNumber, isString } from "@openbot/contracts/runtime-values";

const execFileAsync = promisify(execFile);
const MINIMUM_CODEX_VERSION = [0, 144, 1] as const;

export interface CodexCliInfo {
  executable: string;
  version: string;
}

export interface ClaudeCliInfo {
  executable: string;
  version: string;
}

export class CodexCliError extends Error {
  constructor(
    message: string,
    readonly code: "missing" | "invalid" | "outdated",
  ) {
    super(message);
    this.name = "CodexCliError";
  }
}

export async function resolveCodexCli(): Promise<CodexCliInfo> {
  const candidates = await collectCandidates("codex", process.env.OPENBOT_CODEX_PATH);
  const failures: CodexCliError[] = [];

  for (const candidate of candidates) {
    if (!(await isExecutable(candidate))) continue;

    try {
      const stdout = await readCliVersion(candidate);
      const version = parseCodexVersion(stdout);
      if (!isMinimumVersion(version)) {
        throw new CodexCliError(
          `Codex CLI ${version} is too old. COSGRAL Workspace requires 0.144.1 or newer.`,
          "outdated",
        );
      }

      return { executable: candidate, version };
    } catch (error) {
      failures.push(
        error instanceof CodexCliError
          ? error
          : error instanceof CliTimeoutError
            ? new CodexCliError(CLI_TIMEOUT_MESSAGE("Codex"), "invalid")
            : new CodexCliError("Codex CLI was found but could not be started.", "invalid"),
      );
    }
  }

  const outdated = failures.find((failure) => failure.code === "outdated");
  if (outdated) throw outdated;
  const slow = failures.find((failure) => failure.message === CLI_TIMEOUT_MESSAGE("Codex"));
  if (slow) throw slow;
  if (failures.length > 0) {
    throw new CodexCliError(
      "Codex CLI was found but could not be started. Run `codex --version` in a new terminal.",
      "invalid",
    );
  }

  throw new CodexCliError(
    "Codex CLI was not found. Install Codex, run `codex login`, then choose Try again.",
    "missing",
  );
}

const CLI_TIMEOUT_MESSAGE = (name: "Codex" | "Claude") =>
  `${name} CLI did not answer within ${CLI_VERSION_TIMEOUT_MS / 1000} s (twice). The computer may be busy; choose Try again.`;

export async function resolveClaudeCli(): Promise<ClaudeCliInfo> {
  const candidates = await collectCandidates("claude", process.env.OPENBOT_CLAUDE_PATH);
  let foundCandidate = false;
  let reason: string | null = null;

  for (const candidate of candidates) {
    if (!(await isExecutable(candidate))) continue;
    foundCandidate = true;

    try {
      const stdout = await readCliVersion(candidate);
      return { executable: candidate, version: parseClaudeVersion(stdout) };
    } catch (error) {
      // Try the next executable candidate, but remember why this one failed (W6-KK3).
      reason = describeCliStartFailure(error);
    }
  }

  if (foundCandidate) {
    throw new CodexCliError(
      `Claude CLI was found but could not be started${reason ? ` (${reason})` : ""}. Run \`claude --version\` in a new terminal.`,
      "invalid",
    );
  }

  throw new CodexCliError(
    "Claude CLI was not found. Install Claude Code, run `claude auth login`, then choose Try again.",
    "missing",
  );
}

export function parseCodexVersion(output: string): string {
  const match = output.match(/(?:codex-cli\s+)?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) throw new CodexCliError("Unable to read the Codex CLI version.", "invalid");
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

export function parseClaudeVersion(output: string): string {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)(?:\s+\(Claude Code\))?/i);
  if (!match) throw new CodexCliError("Unable to read the Claude CLI version.", "invalid");
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function isMinimumVersion(version: string): boolean {
  const parts = version.split(".").map(Number);
  for (let index = 0; index < MINIMUM_CODEX_VERSION.length; index += 1) {
    if (parts[index] > MINIMUM_CODEX_VERSION[index]) return true;
    if (parts[index] < MINIMUM_CODEX_VERSION[index]) return false;
  }
  return true;
}

/** COSGRAL W5-BE1: the person's own CLI path and the CLI downloaded by COSGRAL (managed-cli.ts), when set. */
export type ManagedCliResolver = (command: "codex" | "claude") => { custom: string | null; managed: string | null };
let managedCliResolver: ManagedCliResolver | null = null;

export function setManagedCliResolver(resolver: ManagedCliResolver | null): void {
  managedCliResolver = resolver;
}

/**
 * Order: the environment override (tests, development), then the person's own path (used alone), then the downloaded
 * CLI, then the system one (PATH and the known install folders).
 */
async function collectCandidates(command: "codex" | "claude", configuredPath: string | undefined): Promise<string[]> {
  const override = configuredPath?.trim();
  if (override) return [override];
  const own = managedCliResolver?.(command);
  if (own?.custom) return [own.custom];
  return [...new Set([...(own?.managed ? [own.managed] : []), ...(await systemCandidates(command))])];
}

/** COSGRAL W5-BE1: a CLI installed on the system (not the custom or downloaded one), with its version; null if none. */
export async function findSystemCli(
  command: "codex" | "claude",
): Promise<{ executable: string; version: string | null } | null> {
  for (const candidate of await systemCandidates(command)) {
    if (!(await isExecutable(candidate))) continue;
    try {
      const output = await readCliVersion(candidate);
      return {
        executable: candidate,
        version: command === "codex" ? parseCodexVersion(output) : parseClaudeVersion(output),
      };
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function systemCandidates(command: "codex" | "claude"): Promise<string[]> {
  const candidates: string[] = [];
  if (process.platform === "win32") {
    candidates.push(...(await windowsPathCandidates(command)));
    candidates.push(...windowsFallbackPaths(command));
  } else {
    try {
      const { stdout } = await execFileAsync("/bin/zsh", ["-lic", `command -v ${command}`], {
        timeout: 5_000,
        maxBuffer: 64 * 1024,
      });
      if (stdout.trim()) candidates.push(stdout.trim());
    } catch {
      // Packaged macOS apps often have a restricted PATH; known locations are checked next.
    }
    candidates.push(...posixFallbackPaths(command));
  }

  return [...new Set(candidates)];
}

/**
 * COSGRAL W4-BE4: the PATH entries for a CLI on Windows (`where.exe <command>`). It had 5 s; on a busy computer the
 * lookup timed out and a CLI installed only on PATH looked "Not installed". Now the same long limit and one more try
 * as `codex --version`. Any failure (not on PATH, no answer) leaves the known install folders to the caller.
 */
export async function windowsPathCandidates(
  command: "codex" | "claude",
  run: (candidate: string, args: readonly string[], timeoutMs: number) => Promise<string> = runCliWithRetry,
): Promise<string[]> {
  try {
    const stdout = await run("where.exe", [command], CLI_VERSION_TIMEOUT_MS);
    return stdout
      .split(/\r?\n/u)
      .map((path) => path.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function windowsFallbackPaths(
  command: "codex" | "claude",
  userHome = homedir(),
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const paths: string[] = [];
  const appData = environment.APPDATA?.trim();
  const localAppData = environment.LOCALAPPDATA?.trim();

  if (command === "codex" && localAppData) {
    paths.push(win32.join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe"));
  }
  if (command === "claude" && localAppData) {
    paths.push(win32.join(localAppData, "Microsoft", "WinGet", "Links", "claude.exe"));
  }
  if (appData) paths.push(win32.join(appData, "npm", `${command}.cmd`));
  paths.push(
    win32.join(userHome, ".local", "bin", `${command}.exe`),
    win32.join(userHome, ".bun", "bin", `${command}.exe`),
    win32.join(userHome, ".bun", "bin", `${command}.cmd`),
  );
  if (localAppData) {
    paths.push(win32.join(localAppData, "pnpm", `${command}.exe`), win32.join(localAppData, "pnpm", `${command}.cmd`));
  }

  return paths;
}

function posixFallbackPaths(command: "codex" | "claude"): string[] {
  const paths = [join(homedir(), ".local", "bin", command)];
  if (command === "claude") paths.push(join(homedir(), ".claude", "local", "claude"));
  paths.push(`/opt/homebrew/bin/${command}`, `/usr/local/bin/${command}`);
  return paths;
}

export interface CliCommand {
  command: string;
  args: string[];
  windowsVerbatimArguments: boolean;
}

/**
 * COSGRAL: how to start an agent CLI without `shell: true`. On Windows a shell splits
 * unquoted paths at spaces ("C:\Users\First Last\..."), so `.cmd`/`.bat` shims run through
 * a quoted `cmd.exe` command line and native executables start directly.
 */
export function cliCommand(
  executable: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  comSpec: string | undefined = process.env.ComSpec,
): CliCommand {
  if (platform !== "win32" || ![".bat", ".cmd"].includes(extname(executable).toLowerCase())) {
    return { command: executable, args: [...args], windowsVerbatimArguments: false };
  }
  for (const argument of args) {
    if (!SAFE_SHIM_ARGUMENT.test(argument)) throw new Error("Unsafe CLI argument for a Windows command shim.");
  }
  const commandLine = [`"${executable.replaceAll("%", "%%")}"`, ...args].join(" ");
  return {
    command: comSpec?.trim() || "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    windowsVerbatimArguments: true,
  };
}

const SAFE_SHIM_ARGUMENT = /^[\w:/.=-]+$/u;

/**
 * COSGRAL W4-BE2: how long `<cli> --version` may take. A first start on a busy Windows computer (antivirus scan,
 * little free memory, a Node-based shim) took longer than the old 5 s, and the CLI was then reported as broken.
 */
export const CLI_VERSION_TIMEOUT_MS = 20_000;

export async function readCliVersion(candidate: string, timeoutMs = CLI_VERSION_TIMEOUT_MS): Promise<string> {
  return runCliWithRetry(candidate, ["--version"], timeoutMs);
}

/**
 * COSGRAL W4-BE2/BE3: runs a short CLI check (`--version`, `auth status`) with a long limit and one more try after a
 * timeout; a second timeout throws CliTimeoutError, so callers can say "did not answer" instead of guessing.
 * Other failures (non-zero exit, missing file) throw the execFile error, which keeps stdout for callers that read it.
 */
export async function runCliWithRetry(
  candidate: string,
  cliArgs: readonly string[],
  timeoutMs = CLI_VERSION_TIMEOUT_MS,
  options: CliRetryOptions = {},
): Promise<string> {
  const { command, args, windowsVerbatimArguments } = cliCommand(candidate, cliArgs);
  const exec =
    options.exec ??
    ((): Promise<{ stdout: string }> =>
      execFileAsync(command, args, {
        timeout: timeoutMs,
        maxBuffer: 64 * 1024,
        windowsHide: process.platform === "win32",
        windowsVerbatimArguments,
      }));
  try {
    return (await exec()).stdout;
  } catch (error) {
    const timedOut = isTimeout(error);
    if (!timedOut && !isBlockedStart(error)) throw error;
    // W6-KK3: a file that is still being scanned (a fresh 370 MB download, antivirus) is "in use" or "blocked" for a
    // moment: wait a little before the second try. A timeout is retried at once, as before.
    if (!timedOut) await new Promise((done) => setTimeout(done, options.pauseMs ?? CLI_BLOCKED_RETRY_PAUSE_MS));
    // One more try: the second start is usually fast once the files are cached.
    try {
      return (await exec()).stdout;
    } catch (again) {
      if (isTimeout(again)) throw new CliTimeoutError();
      throw again;
    }
  }
}

/** W6-KK3: test seams of {@link runCliWithRetry}: the process start and the pause before a retry of a blocked start. */
export interface CliRetryOptions {
  exec?: () => Promise<{ stdout: string }>;
  pauseMs?: number;
}

export const CLI_BLOCKED_RETRY_PAUSE_MS = 1_500;

const BLOCKED_START_CODES = new Set(["EBUSY", "EPERM", "EACCES", "ETXTBSY", "UNKNOWN"]);

/** W6-KK3: the start failed because the file is in use or blocked (not because it is missing or answered with an error). */
function isBlockedStart(error: unknown): boolean {
  return error instanceof Error && "code" in error && isString(error.code) && BLOCKED_START_CODES.has(error.code);
}

/**
 * W6-KK3: one plain reason why a CLI did not start, for the message the person reads. Never the raw error text (it
 * carries the path, and so the user name) and never the output of the program.
 */
export function describeCliStartFailure(error: unknown): string {
  if (error instanceof CliTimeoutError || isTimeout(error)) return "timed out starting; the computer may be busy";
  if (error instanceof CodexCliError) return "it did not report a version this program understands";
  if (isBlockedStart(error)) return "blocked: the file is in use or held by a virus scan";
  if (error instanceof Error && "code" in error) {
    if (error.code === "ENOENT") return "the file is missing";
    if (isNumber(error.code)) return `exited with code ${error.code}`;
    if ("signal" in error && isString(error.signal)) return `stopped by signal ${error.signal}`;
  }
  return "it could not be run";
}

export class CliTimeoutError extends Error {}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && "killed" in error && error.killed === true;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
