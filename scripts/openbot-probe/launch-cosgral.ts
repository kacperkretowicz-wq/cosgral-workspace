// Starts OUR OWN app for `probe.ts --target cosgral` with a stand-in Codex CLI (the one the sandbox e2e uses), so the first screen
// ("Set up this computer") can be passed and the probe sees the main window. Heavy: run it only after the leader's GO file.
//
//   node scripts/openbot-probe/launch-cosgral.ts --root <sandbox folder OUTSIDE the repo> --port 9340
//   node scripts/openbot-probe/probe.ts --target cosgral --cdp http://127.0.0.1:9340 --create-agent --out <folder outside the repo>
//
// The app starts with a clean environment (no sign-in or token variables of the person), profile folders inside the sandbox and a new
// data folder per start. The stand-in CLI answers from a script; no real account is used. Stop the app when the probe is done.
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { launchCopy } from "./launch.ts";
import { isInsideRepo } from "./policy.ts";

const REPO_ROOT = resolve(import.meta.dirname ?? ".", "..", "..");

/** Writes the stand-in `codex.cmd` (runs `acceptance-codex.cjs` with Electron as Node) and returns its path. */
export async function installCliFixture(root: string, repo: string = REPO_ROOT): Promise<string> {
  const folder = join(root, "fixture");
  await mkdir(folder, { recursive: true });
  await copyFile(join(repo, "scripts", "acceptance-codex.cjs"), join(folder, "codex.cjs"));
  const electron = join(repo, "node_modules", "electron", "dist", "electron.exe");
  const command = join(folder, "codex.cmd");
  await writeFile(command, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electron}" "%~dp0codex.cjs" %*\r\n`);
  return command;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const rootArgument = value("root");
  if (!rootArgument) throw new Error("--root <sandbox folder outside the repository> is required.");
  const root = resolve(rootArgument);
  if (isInsideRepo(root, REPO_ROOT)) throw new Error("The sandbox folder must be outside the repository.");
  const port = Number(value("port") ?? "9340");
  const codex = await installCliFixture(root);
  const { pid, launch } = launchCopy({
    exe: join(REPO_ROOT, "node_modules", "electron", "dist", "electron.exe"),
    root,
    port,
    extraArgs: [REPO_ROOT],
    extraEnv: { OPENBOT_CODEX_PATH: codex, OPENBOT_CLAUDE_PATH: join(root, "fixture", "missing-claude.exe") },
  });
  console.log(`started our app, pid ${String(pid)}, debug port ${port}, data ${launch.dataDir}`);
}

if (process.argv[1]?.endsWith("launch-cosgral.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
