import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Windows-only recovery for embedded PostgreSQL after a hard kill.
 *
 * When the postmaster is killed (taskkill /F, crash) a backend it forked a
 * moment earlier can survive as an orphan. On Windows that orphan keeps the
 * shared memory block and the inherited listen socket, so the next start
 * fails with "pre-existing shared memory block is still in use" and the
 * configured port looks busy.
 *
 * A process is treated as an orphan only when it is postgres and either
 *  A) its parent is the dead postmaster recorded in postmaster.pid, or
 *  B) it is a `--forkchild` backend started from this checkout's embedded
 *     PostgreSQL binary and its parent is no longer running.
 * A live postmaster (even one whose Node parent died) and its children are
 * never selected, and other checkouts use other binaries.
 */

export type PostgresProcessInfo = {
  pid: number;
  parentPid: number;
  name: string;
  executablePath?: string | null;
  commandLine?: string | null;
};

type SelectOptions = {
  deadPostmasterPid: number | null;
  binaryDir: string | null;
  isPidRunning: (pid: number) => boolean;
};

type ReapOptions = {
  postmasterPidFile: string;
  isPidRunning: (pid: number) => boolean;
  platform?: NodeJS.Platform;
  /** Directory of this checkout's postgres.exe; resolved from embedded-postgres when omitted. */
  binaryDir?: string | null;
  listProcesses?: () => Promise<PostgresProcessInfo[]>;
  killProcess?: (pid: number) => Promise<void>;
  waitForExitMs?: number;
  log?: (message: string) => void;
};

function readPostmasterPid(file: string): number | null {
  if (!existsSync(file)) return null;
  try {
    const pid = Number(readFileSync(file, "utf8").split(/\r?\n/)[0]?.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function normalizeDir(value: string): string {
  return path.win32.normalize(value.replace(/\//g, "\\")).replace(/\\+$/, "").toLowerCase();
}

function isInsideDir(filePath: string | null | undefined, dir: string): boolean {
  if (!filePath) return false;
  return normalizeDir(path.win32.dirname(filePath.replace(/\//g, "\\"))) === normalizeDir(dir);
}

/** Windows often hides ExecutablePath of an orphan; its command line still names the binary. */
function executableOf(proc: PostgresProcessInfo): string | null {
  if (proc.executablePath) return proc.executablePath;
  const commandLine = proc.commandLine?.trim();
  if (!commandLine) return null;
  if (commandLine.startsWith('"')) {
    const end = commandLine.indexOf('"', 1);
    return end > 1 ? commandLine.slice(1, end) : null;
  }
  return commandLine.split(/\s+/, 1)[0] ?? null;
}

export function selectOrphanedPostgresChildren(
  processes: PostgresProcessInfo[],
  { deadPostmasterPid, binaryDir, isPidRunning }: SelectOptions,
): number[] {
  return processes
    .filter((proc) => /^postgres(\.exe)?$/i.test(proc.name))
    .filter((proc) => {
      if (deadPostmasterPid !== null && proc.parentPid === deadPostmasterPid) return true;
      return Boolean(
        binaryDir &&
          isInsideDir(executableOf(proc), binaryDir) &&
          proc.commandLine?.includes("--forkchild") &&
          !isPidRunning(proc.parentPid),
      );
    })
    .map((proc) => proc.pid);
}

export function resolveEmbeddedPostgresBinaryDir(): string | null {
  if (process.platform !== "win32" || process.arch !== "x64") return null;
  try {
    // Same layout rule as packages/db embedded-postgres-native.ts: the native
    // package sits next to embedded-postgres. Postgres reports the real path
    // (pnpm store), not the node_modules junction, so resolve it.
    const embeddedEntry = createRequire(import.meta.url).resolve("embedded-postgres");
    const packageRoot = path.dirname(path.dirname(embeddedEntry));
    const binaryDir = path.resolve(packageRoot, "..", "@embedded-postgres", "windows-x64", "native", "bin");
    return existsSync(binaryDir) ? realpathSync.native(binaryDir) : null;
  } catch {
    return null;
  }
}

function execFileText(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });
}

type CimProcess = {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  ExecutablePath?: string | null;
  CommandLine?: string | null;
};

export async function listWindowsPostgresProcesses(): Promise<PostgresProcessInfo[]> {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='postgres.exe'\" | " +
    "Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress";
  const stdout = (await execFileText("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script])).trim();
  if (!stdout) return [];
  const parsed = JSON.parse(stdout) as CimProcess | CimProcess[];
  return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
    pid: entry.ProcessId,
    parentPid: entry.ParentProcessId,
    name: entry.Name,
    executablePath: entry.ExecutablePath ?? null,
    commandLine: entry.CommandLine ?? null,
  }));
}

async function killWindowsProcess(pid: number): Promise<void> {
  try {
    await execFileText("taskkill.exe", ["/PID", String(pid), "/F"]);
  } catch {
    // Already gone; the wait below decides.
  }
}

export async function reapOrphanedEmbeddedPostgresChildren(options: ReapOptions): Promise<number[]> {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") return [];

  const recordedPid = readPostmasterPid(options.postmasterPidFile);
  const deadPostmasterPid = recordedPid !== null && !options.isPidRunning(recordedPid) ? recordedPid : null;
  const binaryDir = options.binaryDir === undefined ? resolveEmbeddedPostgresBinaryDir() : options.binaryDir;
  if (deadPostmasterPid === null && !binaryDir) return [];

  const listProcesses = options.listProcesses ?? listWindowsPostgresProcesses;
  const killProcess = options.killProcess ?? killWindowsProcess;
  let orphans: number[];
  try {
    orphans = selectOrphanedPostgresChildren(await listProcesses(), {
      deadPostmasterPid,
      binaryDir,
      isPidRunning: options.isPidRunning,
    });
  } catch (error) {
    options.log?.(`Could not list PostgreSQL processes: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
  if (orphans.length === 0) return [];

  options.log?.(`Stopping ${orphans.length} orphaned embedded PostgreSQL process(es): ${orphans.join(", ")}`);
  for (const pid of orphans) await killProcess(pid);

  const deadline = Date.now() + (options.waitForExitMs ?? 5_000);
  while (Date.now() < deadline && orphans.some((pid) => options.isPidRunning(pid))) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return orphans;
}
