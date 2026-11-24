// COSGRAL W12 (BE-AE, parity row 45): "machine files" of the library. See ipc-machine-files.ts for the rules.
//
// The engine knows the folders the person granted and answers two questions: what is inside a granted folder, and
// which real file a request means. It never reads file content and never copies; the caller hands the verified path
// to LibraryStore.addFiles. Every path is resolved with realpath, so a link that leaves the granted folder is refused.

import { randomUUID } from "node:crypto";
import { readdir, realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import {
  type GrantMachineFolderOptions,
  isBlockedMachineName,
  type ListMachineFolderInput,
  MACHINE_FILES_LIMITS,
  type MachineFileEntry,
  type MachineFileRefusal,
  type MachineFileResolution,
  type MachineFolderGrant,
  type MachineListing,
  type ResolveMachineFileInput,
} from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";

export interface MachineFilesLimits {
  grants: number;
  entriesPerListing: number;
  fileBytes: number;
}

export interface MachineFilesOptions {
  now?: () => Date;
  /** Tests only; the program uses MACHINE_FILES_LIMITS. */
  limits?: Partial<MachineFilesLimits>;
  /** The home folder is too broad to grant; tests pass their own. */
  homeDir?: string;
}

/** Folders that hold system files, program data or secrets; a path with one of them is not granted. */
const BLOCKED_FOLDERS = new Set([
  "appdata",
  "programdata",
  "windows",
  "system32",
  "syswow64",
  "program files",
  "program files (x86)",
  "$recycle.bin",
  "system volume information",
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".kube",
  ".docker",
]);

type Refusal = { refused: MachineFileRefusal };

export class MachineFiles {
  readonly #grants = new Map<string, MachineFolderGrant>();
  readonly #now: () => Date;
  readonly #limits: MachineFilesLimits;
  readonly #homeDir: string;

  constructor(options: MachineFilesOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#limits = {
      grants: options.limits?.grants ?? MACHINE_FILES_LIMITS.grants,
      entriesPerListing: options.limits?.entriesPerListing ?? MACHINE_FILES_LIMITS.entriesPerListing,
      fileBytes: options.limits?.fileBytes ?? MACHINE_FILES_LIMITS.fileBytes,
    };
    this.#homeDir = options.homeDir ?? homedir();
  }

  grants(): MachineFolderGrant[] {
    return [...this.#grants.values()];
  }

  /** The person chose this folder. Throws a sentence for the person when the folder cannot be granted. */
  async grant(path: string, options: GrantMachineFolderOptions = {}): Promise<MachineFolderGrant> {
    if (!isString(path) || !path) throw new Error("Choose a folder.");
    const real = await realpath(path).catch(() => null);
    if (!real) throw new Error(`Folder not found: ${basename(path)}`);
    const info = await stat(real);
    if (!info.isDirectory()) throw new Error("Choose a folder, not a file.");
    if (parse(real).root === real || (await this.#isHome(real))) {
      throw new Error("That folder is too broad. Choose a folder inside it.");
    }
    if (await this.#hasBlockedFolder(real))
      throw new Error("That folder is not allowed: it holds system data or secrets.");
    const existing = [...this.#grants.values()].find((grant) => sameFolder(grant.root, real));
    if (existing) return existing;
    if (this.#grants.size >= this.#limits.grants) {
      throw new Error(`You can share at most ${this.#limits.grants} folders. Stop sharing one first.`);
    }
    const label = (options.label?.trim() || basename(real)).slice(0, MACHINE_FILES_LIMITS.label);
    const grant: MachineFolderGrant = {
      id: randomUUID(),
      label,
      root: real,
      botIds: [...new Set(options.botIds ?? [])],
      grantedAt: this.#now().toISOString(),
    };
    this.#grants.set(grant.id, grant);
    return grant;
  }

  revoke(grantId: string): boolean {
    return this.#grants.delete(grantId);
  }

  async list(input: ListMachineFolderInput): Promise<MachineListing> {
    const target = await this.#resolve(input.grantId, input.relativePath ?? "", input.actor);
    if ("refused" in target) return { status: "refused", reason: target.refused };
    const info = await stat(target.real);
    if (!info.isDirectory()) return { status: "refused", reason: "not-a-folder" };
    const names = await readdir(target.real);
    const entries: MachineFileEntry[] = [];
    for (const name of names) {
      if (isBlockedMachineName(name)) continue;
      const entry = await this.#entry(target.grantRoot, target.real, name);
      if (entry) entries.push(entry);
    }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
    const truncated = entries.length > this.#limits.entriesPerListing;
    return { status: "ok", entries: entries.slice(0, this.#limits.entriesPerListing), truncated };
  }

  /** The real path of one file inside a granted folder, after every check; the caller copies it into the library. */
  async resolveFile(input: ResolveMachineFileInput): Promise<MachineFileResolution> {
    const target = await this.#resolve(input.grantId, input.relativePath, input.actor);
    if ("refused" in target) return { status: "refused", reason: target.refused };
    const name = basename(target.real);
    if (isBlockedMachineName(name)) return { status: "refused", reason: "blocked-name" };
    const info = await stat(target.real);
    if (!info.isFile()) return { status: "refused", reason: "not-a-file" };
    if (info.size > this.#limits.fileBytes) return { status: "refused", reason: "too-large" };
    return { status: "ok", path: target.real, name, size: info.size, root: target.grantRoot };
  }

  /**
   * The real path of a file or folder inside a granted folder, to open or show it in the system (no size limit: nothing
   * is read or copied). The same checks as `resolveFile` otherwise.
   */
  async locate(
    input: ResolveMachineFileInput,
  ): Promise<
    { status: "ok"; path: string; kind: "file" | "folder" } | { status: "refused"; reason: MachineFileRefusal }
  > {
    const target = await this.#resolve(input.grantId, input.relativePath, input.actor);
    if ("refused" in target) return { status: "refused", reason: target.refused };
    if (isBlockedMachineName(basename(target.real))) return { status: "refused", reason: "blocked-name" };
    const info = await stat(target.real);
    if (info.isDirectory()) return { status: "ok", path: target.real, kind: "folder" };
    if (info.isFile()) return { status: "ok", path: target.real, kind: "file" };
    return { status: "refused", reason: "not-found" };
  }

  async #resolve(
    grantId: string,
    relativePath: string,
    actor: string | null,
  ): Promise<{ real: string; grantRoot: string } | Refusal> {
    const grant = this.#grants.get(grantId);
    if (!grant) return { refused: "not-granted" };
    if (actor !== null && !grant.botIds.includes(actor)) return { refused: "bot-not-allowed" };
    const segments = splitRelative(relativePath);
    if (!segments) return { refused: "outside-folder" };
    if (segments.some(isBlockedMachineName)) return { refused: "blocked-name" };
    const real = await realpath(join(grant.root, ...segments)).catch(() => null);
    if (!real) return { refused: "not-found" };
    if (real !== grant.root && !isInside(real, grant.root)) return { refused: "outside-folder" };
    return { real, grantRoot: grant.root };
  }

  async #entry(grantRoot: string, folder: string, name: string): Promise<MachineFileEntry | null> {
    // A link is shown only when it points inside the granted folder.
    const real = await realpath(join(folder, name)).catch(() => null);
    if (!real || !isInside(real, grantRoot)) return null;
    const info = await stat(real).catch(() => null);
    if (!info || (!info.isFile() && !info.isDirectory())) return null;
    const relativePath = relative(grantRoot, join(folder, name)).split(sep).join("/");
    return {
      name,
      relativePath,
      kind: info.isDirectory() ? "folder" : "file",
      size: info.isDirectory() ? 0 : info.size,
      modifiedAt: info.mtime.toISOString(),
    };
  }

  async #isHome(real: string): Promise<boolean> {
    const home = await realpath(this.#homeDir).catch(() => null);
    return home !== null && sameFolder(home, real);
  }

  /** Looks at the path below the temporary folder (a temporary folder lives in AppData on Windows). */
  async #hasBlockedFolder(real: string): Promise<boolean> {
    const temp = await realpath(tmpdir()).catch(() => null);
    const below = temp && isInside(real, temp) ? relative(temp, real) : real;
    return below.split(/[\\/]+/).some((segment) => BLOCKED_FOLDERS.has(segment.toLowerCase()));
  }
}

/** The path as folder names, or null when it is not a plain path inside the folder. */
function splitRelative(relativePath: string): string[] | null {
  if (!isString(relativePath) || relativePath.length > MACHINE_FILES_LIMITS.relativePath) return null;
  if (relativePath.includes("\0")) return null;
  if (isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath) || relativePath.startsWith("\\\\")) return null;
  const segments = relativePath.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".");
  if (segments.length > MACHINE_FILES_LIMITS.depth || segments.some((segment) => segment === "..")) return null;
  return segments;
}

function isInside(path: string, root: string): boolean {
  const between = relative(resolve(root), resolve(path));
  return between !== "" && between !== ".." && !between.startsWith(`..${sep}`) && !isAbsolute(between);
}

function sameFolder(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase();
}
