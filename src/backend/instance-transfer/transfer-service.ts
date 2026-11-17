// COSGRAL W12-KK (g2): the engine of Transfer and Import of agents with one .zip (contract: ipc-instance-transfer.ts).
//
// EXPORT. For each chosen agent it writes its profile, memories, routines and skills (text files only) into a manifest and a folder per
// agent; with `includeSettings` also the portable settings of the server. Nothing secret is read: no API key, sign-in, Vault item, MCP
// value, chat history or Library file ever enters the archive, because the service is given no way to read them.
// IMPORT. `choose` STAGES a file: it reads and checks it and answers what is in it; nothing exists until `apply`. A staged file lives
// in memory only, under a random one-time token, for 10 minutes. `apply` creates NEW agents only (a name that is taken gets a
// numbered copy name), a routine from a file is created PAUSED, a skill whose name is already in the Library keeps the person's own
// version, and a failure of one part is a warning, not a reason to throw away the rest. The same staging reads the agent export of
// another program (a manifest `openbot-import.json` with agents, skills as folders and memories as texts; its routines are not read,
// because their schedule format is not ours).
//
// The service never sees a path: the main process gives it two ports that open the save/open dialogs and hand over bytes.

import { randomBytes } from "node:crypto";
import {
  type ApplyTransferInput,
  type ApplyTransferResult,
  type BotAvatarHue,
  type ExportInstanceInput,
  type ExportInstanceResult,
  type ImportSourceInfo,
  INSTANCE_TRANSFER_LIMITS,
  type InstanceTransferSummary,
  isAvatarHue,
  MEMORY_INCLUSIONS,
  type MemoryInclusion,
  type RoutineSchedule,
  type TransferAgentSummary,
  type TransferPreview,
  type TransferPreviewAgent,
  type TransferSource,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { createZip, isSafeZipName, readZip, ZipError } from "../zip";

export const TRANSFER_MANIFEST = "cosgral-transfer.json";
export const FOREIGN_MANIFEST = "openbot-import.json";
const FORMAT = "cosgral-instance-transfer";
const FOREIGN_FORMAT = "openbot-agent-import";
const STAGE_MS = 10 * 60 * 1000;
const MAX_STAGED = 3;
const KEY = /^[A-Za-z0-9._-]{1,64}$/;

export interface TransferSkill {
  name: string;
  skillMd: string;
  files: Array<{ path: string; content: string }>;
}

export interface TransferRoutine {
  name: string;
  prompt: string;
  schedule: RoutineSchedule;
  timezone: string | null;
}

export interface TransferMemory {
  text: string;
  inclusion: MemoryInclusion;
}

export interface TransferAgentRecord {
  id: string;
  name: string;
  role: string;
  instructions: string;
  avatarSeed: string;
  avatarHue: BotAvatarHue | null;
}

/** What the engine needs of this program. `main/index.ts` makes it from the agent service; tests make it from fakes. */
export interface TransferHost {
  appVersion: string;
  listAgents(): TransferAgentRecord[];
  skillsOf(agentId: string): Promise<{ skills: TransferSkill[]; warnings: string[] }>;
  memoriesOf(agentId: string): TransferMemory[];
  routinesOf(agentId: string): TransferRoutine[];
  createAgent(input: Omit<TransferAgentRecord, "id">): Promise<{ id: string; name: string }>;
  saveMemory(agentId: string, memory: TransferMemory): void;
  /** Saves the skill in the Library and installs it for the agent; "kept-existing" when the person already has a skill of that name. */
  installSkill(agentId: string, skill: TransferSkill): Promise<"installed" | "kept-existing">;
  /** Creates the routine PAUSED. */
  createPausedRoutine(agentId: string, routine: TransferRoutine): void;
  /** The portable settings of the server, or null when there are none to carry. */
  exportSettings: (() => unknown) | null;
  /** Applies settings that came from a file; the host checks them with its own parser. Answers whether anything changed. */
  applySettings: ((value: unknown) => boolean) | null;
}

export interface TransferFiles {
  /** Opens the save dialog and writes; answers the file's name, or null when the person closed the dialog. */
  save(suggestedName: string, bytes: Buffer): Promise<string | null>;
  /** Opens the file dialog and answers the bytes, or null when the person closed it. */
  open(): Promise<Buffer | null>;
}

export interface TransferServiceOptions {
  host: TransferHost;
  files: TransferFiles;
  now?: () => Date;
}

interface ImportedAgent extends TransferPreviewAgent {
  description: string;
  avatarSeed: string;
  avatarHue: BotAvatarHue | null;
  skills: TransferSkill[];
  memories: TransferMemory[];
  routines: TransferRoutine[];
}

interface Staged {
  source: TransferSource;
  sourceApp: string;
  exportedAt: string | null;
  agents: ImportedAgent[];
  settings: unknown;
  warnings: string[];
  expiresAt: number;
}

export class InstanceTransferService {
  readonly #options: TransferServiceOptions;
  readonly #now: () => Date;
  readonly #staged = new Map<string, Staged>();

  constructor(options: TransferServiceOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
  }

  async summary(): Promise<InstanceTransferSummary> {
    const { host } = this.#options;
    const agents: TransferAgentSummary[] = [];
    for (const agent of host.listAgents()) {
      const { skills } = await host.skillsOf(agent.id);
      agents.push({
        id: agent.id,
        name: agent.name,
        title: agent.role,
        avatarSeed: agent.avatarSeed,
        skillCount: skills.length,
        routineCount: host.routinesOf(agent.id).length,
        memoryCount: host.memoriesOf(agent.id).length,
      });
    }
    return { agents, capabilities: { settings: host.exportSettings !== null, files: false, history: false } };
  }

  async exportAgents(input: ExportInstanceInput): Promise<ExportInstanceResult> {
    const { host } = this.#options;
    const known = new Map(host.listAgents().map((agent) => [agent.id, agent]));
    for (const id of input.agentIds) if (!known.has(id)) throw new Error("One of the agents does not exist.");
    const warnings: string[] = [];
    const entries: Array<{ name: string; data: Buffer }> = [];
    const agents: unknown[] = [];
    for (const [index, id] of input.agentIds.entries()) {
      const agent = known.get(id);
      if (!agent) continue;
      const key = `agent-${index + 1}`;
      const { skills, warnings: skillWarnings } = await host.skillsOf(id);
      warnings.push(...skillWarnings.map((text) => `${agent.name}: ${text}`));
      const skillRefs: Array<{ name: string; dir: string }> = [];
      for (const skill of skills) {
        const dir = `agents/${key}/skills/${skill.name}`;
        if (!isSafeZipName(`${dir}/SKILL.md`)) {
          warnings.push(`${agent.name}: the skill ${skill.name} was left out (its name cannot be stored).`);
          continue;
        }
        entries.push({ name: `${dir}/SKILL.md`, data: Buffer.from(skill.skillMd, "utf8") });
        for (const file of skill.files) {
          if (isSafeZipName(`${dir}/${file.path}`))
            entries.push({ name: `${dir}/${file.path}`, data: Buffer.from(file.content, "utf8") });
        }
        skillRefs.push({ name: skill.name, dir });
      }
      agents.push({
        key,
        name: agent.name,
        title: agent.role,
        description: agent.instructions,
        avatarSeed: agent.avatarSeed,
        avatarHue: agent.avatarHue,
        skills: skillRefs,
        memories: host.memoriesOf(id),
        routines: host.routinesOf(id),
      });
    }
    const settings = input.includeSettings && host.exportSettings ? host.exportSettings() : undefined;
    if (input.includeSettings && !host.exportSettings) warnings.push("This version has no portable settings to carry.");
    const manifest = {
      format: FORMAT,
      version: 1,
      source: { app: "COSGRAL Workspace", appVersion: host.appVersion, exportedAt: this.#now().toISOString() },
      agents,
      ...(settings === undefined ? {} : { settings }),
    };
    entries.unshift({ name: TRANSFER_MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") });
    const bytes = createZip(entries);
    if (bytes.length > INSTANCE_TRANSFER_LIMITS.archiveBytes) throw new Error("The file would be too large.");
    const stamp = this.#now().toISOString().slice(0, 10);
    const fileName = await this.#options.files.save(`cosgral-transfer-${stamp}.zip`, bytes);
    if (fileName === null) return { status: "cancelled" };
    return {
      status: "saved",
      fileName,
      bytes: bytes.length,
      agents: input.agentIds.length,
      warnings: warnings.slice(0, INSTANCE_TRANSFER_LIMITS.warnings),
    };
  }

  /** Reads and checks a chosen file and keeps it staged; changes nothing. */
  async choose(): Promise<TransferPreview | null> {
    const bytes = await this.#options.files.open();
    if (bytes === null) return null;
    if (bytes.length > INSTANCE_TRANSFER_LIMITS.archiveBytes) throw new Error("That file is too large.");
    let entries: ReturnType<typeof readZip>;
    try {
      entries = readZip(bytes, {
        entries: INSTANCE_TRANSFER_LIMITS.entries,
        entryBytes: INSTANCE_TRANSFER_LIMITS.entryBytes,
        totalBytes: INSTANCE_TRANSFER_LIMITS.unpackedBytes,
      });
    } catch (error) {
      throw new Error(error instanceof ZipError ? error.message : "That file could not be read.");
    }
    const files = new Map(entries.map((entry) => [entry.name, entry.data]));
    const staged = this.#decode(files);
    this.#sweep();
    while (this.#staged.size >= MAX_STAGED) {
      const oldest = this.#staged.keys().next();
      if (oldest.done) break;
      this.#staged.delete(oldest.value);
    }
    const token = randomBytes(18).toString("hex");
    this.#staged.set(token, { ...staged, expiresAt: this.#now().getTime() + STAGE_MS });
    return this.#preview(token, staged);
  }

  async apply(input: ApplyTransferInput): Promise<ApplyTransferResult> {
    this.#sweep();
    const staged = this.#staged.get(input.token);
    if (!staged) throw new Error("That file is no longer staged. Choose it again.");
    // The token is used up at once: two quick clicks never import twice.
    this.#staged.delete(input.token);
    const { host } = this.#options;
    const agents: ApplyTransferResult["agents"] = [];
    const skipped: ApplyTransferResult["skipped"] = [];
    const warnings: string[] = [];
    const names = new Set(host.listAgents().map((agent) => agent.name.toLowerCase()));
    for (const agent of staged.agents) {
      if (!input.keys.includes(agent.key)) {
        skipped.push({ key: agent.key, reason: "unselected" });
        continue;
      }
      if (agents.length >= INSTANCE_TRANSFER_LIMITS.agents) {
        skipped.push({ key: agent.key, reason: "limit" });
        continue;
      }
      const name = copyName(agent.name, names);
      let created: { id: string; name: string };
      try {
        created = await host.createAgent({
          name,
          role: agent.title,
          instructions: agent.description,
          avatarSeed: agent.avatarSeed,
          avatarHue: agent.avatarHue,
        });
      } catch {
        skipped.push({ key: agent.key, reason: "failed" });
        continue;
      }
      names.add(created.name.toLowerCase());
      agents.push({ key: agent.key, id: created.id, name: created.name });
      let memoryFailures = 0;
      for (const memory of agent.memories) {
        try {
          host.saveMemory(created.id, memory);
        } catch {
          memoryFailures += 1;
        }
      }
      if (memoryFailures > 0) warnings.push(`${agent.name}: ${memoryFailures} memory(ies) could not be saved.`);
      for (const skill of agent.skills) {
        try {
          const result = await host.installSkill(created.id, skill);
          if (result === "kept-existing")
            warnings.push(
              `${agent.name}: the skill ${skill.name} was already in your Library, so your version is used.`,
            );
        } catch {
          warnings.push(`${agent.name}: the skill ${skill.name} could not be saved.`);
        }
      }
      let routineFailures = 0;
      for (const routine of agent.routines) {
        try {
          host.createPausedRoutine(created.id, routine);
        } catch {
          routineFailures += 1;
        }
      }
      if (agent.routines.length - routineFailures > 0) {
        warnings.push(
          `${agent.name}: ${agent.routines.length - routineFailures} routine(s) were created paused. Turn them on when you want them.`,
        );
      }
      if (routineFailures > 0) warnings.push(`${agent.name}: ${routineFailures} routine(s) could not be created.`);
    }
    let settingsApplied = false;
    if (input.includeSettings && staged.settings !== undefined && staged.settings !== null) {
      if (host.applySettings) {
        try {
          settingsApplied = host.applySettings(staged.settings);
        } catch {
          warnings.push("The settings in the file could not be applied.");
        }
      } else warnings.push("This version cannot apply settings from a file.");
    }
    return {
      agents,
      skipped,
      warnings: [...staged.warnings, ...warnings].slice(0, INSTANCE_TRANSFER_LIMITS.warnings),
      settingsApplied,
    };
  }

  discard(token: string): void {
    this.#staged.delete(token);
  }

  importSources(): ImportSourceInfo[] {
    return [
      { id: "agent-zip", available: true, note: null },
      { id: "hermes", available: false, note: "Reading a Hermes folder is not supported in this version." },
      { id: "other-computer", available: true, note: "Use Transfer to move agents and settings together." },
    ];
  }

  // --- internals ---

  #sweep(): void {
    const now = this.#now().getTime();
    for (const [token, staged] of this.#staged) if (staged.expiresAt <= now) this.#staged.delete(token);
  }

  #preview(token: string, staged: Omit<Staged, "expiresAt">): TransferPreview {
    const names = new Set(this.#options.host.listAgents().map((agent) => agent.name.toLowerCase()));
    return {
      token,
      source: staged.source,
      sourceApp: staged.sourceApp,
      exportedAt: staged.exportedAt,
      agents: staged.agents.map(
        (agent): TransferPreviewAgent => ({
          key: agent.key,
          name: agent.name,
          title: agent.title,
          skillNames: agent.skills.map((skill) => skill.name),
          memoryCount: agent.memories.length,
          routineNames: agent.routines.map((routine) => routine.name),
          nameTaken: names.has(agent.name.toLowerCase()),
        }),
      ),
      hasSettings: staged.settings !== undefined && staged.settings !== null,
      warnings: staged.warnings,
    };
  }

  #decode(files: Map<string, Buffer>): Omit<Staged, "expiresAt"> {
    const ours = files.get(TRANSFER_MANIFEST);
    const foreign = files.get(FOREIGN_MANIFEST);
    const raw = ours ?? foreign;
    if (!raw) throw new Error("That file is not an agent export (no manifest was found).");
    let manifest: unknown;
    try {
      manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    } catch {
      throw new Error("The manifest in that file is not valid.");
    }
    if (!isDynamicRecord(manifest) || manifest.version !== 1)
      throw new Error("That file was made by a newer version or is not an agent export.");
    const source: TransferSource = ours ? "transfer" : "agent-export";
    if (manifest.format !== (ours ? FORMAT : FOREIGN_FORMAT)) throw new Error("That file is not an agent export.");
    const warnings: string[] = [];
    if (!Array.isArray(manifest.agents) || manifest.agents.length === 0) throw new Error("That file holds no agents.");
    if (manifest.agents.length > INSTANCE_TRANSFER_LIMITS.agents) throw new Error("That file holds too many agents.");
    const info = isDynamicRecord(manifest.source) ? manifest.source : {};
    const sourceApp = isString(info.app) && info.app.length > 0 ? info.app.slice(0, 80) : "unknown";
    const exportedAt = isString(info.exportedAt) && !Number.isNaN(Date.parse(info.exportedAt)) ? info.exportedAt : null;
    const keys = new Set<string>();
    const agents: ImportedAgent[] = [];
    for (const item of manifest.agents) {
      const agent = decodeAgent(item, files, source, warnings);
      if (keys.has(agent.key)) throw new Error("Two agents in that file use the same key.");
      keys.add(agent.key);
      agents.push(agent);
    }
    return {
      source,
      sourceApp,
      exportedAt,
      agents,
      settings: ours ? manifest.settings : undefined,
      warnings: warnings.slice(0, INSTANCE_TRANSFER_LIMITS.warnings),
    };
  }
}

/** A name that is not taken: the name itself, or "Name (imported 2)", "(imported 3)", and so on. */
export function copyName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  for (let number = 2; ; number += 1) {
    const candidate = `${name} (imported ${number})`.slice(0, INSTANCE_TRANSFER_LIMITS.name);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function text(value: unknown, limit: number): string | null {
  return isString(value) && value.length <= limit ? value : null;
}

function decodeAgent(
  value: unknown,
  files: Map<string, Buffer>,
  source: TransferSource,
  warnings: string[],
): ImportedAgent {
  if (!isDynamicRecord(value) || !isString(value.key) || !KEY.test(value.key))
    throw new Error("An agent in that file has no valid key.");
  const key = value.key;
  const name = isString(value.name) ? value.name.trim() : "";
  if (name.length === 0 || name.length > INSTANCE_TRANSFER_LIMITS.name)
    throw new Error(`The agent ${key} has no valid name.`);
  const title = text(value.title ?? "", INSTANCE_TRANSFER_LIMITS.name);
  const description = text(value.description ?? "", INSTANCE_TRANSFER_LIMITS.text);
  if (title === null || description === null) throw new Error(`The agent ${name} has a field that is too long.`);
  const skills = decodeSkills(value.skills, files, key, name, source, warnings);
  const memories = decodeMemories(value.memories, name, warnings);
  let routines: TransferRoutine[] = [];
  if (source === "transfer") routines = decodeRoutines(value.routines, name, warnings);
  else if (Array.isArray(value.routines) && value.routines.length > 0) {
    warnings.push(`${name}: routines from another program are not imported (their schedule format is different).`);
  }
  return {
    key,
    name,
    title,
    skillNames: [],
    memoryCount: memories.length,
    routineNames: [],
    nameTaken: false,
    description,
    avatarSeed:
      source === "transfer" && isString(value.avatarSeed) && value.avatarSeed.length <= 200 ? value.avatarSeed : name,
    avatarHue: source === "transfer" && isAvatarHue(value.avatarHue) ? value.avatarHue : null,
    skills,
    memories,
    routines,
  };
}

function decodeSkills(
  value: unknown,
  files: Map<string, Buffer>,
  key: string,
  owner: string,
  source: TransferSource,
  warnings: string[],
): TransferSkill[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`The skill list of ${owner} is not valid.`);
  const skills: TransferSkill[] = [];
  const prefix = `agents/${key}/`;
  for (const item of value.slice(0, INSTANCE_TRANSFER_LIMITS.skillsPerAgent)) {
    // Ours: {name, dir}; the other program's: a path (a string) of the skill folder.
    const dir =
      source === "transfer"
        ? isDynamicRecord(item) && isString(item.dir)
          ? item.dir
          : null
        : isString(item)
          ? item
          : null;
    if (dir === null || !dir.startsWith(prefix) || !isSafeZipName(`${dir}/SKILL.md`)) {
      warnings.push(`${owner}: a skill was left out (its place in the file is not valid).`);
      continue;
    }
    const skillMd = files.get(`${dir.replace(/\/+$/, "")}/SKILL.md`);
    if (!skillMd) {
      warnings.push(`${owner}: a skill was left out (it has no SKILL.md).`);
      continue;
    }
    const folder = `${dir.replace(/\/+$/, "")}/`;
    const extra: TransferSkill["files"] = [];
    for (const [path, data] of files) {
      if (!path.startsWith(folder) || path === `${folder}SKILL.md`) continue;
      try {
        extra.push({
          path: path.slice(folder.length),
          content: new TextDecoder("utf-8", { fatal: true }).decode(data),
        });
      } catch {
        warnings.push(`${owner}: a file of a skill was left out (it is not text).`);
      }
    }
    let md: string;
    try {
      md = new TextDecoder("utf-8", { fatal: true }).decode(skillMd);
    } catch {
      warnings.push(`${owner}: a skill was left out (SKILL.md is not text).`);
      continue;
    }
    const nameFromDir = folder.slice(0, -1).split("/").pop() ?? "skill";
    skills.push({ name: nameFromDir, skillMd: md, files: extra });
  }
  return skills;
}

function decodeMemories(value: unknown, owner: string, warnings: string[]): TransferMemory[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`The memory list of ${owner} is not valid.`);
  const memories: TransferMemory[] = [];
  let dropped = 0;
  for (const item of value) {
    // Ours: {text, inclusion}; the other program's: a plain text.
    const body = isString(item) ? item : isDynamicRecord(item) && isString(item.text) ? item.text : null;
    const inclusion =
      isDynamicRecord(item) && isOneOf(MEMORY_INCLUSIONS, item.inclusion) ? item.inclusion : "searchable";
    const trimmed = body?.trim() ?? "";
    if (
      trimmed.length === 0 ||
      trimmed.length > INSTANCE_TRANSFER_LIMITS.text ||
      memories.length >= INSTANCE_TRANSFER_LIMITS.memoriesPerAgent
    ) {
      dropped += 1;
      continue;
    }
    memories.push({ text: trimmed, inclusion });
  }
  if (dropped > 0) warnings.push(`${owner}: ${dropped} memory(ies) were left out (empty, too long or over the limit).`);
  return memories;
}

function isSchedule(value: unknown): value is RoutineSchedule {
  if (!isDynamicRecord(value)) return false;
  if (value.type === "interval") return isNumber(value.everyMinutes) && value.everyMinutes >= 1;
  if (value.type === "daily") return isString(value.time) && /^\d{2}:\d{2}$/.test(value.time);
  if (value.type === "cron") return isString(value.expression) && value.expression.length <= 100;
  return false;
}

function decodeRoutines(value: unknown, owner: string, warnings: string[]): TransferRoutine[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`The routine list of ${owner} is not valid.`);
  const routines: TransferRoutine[] = [];
  for (const item of value.slice(0, INSTANCE_TRANSFER_LIMITS.routinesPerAgent)) {
    if (
      !isDynamicRecord(item) ||
      !isString(item.name) ||
      item.name.trim().length === 0 ||
      item.name.length > INSTANCE_TRANSFER_LIMITS.name ||
      !isString(item.prompt) ||
      item.prompt.trim().length === 0 ||
      item.prompt.length > INSTANCE_TRANSFER_LIMITS.text ||
      !isSchedule(item.schedule)
    ) {
      warnings.push(`${owner}: a routine was left out (it is not valid).`);
      continue;
    }
    routines.push({
      name: item.name.trim(),
      prompt: item.prompt,
      schedule: item.schedule,
      timezone: isString(item.timezone) && item.timezone.length <= 64 ? item.timezone : null,
    });
  }
  return routines;
}
