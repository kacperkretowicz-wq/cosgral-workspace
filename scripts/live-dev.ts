// COSGRAL W11-KK: a "live copy" of the program for bots (agents that test the program by itself).
// A live copy is its own git worktree, its own data folder (database, Vault, browser profile) and its own home
// for the agents' folder, so a bot never touches the owner's real data. This script only PREPARES the copy and
// PRINTS the command that starts it. It never starts Electron and never makes a network call.
//
//   bun scripts/live-dev.ts plan   <name> [--port N] [--root DIR] [--base REF]   (default: shows the layout)
//   bun scripts/live-dev.ts create <name> [--port N] [--root DIR] [--base REF]   (worktree + empty data folders)
//   bun scripts/live-dev.ts remove <name> [--root DIR]                           (worktree + data folders)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type LiveDevCommand = "plan" | "create" | "remove";

export interface LiveDevOptions {
  command: LiveDevCommand;
  name: string;
  /** Folder that holds all live copies. */
  root: string;
  /** Git ref the worktree starts from. */
  base: string;
  port: number;
}

export interface LiveDevLayout {
  name: string;
  branch: string;
  /** The copy's own checkout of the program. */
  worktree: string;
  /** Replaces APPDATA / XDG_CONFIG_HOME: Electron's userData is created below it. */
  appData: string;
  /** Replaces the user's home: the agents' folder is created below it. */
  home: string;
  outDir: string;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const livePortRange = { first: 5200, last: 5999 } as const;
// Only these variables reach the copy. Tokens, API keys and accounts of the owner are never passed on.
const PASS_THROUGH_ENVIRONMENT = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "ComSpec",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "TERM",
  "WINDIR",
] as const;

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
export const projectRoot = dirname(scriptsRoot);
export const defaultLiveRoot = resolve(projectRoot, "..", "..", "cosgral-live");

export function validateLiveName(name: string | undefined): string {
  if (!name || !NAME_PATTERN.test(name)) {
    throw new Error(
      "The copy name must be 1-32 characters: lower-case letters, digits and '-', starting with a letter or digit.",
    );
  }
  return name;
}

/** A stable port per name, so two copies do not fight for one dev server port. */
export function livePortForName(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
  const width = livePortRange.last - livePortRange.first + 1;
  return livePortRange.first + (hash % width);
}

export function resolveLiveLayout(root: string, name: string): LiveDevLayout {
  validateLiveName(name);
  const safeRoot = resolve(root);
  const base = join(safeRoot, name);
  const inside = (target: string): string => {
    const path = relative(safeRoot, target);
    if (path === "" || path.startsWith("..") || isAbsolute(path)) throw new Error(`Unsafe live copy path: ${target}`);
    return target;
  };
  return {
    name,
    branch: `live/${name}`,
    worktree: inside(join(base, "checkout")),
    appData: inside(join(base, "appdata")),
    home: inside(join(base, "home")),
    outDir: "out-dev-live",
  };
}

export function liveDevEnvironment(
  layout: LiveDevLayout,
  port: number,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of PASS_THROUGH_ENVIRONMENT) {
    const value = environment[key];
    if (value !== undefined) env[key] = value;
  }
  return {
    ...env,
    APPDATA: layout.appData,
    LOCALAPPDATA: join(layout.appData, "Local"),
    XDG_CONFIG_HOME: layout.appData,
    USERPROFILE: layout.home,
    HOME: layout.home,
    OPENBOT_APP_VARIANT: "dev",
    OPENBOT_DEV_PROFILE: "app",
    OPENBOT_DEV_RENDERER_PORT: String(port),
  };
}

/** The command that starts the copy. It is printed, never run by this script. */
export function liveStartCommand(layout: LiveDevLayout): string[] {
  const electronVite = join(
    layout.worktree,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron-vite.cmd" : "electron-vite",
  );
  return [electronVite, "dev", "--outDir", layout.outDir, "--entry", join(layout.outDir, "main", "index.js")];
}

