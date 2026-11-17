// Starts a COPY of a program (OpenBot 0.71 or our own) for the probe with a clean environment: no sign-in or token variables of
// the person or the shell, profile folders inside the sandbox, a data folder of its own per start, a debug port on this computer.
// Starting a program is a heavy step: run this only after the leader's GO file.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { cleanEnvironment } from "../sandbox-env.ts";

export interface ProbeLaunchInput {
  /** The copy of the program (never the one the person uses). */
  exe: string;
  /** The sandbox folder; every profile and data folder is made inside it. */
  root: string;
  port: number;
  /** The inherited environment; default = this shell. */
  source?: NodeJS.ProcessEnv;
  /** Tells starts apart (a new data folder each); default = the time. */
  stamp?: string;
}

export interface ProbeLaunch {
  exe: string;
  args: string[];
  env: Record<string, string>;
  dataDir: string;
}

export function probeLaunch(input: ProbeLaunchInput): ProbeLaunch {
  const { port } = input;
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error("The debug port is a whole number from 1024 to 65535.");
  }
  const home = join(input.root, "home");
  const dataDir = join(input.root, `data-${input.stamp ?? Date.now().toString(36)}`);
  return {
    exe: input.exe,
    dataDir,
    args: [
      "--lang=en-US",
      `--user-data-dir=${dataDir}`,
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
    ],
    env: {
      ...cleanEnvironment(input.source),
      USERPROFILE: home,
      HOME: home,
      APPDATA: join(home, "AppData", "Roaming"),
      LOCALAPPDATA: join(home, "AppData", "Local"),
      TEMP: join(input.root, "tmp"),
      TMP: join(input.root, "tmp"),
    },
  };
}

/** Makes the folders and starts the copy detached; returns its process id. */
export function launchCopy(input: ProbeLaunchInput): { pid: number | undefined; launch: ProbeLaunch } {
  const launch = probeLaunch(input);
  for (const folder of [launch.dataDir, launch.env.APPDATA, launch.env.LOCALAPPDATA, launch.env.TEMP]) {
    if (folder) mkdirSync(folder, { recursive: true });
  }
  const child = spawn(launch.exe, launch.args, { env: launch.env, detached: true, stdio: "ignore" });
  child.unref();
  return { pid: child.pid, launch };
}
