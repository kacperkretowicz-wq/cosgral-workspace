// COSGRAL W8-KK1: the client spaces of this computer (spec-w8.md 1D; contract: ipc-spaces.ts).
//
// ISOLATION BY SEPARATE FOLDERS. Every client space has its own data folder (the program's userData: its own database
// file, Vault, browser profile, MCP list, memory, accounts) and its own home for the agents' folder
// ("COSGRAL Workspace\Bots", Shared, Downloads). The program runs on ONE space at a time; choosing another one is saved
// here and the program restarts on it. So nothing of another space is open while one runs, and there is no filter over
// shared rows that a forgotten WHERE could get wrong. The main space is the data the program already has; it is never
// moved, copied or changed by this class.
//
//   <AppData>\<userData name> Spaces\spaces.json        the list (this file)
//   <AppData>\<userData name> Spaces\<id>\data          the space's userData
//   <AppData>\<userData name> Spaces\<id>\home          the space's home: <id>\home\COSGRAL Workspace\Bots ...
//
// The folder is a sibling of the main data folder, not inside it: "Delete my data" of the main space does not touch the
// clients' data, and a client space never lies inside the folder another delete removes. Deleting a space removes only
// `<Spaces>\<id>`, after the checks below (a valid id, a real folder inside the spaces folder, no link), never main.

import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  isSpaceId,
  MAIN_SPACE_ID,
  MAIN_SPACE_NAME,
  normalizeSpaceName,
  SPACE_ISOLATED_PARTS,
  SPACE_LIMITS,
  type SpaceDescription,
  type SpaceList,
  type SpaceSummary,
  spaceNameProblem,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";

const REGISTRY_FILE = "spaces.json";
const COUNT_LIMIT = 20_000;

interface StoredSpace {
  id: string;
  name: string;
  createdAt: string;
  archivedAt: string | null;
}

interface StoredRegistry {
  version: 1;
  selectedId: string;
  spaces: StoredSpace[];
}

/** The folders a running space uses. For the main space these are the program's own, unchanged. */
export interface SpacePaths {
  id: string;
  userData: string;
  home: string;
}

export interface SpaceStoreOptions {
  /** The program's own data folder (Electron userData before any space is chosen). */
  baseUserData: string;
  /** The person's home folder (where the main space's agents' folder lives). */
  baseHome: string;
  now?: () => Date;
  makeId?: () => string;
}

/** `<name> Spaces`, a sibling of the main data folder (still a "COSGRAL Workspace…" name directly in AppData). */
export function spacesRootFor(baseUserData: string): string {
  const base = resolve(baseUserData);
  return join(dirname(base), `${basename(base)} Spaces`);
}

export class SpaceStore {
  readonly #options: SpaceStoreOptions;
  readonly #root: string;
  readonly #now: () => Date;
  readonly #makeId: () => string;
  readonly #runningId: string;
  #registry: StoredRegistry;
  #problem: string | null;

