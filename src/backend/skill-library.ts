// COSGRAL W2: the local skill library (spec W2 §1, parity row 24).
//
// Every version of a skill is an immutable folder `<root>/<name>/v<N>` with SKILL.md and its files; the index
// lives in SQLite. Each agent gets its own copy in `<agent workspace>/.cosgral/skills/<name>`. A copy whose files
// differ from the installed version is "modified locally" and Update never overwrites it silently. The library
// only copies files; it never runs a skill's scripts.

import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import {
  type DeleteSkillInput,
  type InstallSkillInput,
  isSkillName,
  type ListSkillInstallsInput,
  type LocalSkill,
  type ReadSkillInput,
  type RestoreSkillVersionInput,
  SKILL_LIMITS,
  type SkillContent,
  type SkillFile,
  type SkillInstall,
  type SkillVersion,
  type UninstallSkillInput,
  type UpdateSkillInstallInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

/** Where a new skill or revision comes from: a prepared folder, or SKILL.md text with optional extra files. */
export type SkillSource =
  | { kind: "folder"; path: string }
  | { kind: "inline"; skillMd: string; files?: Array<{ path: string; content: string }> };

/** What an agent's instructions list about one installed skill. */
export interface InstalledSkillSummary {
  skillId: string;
  name: string;
  description: string;
  version: number;
  skillMdPath: string;
}

export type SkillLimits = { -readonly [K in keyof typeof SKILL_LIMITS]: number };

export interface SkillLibraryOptions {
  database: OpenBotDatabase;
  /** Library folder, e.g. ~/COSGRAL Workspace/Skills. */
  root: string;
  /** The agent's workspace, or null when the agent no longer exists. */
  workspaceFor: (botId: string) => string | null;
  limits?: Partial<SkillLimits>;
  now?: () => Date;
}

interface SkillLibraryEvents {
  "skills-changed": [skills: LocalSkill[]];
  "installs-changed": [installs: SkillInstall[]];
}

interface StoredSkill {
  id: string;
  name: string;
  description: string;
  examplePrompt: string | null;
  version: number;
  createdByBotId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredVersion extends SkillVersion {
  description: string;
  examplePrompt: string | null;
}

interface StoredInstall {
  botId: string;
  skillId: string;
  installedVersion: number;
  contentHash: string;
  installedAt: string;
}

interface PackageFile {
  path: string;
  bytes: Buffer;
}

interface SkillPackage {
  name: string;
  description: string;
  examplePrompt: string | null;
  files: PackageFile[];
  contentHash: string;
  totalBytes: number;
}

const INSTALL_FOLDER = [".cosgral", "skills"] as const;

export class SkillLibrary extends EventEmitter<SkillLibraryEvents> {
  readonly #database: OpenBotDatabase;
  readonly #root: string;
  readonly #workspaceFor: (botId: string) => string | null;
  readonly #limits: SkillLimits;
  readonly #now: () => Date;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: SkillLibraryOptions) {
    super();
    this.#database = options.database;
    this.#root = options.root;
    this.#workspaceFor = options.workspaceFor;
    this.#limits = { ...SKILL_LIMITS, ...options.limits };
    this.#now = options.now ?? (() => new Date());
  }

  /** Library skills by name. */
  list(): LocalSkill[] {
    return this.#rows("SELECT data_json FROM projection_skills ORDER BY name").map((row) =>
      this.#public(storedSkill(row)),
    );
  }

  get(skillId: string): LocalSkill {
    return this.#public(this.#stored(skillId));
  }

  findByName(name: string): LocalSkill | null {
    const row = this.#database.connection.prepare("SELECT data_json FROM projection_skills WHERE name = ?").get(name);
    return isDynamicRecord(row) ? this.#public(storedSkill(row)) : null;
  }

  /** Every version, oldest first. */
  listVersions(skillId: string): SkillVersion[] {
    this.#stored(skillId);
    return this.#rows(
      "SELECT data_json FROM projection_skill_versions WHERE skill_id = ? ORDER BY version",
      skillId,
    ).map((row) => publicVersion(storedVersion(row)));
  }

  async read(input: ReadSkillInput): Promise<SkillContent> {
    const skill = this.#stored(input.skillId);
    const version = input.version ?? skill.version;
    this.#version(skill.id, version);
    const files = await this.#readFolder(this.#versionPath(skill.name, version), false);
    const skillMd = files.find((file) => file.path === "SKILL.md");
    if (!skillMd) throw new Error("This skill version has no SKILL.md.");
    return {
      skill: this.#public(skill),
      version,
      skillMd: skillMd.bytes.toString("utf8"),
      files: files.map((file): SkillFile => ({ path: file.path, bytes: file.bytes.length })),
    };
  }

  create(input: { source: SkillSource; authorBotId: string | null; note?: string }): Promise<LocalSkill> {
    return this.#serial(async () => {
      const pack = await this.#package(input.source);
      if (this.findByName(pack.name)) throw new Error(`A skill named ${pack.name} already exists. Revise it instead.`);
      if (this.list().length >= this.#limits.skills) {
        throw new Error(`The library holds at most ${this.#limits.skills} skills.`);
      }
      const at = this.#iso();
      const skill: StoredSkill = {
        id: randomUUID(),
        name: pack.name,
        description: pack.description,
        examplePrompt: pack.examplePrompt,
        version: 1,
        createdByBotId: input.authorBotId,
        createdAt: at,
        updatedAt: at,
      };
      await this.#writeFolder(this.#versionPath(skill.name, 1), pack.files);
      this.#transaction(() => {
        this.#database.connection
          .prepare("INSERT INTO projection_skills (skill_id, name, data_json) VALUES (?, ?, ?)")
          .run(skill.id, skill.name, JSON.stringify(skill));
        this.#insertVersion(skill.id, 1, pack, input.authorBotId, note(input.note), null);
      });
      this.#emitSkills();
      return this.#public(skill);
    });
  }

  /** A new version; `baseVersion` must be the latest, so an agent never overwrites a change it did not read. */
  revise(input: {
    skillId: string;
    baseVersion: number;
    source: SkillSource;
    authorBotId: string | null;
    note?: string;
  }): Promise<LocalSkill> {
    return this.#serial(async () => {
      const skill = this.#stored(input.skillId);
      if (input.baseVersion !== skill.version) {
        throw new Error(
          `This skill changed since version ${input.baseVersion}. Read the latest version (${skill.version}) and revise that.`,
        );
      }
      const pack = await this.#package(input.source);
      if (pack.name !== skill.name) {
        throw new Error(`A revision keeps the skill name: SKILL.md must say name: ${skill.name}.`);
      }
      return this.#addVersion(skill, pack, input.authorBotId, note(input.note), null);
    });
  }

  /** Rollback: a new version with the content of an older one. Installed copies do not change. */
  restoreVersion(input: RestoreSkillVersionInput, authorBotId: string | null = null): Promise<LocalSkill> {
    return this.#serial(async () => {
      const skill = this.#stored(input.skillId);
      const old = this.#version(skill.id, input.version);
      const files = await this.#readFolder(this.#versionPath(skill.name, old.version), false);
      const pack: SkillPackage = {
        name: skill.name,
        description: old.description,
        examplePrompt: old.examplePrompt,
        files,
        contentHash: contentHash(files),
        totalBytes: files.reduce((sum, file) => sum + file.bytes.length, 0),
      };
      return this.#addVersion(skill, pack, authorBotId, `Restored from version ${old.version}`, old.version);
    });
  }

  /** Removes the skill, its versions and every installed copy; changed copies need `force`. */
  delete(input: DeleteSkillInput): Promise<void> {
    return this.#serial(async () => {
      const skill = this.#stored(input.skillId);
      const installs = this.#installRows().filter((install) => install.skillId === skill.id);
      if (!input.force) {
        const changed: string[] = [];
        for (const install of installs)
          if ((await this.#state(install, skill)).modifiedLocally) changed.push(install.botId);
        if (changed.length) {
          throw new Error(
            `The copy of ${skill.name} was changed by: ${changed.join(", ")}. Confirm to delete it with those changes.`,
          );
        }
      }
      for (const install of installs) await this.#removeCopy(install.botId, skill.name);
      this.#transaction(() => {
        const db = this.#database.connection;
        db.prepare("DELETE FROM projection_skill_installs WHERE skill_id = ?").run(skill.id);
        db.prepare("DELETE FROM projection_skill_versions WHERE skill_id = ?").run(skill.id);
        db.prepare("DELETE FROM projection_skills WHERE skill_id = ?").run(skill.id);
      });
      await rm(join(this.#root, skill.name), { recursive: true, force: true });
      this.#emitSkills();
      await this.#emitInstalls();
    });
  }

  async listInstalls(input: ListSkillInstallsInput = {}): Promise<SkillInstall[]> {
    const states: SkillInstall[] = [];
    for (const install of this.#installRows()) {
      if (input.botId !== undefined && install.botId !== input.botId) continue;
      if (!this.#workspaceFor(install.botId)) continue;
      states.push(await this.#state(install, this.#stored(install.skillId)));
    }
    return states;
  }

  /** What an agent's instructions list: its installed skills by name (no file reads). */
  installedFor(botId: string): InstalledSkillSummary[] {
    const workspace = this.#workspaceFor(botId);
    if (!workspace) return [];
    return this.#installRows()
      .filter((install) => install.botId === botId)
      .map((install) => {
        const skill = this.#stored(install.skillId);
        return {
          skillId: skill.id,
          name: skill.name,
          description: this.#version(skill.id, install.installedVersion).description,
          version: install.installedVersion,
          skillMdPath: join(this.#copyPath(workspace, skill.name), "SKILL.md"),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  /** Gives one agent its own copy. Installing the same version again changes nothing. */
  install(input: InstallSkillInput): Promise<SkillInstall> {
    return this.#serial(async () => {
      const skill = this.#stored(input.skillId);
      const version = this.#version(skill.id, input.version ?? skill.version);
      const existing = this.#installRow(input.botId, skill.id);
      if (existing) {
        if (existing.installedVersion === version.version) return this.#state(existing, skill);
        throw new Error(
          `${skill.name} is already installed for this agent (version ${existing.installedVersion}). Use Update.`,
        );
      }
      const install = await this.#copy(input.botId, skill, version);
      await this.#emitInstalls();
      return this.#state(install, skill);
    });
  }

  /**
   * Moves an agent's copy to the latest version, or to an exact `version` (an explicit install of one revision).
   * A changed copy needs `overwriteLocalChanges`.
   */
  update(input: UpdateSkillInstallInput & { version?: number }): Promise<SkillInstall> {
    return this.#serial(async () => {
      const skill = this.#stored(input.skillId);
      const target = this.#version(skill.id, input.version ?? skill.version);
      const existing = this.#installRow(input.botId, skill.id);
      if (!existing) throw new Error(`${skill.name} is not installed for this agent.`);
      const state = await this.#state(existing, skill);
      if (!state.modifiedLocally && existing.installedVersion === target.version) return state;
      if (state.modifiedLocally && !input.overwriteLocalChanges) {
        throw new Error(
          `This agent's copy of ${skill.name} was changed. Confirm overwriting the local changes to update it.`,
        );
      }
      const install = await this.#copy(input.botId, skill, target);
      await this.#emitInstalls();
      return this.#state(install, skill);
    });
  }

  uninstall(input: UninstallSkillInput): Promise<void> {
    return this.#serial(async () => {
      const skill = this.#stored(input.skillId);
      if (!this.#installRow(input.botId, skill.id)) throw new Error(`${skill.name} is not installed for this agent.`);
      await this.#removeCopy(input.botId, skill.name);
      this.#database.connection
        .prepare("DELETE FROM projection_skill_installs WHERE bot_id = ? AND skill_id = ?")
        .run(input.botId, skill.id);
      await this.#emitInstalls();
    });
  }

  /** Forgets installs of agents that no longer exist (their folders go with the agent). True when any were removed. */
  pruneBots(botIds: string[]): Promise<boolean> {
    return this.#serial(async () => {
      const keep = new Set(botIds);
      const stale = this.#installRows().filter((install) => !keep.has(install.botId));
      if (!stale.length) return false;
      const remove = this.#database.connection.prepare(
        "DELETE FROM projection_skill_installs WHERE bot_id = ? AND skill_id = ?",
      );
      this.#transaction(() => {
        for (const install of stale) remove.run(install.botId, install.skillId);
      });
      await this.#emitInstalls();
      return true;
    });
  }

  async #addVersion(
    skill: StoredSkill,
    pack: SkillPackage,
    authorBotId: string | null,
    versionNote: string | null,
    restoredFrom: number | null,
  ): Promise<LocalSkill> {
    const version = skill.version + 1;
    await this.#writeFolder(this.#versionPath(skill.name, version), pack.files);
    const updated: StoredSkill = {
      ...skill,
      description: pack.description,
      examplePrompt: pack.examplePrompt,
      version,
      updatedAt: this.#iso(),
    };
    this.#transaction(() => {
      this.#insertVersion(skill.id, version, pack, authorBotId, versionNote, restoredFrom);
      this.#database.connection
        .prepare("UPDATE projection_skills SET data_json = ? WHERE skill_id = ?")
        .run(JSON.stringify(updated), skill.id);
    });
    this.#emitSkills();
    await this.#emitInstalls();
    return this.#public(updated);
  }

  #insertVersion(
    skillId: string,
    version: number,
    pack: SkillPackage,
    authorBotId: string | null,
    versionNote: string | null,
    restoredFrom: number | null,
  ): void {
    const stored: StoredVersion = {
      skillId,
      version,
      createdAt: this.#iso(),
      authorBotId,
      note: versionNote,
      restoredFrom,
      contentHash: pack.contentHash,
      files: pack.files.length,
      bytes: pack.totalBytes,
      description: pack.description,
      examplePrompt: pack.examplePrompt,
    };
    this.#database.connection
      .prepare("INSERT INTO projection_skill_versions (skill_id, version, data_json) VALUES (?, ?, ?)")
      .run(skillId, version, JSON.stringify(stored));
  }

  async #copy(botId: string, skill: StoredSkill, version: StoredVersion): Promise<StoredInstall> {
    const workspace = this.#workspaceFor(botId);
    if (!workspace) throw new Error("This agent does not exist.");
    const files = await this.#readFolder(this.#versionPath(skill.name, version.version), false);
    await this.#writeFolder(this.#copyPath(workspace, skill.name), files);
    const install: StoredInstall = {
      botId,
      skillId: skill.id,
      installedVersion: version.version,
      contentHash: version.contentHash,
      installedAt: this.#iso(),
    };
    this.#database.connection
      .prepare(
        `INSERT INTO projection_skill_installs (bot_id, skill_id, data_json) VALUES (?, ?, ?)
         ON CONFLICT(bot_id, skill_id) DO UPDATE SET data_json = excluded.data_json`,
      )
      .run(botId, skill.id, JSON.stringify(install));
    return install;
  }

  async #removeCopy(botId: string, name: string): Promise<void> {
    const workspace = this.#workspaceFor(botId);
    if (workspace) await rm(this.#copyPath(workspace, name), { recursive: true, force: true });
  }

  async #state(install: StoredInstall, skill: StoredSkill): Promise<SkillInstall> {
    const workspace = this.#workspaceFor(install.botId);
    const path = workspace ? this.#copyPath(workspace, skill.name) : "";
    let modifiedLocally = true;
    if (workspace) {
      try {
        modifiedLocally = contentHash(await this.#readFolder(path, false)) !== install.contentHash;
      } catch {
        // A missing or unreadable copy cannot be the installed version.
        modifiedLocally = true;
      }
    }
    return {
      botId: install.botId,
      skillId: skill.id,
      name: skill.name,
      installedVersion: install.installedVersion,
      latestVersion: skill.version,
      updateAvailable: install.installedVersion < skill.version,
      modifiedLocally,
      path,
      installedAt: install.installedAt,
    };
  }

  /** Validates a source and reads its files into memory (at most `totalBytes`). */
  async #package(source: SkillSource): Promise<SkillPackage> {
    const files = source.kind === "folder" ? await this.#readFolder(source.path, true) : this.#inlineFiles(source);
    const skillMd = files.find((file) => file.path === "SKILL.md");
    if (!skillMd) throw new Error("The skill folder has no SKILL.md at its top level.");
    if (skillMd.bytes.length > this.#limits.skillMdBytes) {
      throw new Error(`SKILL.md has at most ${this.#limits.skillMdBytes} bytes.`);
    }
    const values = frontMatter(skillMd.bytes.toString("utf8"));
    const name = values.get("name");
    if (!name) throw new Error("SKILL.md front matter needs a name.");
    if (!isSkillName(name) || name.length > this.#limits.name) {
      throw new Error(
        `The skill name must be kebab-case (a-z, 0-9 and -), at most ${this.#limits.name} characters, and not a reserved Windows name.`,
      );
    }
    const description = values.get("description") ?? "";
    if (!description || description.length > this.#limits.description) {
      throw new Error(`The skill description has 1–${this.#limits.description} characters.`);
    }
    const examplePrompt = values.get("example-prompt") || null;
    if (examplePrompt && examplePrompt.length > this.#limits.examplePrompt) {
      throw new Error(`example-prompt has at most ${this.#limits.examplePrompt} characters.`);
    }
    return {
      name,
      description,
      examplePrompt,
      files,
      contentHash: contentHash(files),
      totalBytes: files.reduce((sum, file) => sum + file.bytes.length, 0),
    };
  }

  #inlineFiles(source: Extract<SkillSource, { kind: "inline" }>): PackageFile[] {
    const files: PackageFile[] = [{ path: "SKILL.md", bytes: Buffer.from(source.skillMd, "utf8") }];
    for (const file of source.files ?? []) {
      const path = safeRelativePath(file.path, this.#limits.filePath);
      if (files.some((existing) => existing.path.toLowerCase() === path.toLowerCase())) {
        throw new Error(`The file path ${path} is used twice.`);
      }
      files.push({ path, bytes: Buffer.from(file.content, "utf8") });
    }
    this.#checkSize(files);
    return files.sort(byPath);
  }

  /** Reads a folder tree; links and junctions are refused so a skill never reaches outside its folder. */
  async #readFolder(root: string, enforceLimits: boolean): Promise<PackageFile[]> {
    let rootStat: Awaited<ReturnType<typeof lstat>>;
    try {
      rootStat = await lstat(root);
    } catch {
      throw new Error("The skill folder does not exist.");
    }
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("The skill source must be a folder.");
    const files: PackageFile[] = [];
    let total = 0;
    const walk = async (folder: string, prefix: string): Promise<void> => {
      for (const name of (await readdir(folder)).sort()) {
        const path = join(folder, name);
        const relative = prefix ? `${prefix}/${name}` : name;
        const stats = await lstat(path);
        if (stats.isSymbolicLink())
          throw new Error(`The skill contains a link (${relative}); copy the real files instead.`);
        if (stats.isDirectory()) {
          await walk(path, relative);
          continue;
        }
        if (!stats.isFile()) throw new Error(`The skill contains an unsupported file type (${relative}).`);
        if (enforceLimits) {
          safeRelativePath(relative, this.#limits.filePath);
          if (files.length + 1 > this.#limits.files) {
            throw new Error(`A skill has at most ${this.#limits.files} files, SKILL.md included.`);
          }
          total += stats.size;
          if (total > this.#limits.totalBytes) {
            throw new Error(`A skill has at most ${this.#limits.totalBytes} bytes in all files.`);
          }
        }
        files.push({ path: relative, bytes: await readFile(path) });
      }
    };
    await walk(root, "");
    return files.sort(byPath);
  }

  #checkSize(files: PackageFile[]): void {
    if (files.length > this.#limits.files) {
      throw new Error(`A skill has at most ${this.#limits.files} files, SKILL.md included.`);
    }
    const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
    if (total > this.#limits.totalBytes) {
      throw new Error(`A skill has at most ${this.#limits.totalBytes} bytes in all files.`);
    }
  }

  /** Writes files into a fresh folder next to `target`, then swaps it in. */
  async #writeFolder(target: string, files: PackageFile[]): Promise<void> {
    const temporary = join(dirname(target), `.tmp-${randomUUID()}`);
    await mkdir(temporary, { recursive: true });
    try {
      for (const file of files) {
        const destination = join(temporary, ...file.path.split("/"));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, file.bytes);
      }
      await rm(target, { recursive: true, force: true });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  #versionPath(name: string, version: number): string {
    return join(this.#root, name, `v${version}`);
  }

  #copyPath(workspace: string, name: string): string {
    return join(workspace, ...INSTALL_FOLDER, name);
  }

  #public(skill: StoredSkill): LocalSkill {
    return { ...skill, path: this.#versionPath(skill.name, skill.version) };
  }

  #stored(skillId: string): StoredSkill {
    const row = this.#database.connection
      .prepare("SELECT data_json FROM projection_skills WHERE skill_id = ?")
      .get(skillId);
    if (!isDynamicRecord(row)) throw new Error("This skill does not exist.");
    return storedSkill(row);
  }

  #version(skillId: string, version: number): StoredVersion {
    const row = this.#database.connection
      .prepare("SELECT data_json FROM projection_skill_versions WHERE skill_id = ? AND version = ?")
      .get(skillId, version);
    if (!isDynamicRecord(row)) throw new Error(`This skill has no version ${version}.`);
    return storedVersion(row);
  }

  #installRow(botId: string, skillId: string): StoredInstall | null {
    const row = this.#database.connection
      .prepare("SELECT data_json FROM projection_skill_installs WHERE bot_id = ? AND skill_id = ?")
      .get(botId, skillId);
    return isDynamicRecord(row) ? storedInstall(row) : null;
  }

  #installRows(): StoredInstall[] {
    return this.#rows("SELECT data_json FROM projection_skill_installs ORDER BY bot_id, skill_id").map(storedInstall);
  }

  #rows(sql: string, ...params: string[]): DynamicRecord[] {
    const rows = this.#database.connection.prepare(sql).all(...params);
    return rows.filter(isDynamicRecord);
  }

  #transaction(write: () => void): void {
    const db = this.#database.connection;
    db.exec("BEGIN IMMEDIATE");
    try {
      write();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  #emitSkills(): void {
    this.emit("skills-changed", this.list());
  }

  async #emitInstalls(): Promise<void> {
    this.emit("installs-changed", await this.listInstalls());
  }

  #serial<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(operation, operation);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  #iso(): string {
    return this.#now().toISOString();
  }
}

