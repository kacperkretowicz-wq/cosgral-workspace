// COSGRAL: the built-in skills (superpowers, i-have-adhd, graphify). The app ships the files; this class keeps them in
// the skill library, tells which agents have them, gives them to agents on request and to new agents by default.
// It only copies files through the library; nothing in a skill runs.

import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type {
  ApplyBuiltinSkillInput,
  BuiltinSkillEntry,
  BuiltinSkillPack,
  BuiltinSkillPackId,
  SetBuiltinSkillDefaultInput,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { BUILTIN_PACKS, type BuiltinPackSpec } from "./builtin-skills-catalog";
import type { OpenBotDatabase } from "./openbot-database";
import type { SkillLibrary } from "./skill-library";

export interface BuiltinSkillsDeps {
  database: OpenBotDatabase;
  library: SkillLibrary;
  /** Folder with one subfolder per pack (the app's `resources/builtin-skills`). */
  root: string;
  /** Agents that exist now. */
  botIds: () => string[];
  /** Whether a program is on this computer's search path. */
  hasProgram?: (command: string) => Promise<boolean>;
  packs?: readonly BuiltinPackSpec[];
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_builtin_skills (
    skill_id TEXT PRIMARY KEY,
    pack_id TEXT NOT NULL,
    bundle_version INTEGER NOT NULL,
    library_version INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_builtin_packs (
    pack_id TEXT PRIMARY KEY,
    default_for_new_agents INTEGER NOT NULL
  );
`;

interface Link {
  skillId: string;
  packId: string;
  bundleVersion: number;
  libraryVersion: number;
}

export class BuiltinSkills {
  readonly #deps: BuiltinSkillsDeps;
  readonly #packs: readonly BuiltinPackSpec[];
  readonly #ready = new WeakSet<DatabaseSync>();
  /** Skill names found in each pack's folder, set by the sync. */
  readonly #names = new Map<string, string[]>();
  readonly #problems = new Map<string, string>();
  #synced: Promise<void> | null = null;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(deps: BuiltinSkillsDeps) {
    this.#deps = deps;
    this.#packs = deps.packs ?? BUILTIN_PACKS;
  }

  /** Puts the shipped skills into the library once per run (and again on `resync`). Never throws. */
  ready(): Promise<void> {
    this.#synced ??= this.#sync().catch((error: unknown) => {
      console.warn("[builtin-skills] Could not add the built-in skills.", error);
    });
    return this.#synced;
  }

  resync(): Promise<void> {
    this.#synced = null;
    return this.ready();
  }

  /** True for a library skill that comes from the app; the library refuses to delete it. */
  isBuiltin(skillId: string): boolean {
    return this.#link(skillId) !== null;
  }

  async list(): Promise<BuiltinSkillPack[]> {
    await this.ready();
    const installs = new Map<string, Set<string>>();
    for (const install of await this.#deps.library.listInstalls()) {
      const set = installs.get(install.botId) ?? new Set<string>();
      set.add(install.skillId);
      installs.set(install.botId, set);
    }
    const botIds = this.#deps.botIds();
    const packs: BuiltinSkillPack[] = [];
    for (const spec of this.#packs) {
      const skills = this.#entries(spec);
      const ids = skills.flatMap((skill) => (skill.state === "ready" && skill.skillId ? [skill.skillId] : []));
      const have = (botId: string) => ids.filter((id) => installs.get(botId)?.has(id)).length;
      packs.push({
        id: spec.id,
        title: spec.title,
        summary: spec.summary,
        whenToUse: spec.whenToUse,
        license: spec.license,
        sourceUrl: spec.sourceUrl,
        sourceVersion: spec.sourceVersion,
        skills,
        defaultForNewAgents: this.#defaultFor(spec),
        installedBotIds: ids.length ? botIds.filter((botId) => have(botId) === ids.length) : [],
        partialBotIds: ids.length ? botIds.filter((botId) => have(botId) > 0 && have(botId) < ids.length) : [],
        program: spec.program
          ? { ...spec.program, found: await (this.#deps.hasProgram ?? programOnPath)(spec.program.command) }
          : null,
      });
    }
    return packs;
  }

  /** Gives the agents the whole pack, or takes it away. Every agent is tried; the first failure is thrown at the end. */
  async apply(input: ApplyBuiltinSkillInput): Promise<BuiltinSkillPack[]> {
    await this.ready();
    const spec = this.#spec(input.packId);
    const known = new Set(this.#deps.botIds());
    const missing = input.botIds.find((botId) => !known.has(botId));
    if (missing !== undefined) throw new Error("This agent does not exist.");
    const skills = this.#entries(spec).filter((skill) => skill.state === "ready" && skill.skillId);
    if (input.enabled && skills.length === 0) throw new Error(`The skills of ${spec.title} are not in the library.`);
    const failures: string[] = [];
    for (const botId of new Set(input.botIds)) {
      for (const skill of skills) {
        try {
          if (skill.skillId) await this.#set(botId, skill.skillId, input.enabled);
        } catch (error) {
          failures.push(`${skill.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (failures.length) throw new Error(failures.slice(0, 3).join(" "));
    return this.list();
  }

  async setDefault(input: SetBuiltinSkillDefaultInput): Promise<BuiltinSkillPack[]> {
    this.#spec(input.packId);
    this.#db()
      .prepare(
        `INSERT INTO projection_builtin_packs (pack_id, default_for_new_agents) VALUES (?, ?)
         ON CONFLICT(pack_id) DO UPDATE SET default_for_new_agents = excluded.default_for_new_agents`,
      )
      .run(input.packId, input.enabled ? 1 : 0);
    return this.list();
  }

  /** What a new agent gets. A problem with one pack never stops the others, or the agent from being created. */
  async applyDefaults(botId: string): Promise<void> {
    await this.ready();
    for (const spec of this.#packs) {
      if (!this.#defaultFor(spec)) continue;
      for (const skill of this.#entries(spec)) {
        if (skill.state !== "ready" || !skill.skillId) continue;
        try {
          await this.#set(botId, skill.skillId, true);
        } catch (error) {
          console.warn(`[builtin-skills] ${skill.name} was not given to a new agent.`, error);
        }
      }
    }
  }

  async #set(botId: string, skillId: string, enabled: boolean): Promise<void> {
    const library = this.#deps.library;
    const installed = (await library.listInstalls({ botId })).find((item) => item.skillId === skillId);
    if (!enabled) {
      if (installed) await library.uninstall({ skillId, botId });
      return;
    }
    if (!installed) await library.install({ skillId, botId });
    else if (installed.updateAvailable && !installed.modifiedLocally) await library.update({ skillId, botId });
  }

  #sync(): Promise<void> {
    const run = this.#queue.then(async () => {
      for (const spec of this.#packs) {
        const folder = join(this.#deps.root, spec.folder, "skills");
        let names: string[];
        try {
          names = (await readdir(folder, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
        } catch {
          this.#names.set(spec.id, []);
          this.#problems.set(spec.id, "The skill files are missing from this build of the app.");
          continue;
        }
        this.#names.set(spec.id, names);
        for (const name of names) {
          try {
            await this.#place(spec, name, join(folder, name));
          } catch (error) {
            this.#problems.set(name, error instanceof Error ? error.message : String(error));
            console.warn(`[builtin-skills] ${name} was not added.`, error);
          }
        }
      }
    });
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #place(spec: BuiltinPackSpec, name: string, path: string): Promise<void> {
    const library = this.#deps.library;
    const source = { kind: "folder" as const, path };
    const existing = library.findByName(name);
    if (!existing) {
      const created = await library.create({
        source,
        authorBotId: null,
        note: `Built-in skill from ${spec.title} ${spec.sourceVersion}.`,
      });
      this.#saveLink({
        skillId: created.id,
        packId: spec.id,
        bundleVersion: spec.bundleVersion,
        libraryVersion: created.version,
      });
      return;
    }
    const link = this.#link(existing.id);
    if (!link) return; // A skill of the person's own with this name: left alone, shown as "name taken".
    if (link.bundleVersion >= spec.bundleVersion || link.libraryVersion !== existing.version) return;
    const revised = await library.revise({
      skillId: existing.id,
      baseVersion: existing.version,
      source,
      authorBotId: null,
      note: `Built-in skill from ${spec.title} ${spec.sourceVersion}.`,
    });
    this.#saveLink({
      skillId: existing.id,
      packId: spec.id,
      bundleVersion: spec.bundleVersion,
      libraryVersion: revised.version,
    });
  }

  #entries(spec: BuiltinPackSpec): BuiltinSkillEntry[] {
    return (this.#names.get(spec.id) ?? []).map((name) => {
      const skill = this.#deps.library.findByName(name);
      if (!skill) return { name, description: this.#problems.get(name) ?? "", skillId: null, state: "missing" };
      const state = this.#link(skill.id)?.packId === spec.id ? "ready" : "name-taken";
      return { name, description: skill.description, skillId: skill.id, state };
    });
  }

  #spec(packId: BuiltinSkillPackId): BuiltinPackSpec {
    const spec = this.#packs.find((candidate) => candidate.id === packId);
    if (!spec) throw new Error("Unknown built-in skill pack.");
    return spec;
  }

  #defaultFor(spec: BuiltinPackSpec): boolean {
    const row = this.#db()
      .prepare("SELECT default_for_new_agents FROM projection_builtin_packs WHERE pack_id = ?")
      .get(spec.id);
    return isDynamicRecord(row) && isNumber(row.default_for_new_agents)
      ? row.default_for_new_agents === 1
      : spec.defaultForNewAgents;
  }

  #link(skillId: string): Link | null {
    const row = this.#db().prepare("SELECT * FROM projection_builtin_skills WHERE skill_id = ?").get(skillId);
    if (
      !isDynamicRecord(row) ||
      !isString(row.pack_id) ||
      !isNumber(row.bundle_version) ||
      !isNumber(row.library_version)
    )
      return null;
    return { skillId, packId: row.pack_id, bundleVersion: row.bundle_version, libraryVersion: row.library_version };
  }

  #saveLink(link: Link): void {
    this.#db()
      .prepare(
        `INSERT INTO projection_builtin_skills (skill_id, pack_id, bundle_version, library_version) VALUES (?, ?, ?, ?)
         ON CONFLICT(skill_id) DO UPDATE SET pack_id = excluded.pack_id, bundle_version = excluded.bundle_version,
           library_version = excluded.library_version`,
      )
      .run(link.skillId, link.packId, link.bundleVersion, link.libraryVersion);
  }

  #db(): DatabaseSync {
    const db = this.#deps.database.connection;
    if (!this.#ready.has(db)) {
      db.exec(SCHEMA);
      this.#ready.add(db);
    }
    return db;
  }
}

/** Whether `command` is in a search-path folder or one of the usual places `uv` and `pipx` put programs. */
export async function programOnPath(command: string, extraFolders: readonly string[] = []): Promise<boolean> {
  const windows = process.platform === "win32";
  const suffixes = windows ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  const folders = [
    ...(process.env.PATH ?? "").split(delimiter),
    join(homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...extraFolders,
  ].filter((folder) => folder.length > 0 && isAbsolute(folder));
  for (const folder of new Set(folders)) {
    for (const suffix of suffixes) {
      try {
        await access(join(folder, `${command}${suffix.toLowerCase()}`), constants.X_OK);
        return true;
      } catch {
        // Not here.
      }
    }
  }
  return false;
}
