// COSGRAL W4-BE5: "Delete my data". The window asks, the program stops its agents, writes a marker next to (never
// inside) the data folder and restarts. The next start removes the data before anything opens it (the database,
// Chromium's profile), then starts like the first time.
//
// The guard allows exactly two folders: the program's data folder (Electron userData, a "COSGRAL Workspace…" folder
// directly in AppData) and the agents' folder ("COSGRAL Workspace" directly in the home folder). It refuses the home
// folder, AppData, %APPDATA%\OpenBot and anything else. The removal never follows a symbolic link or junction: a link
// is removed as a link, so its target stays.

import { existsSync, lstatSync, readdirSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

export interface WipePaths {
  /** Electron userData (the program's data folder). */
  userData: string;
  /** The person's home folder (where the agents' folder lives). */
  home: string;
  /** Electron appData (%APPDATA% on Windows). */
  appData: string;
}

export interface WipeOutcome {
  removed: string[];
  /** Entries that stayed (still locked after the retries), relative to their data folder. */
  failures: string[];
}

const DATA_NAME = /^COSGRAL Workspace( [A-Za-z ]+)?$/;
const AGENTS_FOLDER = "COSGRAL Workspace";

/** The marker of a requested wipe: a file next to the data folder, so removing the folder never removes the marker. */
export function wipeMarkerPath(userData: string): string {
  return `${resolve(userData)}.wipe-pending`;
}

/** The window confirmed: remember the request for the next start. The marker holds no paths. */
export function requestDataWipe(userData: string): void {
  writeFileSync(wipeMarkerPath(userData), `${JSON.stringify({ requestedAt: new Date().toISOString() })}\n`, {
    mode: 0o600,
  });
}

/** The two folders a wipe removes, each checked by the guard. */
export function wipeRoots(paths: WipePaths): string[] {
  const options = { home: paths.home, appData: paths.appData };
  const roots = [resolve(paths.userData), resolve(paths.home, AGENTS_FOLDER)];
  for (const root of roots) assertSafeWipeRoot(root, options);
  return roots;
}

/** Throws unless `root` is a COSGRAL data folder directly in AppData or the home folder, and not a link. */
export function assertSafeWipeRoot(root: string, options: { home: string; appData: string }): void {
  if (!isAbsolute(root)) throw new Error(`Refusing to delete a relative path: ${root}`);
  const target = resolve(root);
  const home = resolve(options.home);
  const appData = resolve(options.appData);
  const same = (a: string, b: string) => normalize(a) === normalize(b);
  if (same(target, home) || same(target, appData)) throw new Error("Refusing to delete the home or AppData folder.");
  if (isInside(target, join(appData, "OpenBot")) || same(target, join(appData, "OpenBot")))
    throw new Error("Refusing to touch the OpenBot data folder.");
  if (!DATA_NAME.test(basename(target))) throw new Error(`Not a COSGRAL data folder: ${basename(target)}`);
  const parent = dirname(target);
  if (!same(parent, appData) && !same(parent, home))
    throw new Error("A COSGRAL data folder must sit directly in AppData or in the home folder.");
  if (same(parent, home) && basename(target) !== AGENTS_FOLDER)
    throw new Error("Only the agents' folder may be deleted from the home folder.");
  if (!existsSync(target)) return;
  if (lstatSync(target).isSymbolicLink()) throw new Error("Refusing to delete through a link or junction.");
  const real = realpathSync.native(target);
  if (
    !same(dirname(real), realpathSync.native(parent)) ||
    basename(real).toLowerCase() !== basename(target).toLowerCase()
  )
    throw new Error("Refusing to delete through a link or junction.");
}

/**
 * At start, before the database or Chromium opens anything: runs a requested wipe. Null when none was requested.
 * Synchronous on purpose (it runs before the app is ready). Locked entries are retried briefly and reported.
 */
export function runPendingDataWipe(paths: WipePaths): WipeOutcome | null {
  const marker = wipeMarkerPath(paths.userData);
  if (!existsSync(marker)) return null;
  const roots = wipeRoots(paths);
  const failures: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    removeChildren(root, root, failures);
    attempt(() => rmdirSync(root));
  }
  attempt(() => unlinkSync(marker));
  return { removed: roots, failures };
}

function removeChildren(root: string, folder: string, failures: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(folder);
  } catch {
    failures.push(relative(root, folder));
    return;
  }
  for (const name of entries) {
    const path = join(folder, name);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(path);
    } catch {
      continue;
    }
    // Chromium's single-instance lock file of this very start is held open; it is empty and harmless.
    if (folder === root && name === "lockfile") continue;
    let removed: boolean;
    if (stat.isSymbolicLink()) removed = attempt(() => removeLink(path));
    else if (stat.isDirectory()) {
      removeChildren(root, path, failures);
      removed = attempt(() => rmdirSync(path));
    } else removed = attempt(() => unlinkSync(path));
    if (!removed && existsSync(path)) failures.push(relative(root, path));
  }
}

/** A link or junction is removed as itself; its target is never opened. */
function removeLink(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    rmdirSync(path); // a directory junction on Windows
  }
}

/** A few short tries for files a closing process still holds (EBUSY, EPERM). */
function attempt(work: () => void): boolean {
  for (let tryNumber = 0; tryNumber < 5; tryNumber += 1) {
    try {
      work();
      return true;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") return true;
      if (!["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"].includes(code)) return false;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (tryNumber + 1));
    }
  }
  return false;
}

function normalize(path: string): string {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isInside(child: string, parent: string): boolean {
  return normalize(child).startsWith(normalize(parent) + sep);
}

function relative(root: string, path: string): string {
  return path === root ? "." : path.slice(root.length + 1);
}