  /** Reads the registry (synchronously: the program needs it before Electron is ready). Never throws on a damaged file. */
  constructor(options: SpaceStoreOptions) {
    this.#options = options;
    this.#root = spacesRootFor(options.baseUserData);
    this.#now = options.now ?? (() => new Date());
    this.#makeId = options.makeId ?? (() => randomBytes(6).toString("hex"));
    const loaded = this.#load();
    this.#registry = loaded.registry;
    this.#problem = loaded.problem;
    const selected = this.#registry.spaces.find((space) => space.id === this.#registry.selectedId);
    if (
      this.#registry.selectedId !== MAIN_SPACE_ID &&
      (!selected || selected.archivedAt || !this.#folderExists(selected.id))
    ) {
      // The chosen space is gone (folder removed by hand, archived by another copy): run on main and say so.
      this.#problem =
        this.#problem ?? "The space chosen last time is not available, so the program runs on the main space.";
      this.#registry = { ...this.#registry, selectedId: MAIN_SPACE_ID };
    }
    this.#runningId = this.#registry.selectedId;
  }

  get root(): string {
    return this.#root;
  }

  /** The folders to run on now. Creates the space's folders if they are missing (first start of a new space). */
  runningPaths(): SpacePaths {
    if (this.#runningId === MAIN_SPACE_ID) {
      return {
        id: MAIN_SPACE_ID,
        userData: resolve(this.#options.baseUserData),
        home: resolve(this.#options.baseHome),
      };
    }
    const paths = this.#pathsOf(this.#runningId);
    mkdirSync(paths.userData, { recursive: true, mode: 0o700 });
    mkdirSync(paths.home, { recursive: true, mode: 0o700 });
    return paths;
  }

  list(): SpaceList {
    const clients = this.#registry.spaces
      .filter((space) => space.id !== MAIN_SPACE_ID)
      .sort((a, b) => a.name.localeCompare(b.name));
    const toSummary = (space: StoredSpace): SpaceSummary => ({
      id: space.id,
      name: space.name,
      main: space.id === MAIN_SPACE_ID,
      createdAt: space.createdAt,
      archivedAt: space.archivedAt,
      running: space.id === this.#runningId,
      selected: space.id === this.#registry.selectedId,
    });
    return {
      runningId: this.#runningId,
      selectedId: this.#registry.selectedId,
      problem: this.#problem,
      spaces: [this.#main(), ...clients].map(toSummary),
    };
  }

  create(name: string): SpaceList {
    const clients = this.#registry.spaces.filter((space) => space.id !== MAIN_SPACE_ID);
    if (clients.length >= SPACE_LIMITS.maxSpaces) throw new Error("There are too many spaces: remove one first.");
    const problem = spaceNameProblem(name, this.#names());
    if (problem) throw new Error(problem);
    let id = this.#makeId();
    while (
      !isSpaceId(id) ||
      id === MAIN_SPACE_ID ||
      this.#registry.spaces.some((space) => space.id === id) ||
      existsSync(join(this.#root, id))
    ) {
      id = this.#makeId();
    }
    const paths = this.#pathsOf(id);
    mkdirSync(paths.userData, { recursive: true, mode: 0o700 });
    mkdirSync(paths.home, { recursive: true, mode: 0o700 });
    this.#save({
      ...this.#registry,
      spaces: [
        ...this.#registry.spaces,
        { id, name: normalizeSpaceName(name), createdAt: this.#now().toISOString(), archivedAt: null },
      ],
    });
    return this.list();
  }

  rename(id: string, name: string): SpaceList {
    const space = this.#find(id);
    if (space.id === MAIN_SPACE_ID) throw new Error("The main space cannot be renamed.");
    const problem = spaceNameProblem(name, this.#names(id));
    if (problem) throw new Error(problem);
    this.#update(id, { name: normalizeSpaceName(name) });
    return this.list();
  }

  archive(id: string): SpaceList {
    const space = this.#find(id);
    if (space.id === MAIN_SPACE_ID) throw new Error("The main space cannot be archived.");
    this.#assertNotInUse(space.id, "archived");
    if (!space.archivedAt) this.#update(id, { archivedAt: this.#now().toISOString() });
    return this.list();
  }

  restore(id: string): SpaceList {
    this.#find(id);
    this.#update(id, { archivedAt: null });
    return this.list();
  }

  /** Removes the space's own folder and its entry, for good. The caller has the person's confirmation. */
  delete(id: string): SpaceList {
    const space = this.#find(id);
    if (space.id === MAIN_SPACE_ID) throw new Error("The main space cannot be deleted.");
    this.#assertNotInUse(space.id, "deleted");
    const folder = this.#folderOf(space.id);
    if (existsSync(folder)) {
      // Only a real folder directly inside the spaces folder, never a link (a link would send the removal elsewhere).
      const info = lstatSync(folder);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new Error("This space's folder is not a plain folder: it was not removed.");
      rmSync(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
    this.#save({ ...this.#registry, spaces: this.#registry.spaces.filter((candidate) => candidate.id !== id) });
    return this.list();
  }

  /** Chooses the space for the next start. Switching to the running space just keeps it. The caller restarts the program. */
  select(id: string): SpaceList {
    const space = this.#find(id);
    if (space.archivedAt) throw new Error("An archived space cannot be used: restore it first.");
    if (space.id !== MAIN_SPACE_ID && !this.#folderExists(space.id)) {
      throw new Error("This space's folder is missing, so it cannot be opened.");
    }
    this.#save({ ...this.#registry, selectedId: space.id });
    return this.list();
  }

  describe(id: string): SpaceDescription {
    const space = this.#find(id);
    const main = space.id === MAIN_SPACE_ID;
    const folder = main ? null : this.#folderOf(space.id);
    return {
      id: space.id,
      name: space.name,
      main,
      archived: space.archivedAt !== null,
      running: space.id === this.#runningId,
      separateFolder: true,
      isolated: [...SPACE_ISOLATED_PARTS],
      hasData: main ? true : existsSync(join(this.#pathsOf(space.id).userData, "openbot.db")),
      sizeBytes: folder && existsSync(folder) ? folderSize(folder) : main ? null : 0,
    };
  }

  // --- internals ---

  #main(): StoredSpace {
    const stored = this.#registry.spaces.find((space) => space.id === MAIN_SPACE_ID);
    return (
      stored ?? { id: MAIN_SPACE_ID, name: MAIN_SPACE_NAME, createdAt: new Date(0).toISOString(), archivedAt: null }
    );
  }

  #names(exceptId?: string): string[] {
    return this.#registry.spaces
      .filter((space) => space.id !== exceptId && space.id !== MAIN_SPACE_ID)
      .map((space) => space.name);
  }

  #find(id: string): StoredSpace {
    if (id === MAIN_SPACE_ID) return this.#main();
    const space = this.#registry.spaces.find((candidate) => candidate.id === id);
    if (!space) throw new Error("This space does not exist.");
    return space;
  }

  #assertNotInUse(id: string, what: string): void {
    if (id === this.#runningId || id === this.#registry.selectedId) {
      throw new Error(`The space the program runs on cannot be ${what}. Switch to another space first.`);
    }
  }

  #update(id: string, patch: Partial<Pick<StoredSpace, "name" | "archivedAt">>): void {
    this.#save({
      ...this.#registry,
      spaces: this.#registry.spaces.map((space) => (space.id === id ? { ...space, ...patch } : space)),
    });
  }

  /** `<Spaces>\<id>`: the id is checked to be a safe folder name and the result to lie inside the spaces folder. */
  #folderOf(id: string): string {
    if (!isSpaceId(id) || id === MAIN_SPACE_ID) throw new Error("This is not a space id.");
    const folder = resolve(this.#root, id);
    const inside = relative(this.#root, folder);
    if (!inside || inside.startsWith("..") || isAbsolute(inside) || inside.includes(sep)) {
      throw new Error("Refusing a space folder outside the spaces folder.");
    }
    return folder;
  }

  #pathsOf(id: string): SpacePaths {
    const folder = this.#folderOf(id);
    return { id, userData: join(folder, "data"), home: join(folder, "home") };
  }

  #folderExists(id: string): boolean {
    try {
      return statSync(this.#folderOf(id)).isDirectory();
    } catch {
      return false;
    }
  }

  #load(): { registry: StoredRegistry; problem: string | null } {
    const empty: StoredRegistry = { version: 1, selectedId: MAIN_SPACE_ID, spaces: [] };
    const file = join(this.#root, REGISTRY_FILE);
    if (!existsSync(file)) return { registry: empty, problem: null };
    try {
      return { registry: parseRegistry(JSON.parse(readFileSync(file, "utf8"))), problem: null };
    } catch {
      // Never overwrite a file we could not read: keep it aside, run on the main space and say so.
      try {
        renameSync(file, `${file}.damaged-${this.#now().getTime()}`);
      } catch {
        // the file stays where it is; a later save replaces it
      }
      return {
        registry: empty,
        problem:
          "The list of spaces could not be read; the program runs on the main space. The data folders are untouched.",
      };
    }
  }

  #save(next: StoredRegistry): void {
    mkdirSync(this.#root, { recursive: true, mode: 0o700 });
    const file = join(this.#root, REGISTRY_FILE);
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, file);
    this.#registry = next;
    if (this.#problem?.startsWith("The list of spaces")) this.#problem = null;
  }
}

function parseRegistry(value: unknown): StoredRegistry {
  if (!isDynamicRecord(value) || value.version !== 1 || !isString(value.selectedId) || !Array.isArray(value.spaces)) {
    throw new Error("The list of spaces is malformed.");
  }
  const spaces: StoredSpace[] = [];
  for (const entry of value.spaces) {
    if (
      !isDynamicRecord(entry) ||
      !isSpaceId(entry.id) ||
      entry.id === MAIN_SPACE_ID ||
      !isString(entry.name) ||
      !isString(entry.createdAt)
    ) {
      throw new Error("A space in the list is malformed.");
    }
    if (!(entry.archivedAt === null || isString(entry.archivedAt)))
      throw new Error("A space in the list is malformed.");
    spaces.push({ id: entry.id, name: entry.name, createdAt: entry.createdAt, archivedAt: entry.archivedAt });
  }
  if (new Set(spaces.map((space) => space.id)).size !== spaces.length) throw new Error("A space appears twice.");
  const known = value.selectedId === MAIN_SPACE_ID || spaces.some((space) => space.id === value.selectedId);
  return { version: 1, selectedId: known ? value.selectedId : MAIN_SPACE_ID, spaces };
}

/** Bytes of a folder, without following links; null when it has too many entries to count quickly. */
function folderSize(folder: string): number | null {
  let total = 0;
  let seen = 0;
  const pending = [folder];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      seen += 1;
      if (seen > COUNT_LIMIT) return null;
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(path);
      else total += lstatSync(path).size;
    }
  }
  return total;
}
