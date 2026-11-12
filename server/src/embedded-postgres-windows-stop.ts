import { execFile } from "node:child_process";

/**
 * On Windows `embedded-postgres` stops the cluster with `taskkill /f /t`: a
 * hard kill that forces crash recovery on the next start and can race with a
 * backend the postmaster is forking, leaving an orphan that holds the shared
 * memory block (see embedded-postgres-orphans.ts). `pg_ctl stop -m fast`
 * asks the postmaster to shut down cleanly instead; the forced stop remains
 * the fallback.
 */

type ChildLike = {
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
  once(event: "exit", listener: () => void): unknown;
};

type StoppableInstance = {
  stop(): Promise<void>;
  process?: ChildLike;
};

type Options = {
  dataDir: string;
  pgCtlPath: string | null;
  platform?: NodeJS.Platform;
  runPgCtl?: (pgCtlPath: string, args: string[]) => Promise<number>;
  exitTimeoutMs?: number;
  log?: (message: string) => void;
};

function hasExited(child: ChildLike): boolean {
  return (child.exitCode !== null && child.exitCode !== undefined) ||
    (child.signalCode !== null && child.signalCode !== undefined);
}

function runPgCtlProcess(pgCtlPath: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    execFile(pgCtlPath, args, { windowsHide: true, timeout: 45_000 }, (error) => {
      if (!error) return resolve(0);
      const code = typeof (error as { code?: unknown }).code === "number" ? (error as { code: number }).code : -1;
      resolve(code === 0 ? -1 : code);
    });
  });
}

export function installWindowsCleanStop<T extends StoppableInstance>(instance: T, options: Options): T {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32" || !options.pgCtlPath) return instance;
  const pgCtlPath = options.pgCtlPath;
  const runPgCtl = options.runPgCtl ?? runPgCtlProcess;
  const forcedStop = instance.stop.bind(instance);

  instance.stop = async () => {
    const child = instance.process;
    if (!child) return forcedStop();
    if (hasExited(child)) {
      // The library would wait forever for an exit event that already fired.
      instance.process = undefined;
      return;
    }
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const code = await runPgCtl(pgCtlPath, ["stop", "-D", options.dataDir, "-m", "fast", "-w", "-t", "30"]);
    if (code === 0) {
      const timeoutMs = options.exitTimeoutMs ?? 10_000;
      let timer: NodeJS.Timeout | undefined;
      const stoppedCleanly = await Promise.race([
        exited.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (stoppedCleanly || hasExited(child)) {
        instance.process = undefined;
        return;
      }
    }
    options.log?.(`pg_ctl stop did not stop embedded PostgreSQL (exit ${code}); forcing stop`);
    if (hasExited(child)) {
      instance.process = undefined;
      return;
    }
    return forcedStop();
  };
  return instance;
}