export function parseLiveDevArgs(args: string[], defaultRoot = defaultLiveRoot): LiveDevOptions {
  const positional: string[] = [];
  let root = defaultRoot;
  let base = "HEAD";
  let port: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--root" || argument === "--base" || argument === "--port") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${argument} needs a value.`);
      index += 1;
      if (argument === "--root") root = resolve(value);
      else if (argument === "--base") base = value;
      else port = parsePort(value);
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}.`);
    } else {
      positional.push(argument);
    }
  }
  const first = positional[0];
  const hasCommand = first === "plan" || first === "create" || first === "remove";
  const command: LiveDevCommand = hasCommand ? first : "plan";
  const rest = hasCommand ? positional.slice(1) : positional;
  if (rest.length > 1) throw new Error("Give exactly one copy name.");
  if (base.startsWith("-")) throw new Error("--base must be a git ref, not an option.");
  const name = validateLiveName(rest[0]);
  return { command, name, root, base, port: port ?? livePortForName(name) };
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535)
    throw new Error("--port must be a whole number from 1024 to 65535.");
  return port;
}

export type GitRunner = (args: string[], cwd: string) => { ok: boolean; output: string };

/** Creates the worktree and the empty data folders. Refuses to touch anything that already exists. */
export function createLiveCopy(
  options: LiveDevOptions,
  git: GitRunner,
  fs: { exists: (path: string) => boolean; mkdir: (path: string) => void } = {
    exists: existsSync,
    mkdir: (path) => mkdirSync(path, { recursive: true }),
  },
): LiveDevLayout {
  const layout = resolveLiveLayout(options.root, options.name);
  for (const path of [layout.worktree, layout.appData, layout.home]) {
    if (fs.exists(path)) throw new Error(`Live copy "${options.name}" already exists: ${path}`);
  }
  fs.mkdir(dirname(layout.worktree));
  const result = git(["worktree", "add", "-b", layout.branch, layout.worktree, options.base], projectRoot);
  if (!result.ok) throw new Error(`git worktree add failed: ${result.output.trim()}`);
  fs.mkdir(layout.appData);
  fs.mkdir(layout.home);
  return layout;
}

/** Removes only the three folders of a copy and its worktree registration; the branch is kept. */
export function removeLiveCopy(
  options: LiveDevOptions,
  git: GitRunner,
  remove: (path: string) => void = (path) =>
    rmSync(path, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 }),
): LiveDevLayout {
  const layout = resolveLiveLayout(options.root, options.name);
  const result = git(["worktree", "remove", "--force", layout.worktree], projectRoot);
  if (!result.ok && existsSync(layout.worktree)) throw new Error(`git worktree remove failed: ${result.output.trim()}`);
  remove(layout.appData);
  remove(layout.home);
  return layout;
}

function runGit(args: string[], cwd: string): { ok: boolean; output: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function describe(layout: LiveDevLayout, port: number): string[] {
  const env = liveDevEnvironment(layout, port);
  return [
    `Live copy "${layout.name}" (branch ${layout.branch}, renderer port ${port})`,
    `- worktree : ${layout.worktree}`,
    `- APPDATA  : ${layout.appData}`,
    `- home     : ${layout.home}`,
    "Environment of the copy (only these are passed; no tokens of the owner):",
    ...Object.entries(env)
      .filter(
        ([key]) => key.startsWith("OPENBOT_") || ["APPDATA", "USERPROFILE", "HOME", "XDG_CONFIG_HOME"].includes(key),
      )
      .map(([key, value]) => `  ${key}=${value}`),
    "Start command (printed only, not run by this script):",
    `  ${JSON.stringify(liveStartCommand(layout))}`,
    "Before the first start: run `bun install` in the worktree.",
  ];
}

function main(): void {
  const options = parseLiveDevArgs(process.argv.slice(2));
  if (options.command === "plan") {
    console.log(describe(resolveLiveLayout(options.root, options.name), options.port).join("\n"));
    return;
  }
  if (options.command === "create") {
    const layout = createLiveCopy(options, runGit);
    console.log(["Created.", ...describe(layout, options.port)].join("\n"));
    return;
  }
  const layout = removeLiveCopy(options, runGit);
  console.log(`Removed live copy "${layout.name}". Branch ${layout.branch} was kept.`);
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && import.meta.url === pathToFileURL(resolve(entryPath)).href;
}

if (isMainModule()) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
