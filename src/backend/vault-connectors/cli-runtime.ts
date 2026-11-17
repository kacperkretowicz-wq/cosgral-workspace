// COSGRAL W11-KK (d): the real way to run a manager's tool: no shell, no inherited identity, a time limit and a size limit, and an
// error that carries NOTHING of the tool's output (it can hold item names or a token). Tests use fakes instead of this file.

import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import type { RunCli } from "./common";

/** Variables that would make `op` act as another identity than the one the caller chooses. */
const OP_IDENTITY_VARIABLES = new Set(["OP_SERVICE_ACCOUNT_TOKEN", "OP_CONNECT_TOKEN", "OP_CONNECT_HOST"]);
/** What `bw` needs from the person's environment (nothing else is passed on). */
const BW_INHERITED = [
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "PATH",
  "BITWARDENCLI_APPDATA_DIR",
] as const;

const TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function baseName(executable: string): string {
  return (executable.split(/[\\/]/u).pop() ?? "").toLowerCase().replace(/\.exe$/u, "");
}

/** Environment for one run: `bw` gets a short list, `op` the person's own minus any identity variable; `extra` is added on top. */
export function environmentFor(
  executable: string,
  extra: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (baseName(executable) === "bw") {
    for (const name of BW_INHERITED) {
      const value = process.env[name];
      if (value) env[name] = value;
    }
  } else {
    for (const [name, value] of Object.entries(process.env)) {
      if (value !== undefined && !OP_IDENTITY_VARIABLES.has(name)) env[name] = value;
    }
  }
  return { ...env, ...extra };
}

export const runManagerCli: RunCli = (executable, args, options) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      executable,
      [...args],
      {
        env: environmentFor(executable, options.env),
        signal: options.signal,
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        // Only the kind of failure; never stdout, stderr or the message of the tool.
        reject(error.name === "AbortError" ? error : new Error("The command failed."));
      },
    );
  });

/** Every absolute `PATH` directory plus the usual install places, for a tool called `name` (".exe" is added on Windows). */
export async function findManagerCli(name: "op" | "bw", directories?: readonly string[]): Promise<string[]> {
  const file = process.platform === "win32" ? `${name}.exe` : name;
  const places = directories ?? [...(process.env.PATH ?? "").split(delimiter), "/opt/homebrew/bin", "/usr/local/bin"];
  const found: string[] = [];
  for (const directory of new Set(places.filter((place) => place.length > 0 && isAbsolute(place)))) {
    try {
      const path = await realpath(join(directory, file));
      await access(path, constants.X_OK);
      if (!found.includes(path)) found.push(path);
    } catch {
      // Not in this directory.
    }
  }
  return found;
}
