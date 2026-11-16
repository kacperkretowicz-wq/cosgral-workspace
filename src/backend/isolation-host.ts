// COSGRAL W8-BE2: builds and calls `cosgral-job-host.exe` (source: isolation-host-source.ts). It is compiled on this computer
// with the .NET Framework compiler that comes with Windows (no administrator, no download) into the program's own folder,
// and compiled again only when its source changed. Nothing here runs on another system.

import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ISOLATION_HOST_SOURCE, ISOLATION_HOST_VERSION } from "./isolation-host-source";

/** AppContainer capability: outgoing network (CLIs need it to reach their provider). */
export const CAPABILITY_INTERNET_CLIENT = "S-1-15-3-1";

export interface HostOptions {
  /** Most processes the program (with its children) may have at one time; none = no limit. */
  maxProcesses?: number;
  /** Everything the program left running ends with it. On by default: only `false` keeps it. */
  killOnExit?: boolean;
  cwd?: string;
  appContainer?: {
    /** A stable name: the same name is the same container (its folder grants). */
    name: string;
    capabilities?: readonly string[];
    /** Folders the container may use; `write` also lets it change them. Granted before the start, removed after the exit. */
    grants: ReadonlyArray<{ path: string; write: boolean }>;
  };
}

/** The csc.exe of the .NET Framework 4 (64-bit first); null when this computer has none. */
export function findCsc(env: NodeJS.ProcessEnv = process.env): string | null {
  const windows = env.WINDIR ?? env.SystemRoot ?? "C:Windows";
  for (const folder of ["Framework64", "Framework"]) {
    const candidate = join(windows, "Microsoft.NET", folder, "v4.0.30319", "csc.exe");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** The host program, compiled into `folder` when it is not there yet (or its source changed). Returns its path. */
export async function ensureIsolationHost(folder: string, csc: string | null = findCsc()): Promise<string> {
  if (process.platform !== "win32") throw new Error("Process isolation is only for Windows.");
  if (!csc) throw new Error("The .NET Framework compiler (csc.exe) was not found on this computer.");
  const hash = createHash("sha256").update(ISOLATION_HOST_SOURCE).digest("hex").slice(0, 12);
  const exe = join(folder, `cosgral-job-host-v${ISOLATION_HOST_VERSION}-${hash}.exe`);
  if (existsSync(exe)) return exe;
  await mkdir(folder, { recursive: true });
  const source = join(folder, `cosgral-job-host-${hash}.cs`);
  await writeFile(source, ISOLATION_HOST_SOURCE, "utf8");
  await new Promise<void>((resolve, reject) => {
    execFile(
      csc,
      ["/nologo", "/target:exe", "/optimize+", `/out:${exe}`, source],
      { windowsHide: true, timeout: 60_000 },
      (error, stdout, stderr) => {
        if (error)
          reject(new Error(`The isolation helper could not be built: ${(stdout || stderr || error.message).trim()}`));
        else resolve();
      },
    );
  });
  const built = await readFile(exe).catch(() => null);
  if (!built) throw new Error("The isolation helper was not produced.");
  return exe;
}

/** The command line that starts `file args…` through the host. Pass it to `spawn` instead of the program itself. */
export function hostCommand(
  host: string,
  options: HostOptions,
  file: string,
  args: readonly string[],
): { command: string; args: string[] } {
  const out: string[] = [];
  if (options.maxProcesses !== undefined)
    out.push("--max-processes", String(Math.max(1, Math.floor(options.maxProcesses))));
  if (options.killOnExit === false) out.push("--keep-on-exit");
  if (options.cwd) out.push("--cwd", options.cwd);
  const container = options.appContainer;
  if (container) {
    out.push("--appcontainer", container.name);
    for (const capability of container.capabilities ?? [CAPABILITY_INTERNET_CLIENT])
      out.push("--capability", capability);
    for (const grant of container.grants) out.push("--grant", `${grant.path}${grant.write ? ":rw" : ":r"}`);
  }
  return { command: host, args: [...out, "--", file, ...args] };
}

/** Removes the folder grants of an AppContainer (after a host that was killed could not do it itself). */
export function revokeCommand(
  host: string,
  name: string,
  folders: readonly string[],
): { command: string; args: string[] } {
  return { command: host, args: ["--revoke", name, ...folders] };
}

/** Removes the AppContainer itself (its per-user profile). The folder grants should be revoked first. */
export function deleteProfileCommand(host: string, name: string): { command: string; args: string[] } {
  return { command: host, args: ["--delete-profile", name] };
}

/** What `cosgral-job-host.exe --probe` found: null for a part that works, the reason for one that does not. */
export interface HostProbe {
  job: string | null;
  appContainer: string | null;
  windows: string | null;
}

export function parseHostProbe(output: string): HostProbe {
  const field = (name: string): string | null => {
    const line = output.split(/\r?\n/).find((candidate) => candidate.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : null;
  };
  const verdict = (value: string | null): string | null => (value === "ok" ? null : (value ?? "Not reported."));
  return { job: verdict(field("job")), appContainer: verdict(field("appcontainer")), windows: field("windows") };
}

export function runHostProbe(host: string): Promise<HostProbe> {
  return new Promise((resolve, reject) => {
    execFile(host, ["--probe"], { windowsHide: true, timeout: 15_000 }, (error, stdout) => {
      if (error) reject(new Error(`The isolation helper did not answer: ${error.message}`));
      else resolve(parseHostProbe(stdout));
    });
  });
}

/** What the Claude SDK hands to a custom starter of its process. */
export interface HostSpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  env: { [name: string]: string | undefined };
  signal: AbortSignal;
}

/** The helper can start a program, not a `.cmd` shim or a script (those need the shell); the rest is started as before. */
export function canStartThroughHost(command: string): boolean {
  return !/\.(cmd|bat|ps1|js|mjs|cjs)$/i.test(command);
}

/**
 * Starts the program of a Claude conversation. Through the helper when it can be (inside a Job Object: a cap on processes, and
 * everything ends with it, also when COSGRAL Workspace itself is stopped); plainly otherwise, exactly as the SDK would.
 */
export function spawnThroughHost(
  wrap: { host: string; maxProcesses: number } | null,
  options: HostSpawnOptions,
): ChildProcessWithoutNullStreams {
  const through = wrap && canStartThroughHost(options.command) ? wrap : null;
  const command = through
    ? hostCommand(through.host, { maxProcesses: through.maxProcesses }, options.command, options.args)
    : { command: options.command, args: options.args };
  const child = spawn(command.command, command.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    signal: options.signal,
  });
  child.stderr.resume();
  return child;
}