/** The key: value lines between the first two `---` lines (folded `>` and literal `|` blocks, quotes). */
function frontMatter(text: string): Map<string, string> {
  const lines = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (lines[0]?.trim() !== "---" || end < 0) {
    throw new Error("SKILL.md must start with front matter between --- lines, with name and description.");
  }
  const values = new Map<string, string>();
  for (let index = 1; index < end; index += 1) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[index] ?? "");
    if (!match) continue;
    const key = match[1] ?? "";
    let value = (match[2] ?? "").trim();
    if (/^[>|]-?$/.test(value)) {
      const block: string[] = [];
      while (index + 1 < end && /^(\s+\S|\s*$)/.test(lines[index + 1] ?? "")) {
        index += 1;
        block.push((lines[index] ?? "").trim());
      }
      value = value.startsWith(">") ? block.filter(Boolean).join(" ") : block.join("\n").trim();
    } else if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

/** A relative path with "/" separators that stays inside the skill folder. */
function safeRelativePath(value: string, limit: number): string {
  const path = value.replaceAll("\\", "/");
  const normalized = posix.normalize(path);
  if (
    !path ||
    path.length > limit ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    normalized !== path ||
    normalized.split("/").some((part) => part === ".." || part === "." || part === "")
  ) {
    throw new Error(`The file path ${value} must be a short relative path inside the skill folder.`);
  }
  return path;
}

function contentHash(files: PackageFile[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort(byPath)) {
    hash.update(`${file.path}\0${file.bytes.length}\0`);
    hash.update(file.bytes);
  }
  return hash.digest("hex");
}

function byPath(left: { path: string }, right: { path: string }): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function note(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, SKILL_LIMITS.note) : null;
}

function parse(row: DynamicRecord): DynamicRecord {
  if (!isString(row.data_json)) throw new Error("Invalid skill row.");
  const value = JSON.parse(row.data_json);
  if (!isDynamicRecord(value)) throw new Error("Invalid skill row.");
  return value;
}

function storedSkill(row: DynamicRecord): StoredSkill {
  const value = parse(row);
  if (
    !isString(value.id) ||
    !isString(value.name) ||
    !isString(value.description) ||
    !(value.examplePrompt === null || isString(value.examplePrompt)) ||
    !isNumber(value.version) ||
    !(value.createdByBotId === null || isString(value.createdByBotId)) ||
    !isString(value.createdAt) ||
    !isString(value.updatedAt)
  ) {
    throw new Error("Invalid skill row.");
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    examplePrompt: value.examplePrompt,
    version: value.version,
    createdByBotId: value.createdByBotId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function storedVersion(row: DynamicRecord): StoredVersion {
  const value = parse(row);
  if (
    !isString(value.skillId) ||
    !isNumber(value.version) ||
    !isString(value.createdAt) ||
    !(value.authorBotId === null || isString(value.authorBotId)) ||
    !(value.note === null || isString(value.note)) ||
    !(value.restoredFrom === null || isNumber(value.restoredFrom)) ||
    !isString(value.contentHash) ||
    !isNumber(value.files) ||
    !isNumber(value.bytes) ||
    !isString(value.description) ||
    !(value.examplePrompt === null || isString(value.examplePrompt))
  ) {
    throw new Error("Invalid skill version row.");
  }
  return {
    skillId: value.skillId,
    version: value.version,
    createdAt: value.createdAt,
    authorBotId: value.authorBotId,
    note: value.note,
    restoredFrom: value.restoredFrom,
    contentHash: value.contentHash,
    files: value.files,
    bytes: value.bytes,
    description: value.description,
    examplePrompt: value.examplePrompt,
  };
}

function publicVersion(version: StoredVersion): SkillVersion {
  return {
    skillId: version.skillId,
    version: version.version,
    createdAt: version.createdAt,
    authorBotId: version.authorBotId,
    note: version.note,
    restoredFrom: version.restoredFrom,
    contentHash: version.contentHash,
    files: version.files,
    bytes: version.bytes,
  };
}

function storedInstall(row: DynamicRecord): StoredInstall {
  const value = parse(row);
  if (
    !isString(value.botId) ||
    !isString(value.skillId) ||
    !isNumber(value.installedVersion) ||
    !isString(value.contentHash) ||
    !isString(value.installedAt)
  ) {
    throw new Error("Invalid skill install row.");
  }
  return {
    botId: value.botId,
    skillId: value.skillId,
    installedVersion: value.installedVersion,
    contentHash: value.contentHash,
    installedAt: value.installedAt,
  };
}
