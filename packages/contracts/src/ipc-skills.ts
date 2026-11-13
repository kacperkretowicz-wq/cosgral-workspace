// COSGRAL W2: the local skill library (spec W2 §1, parity row 24).
//
// A skill is a folder with SKILL.md (front matter `name`, `description`, optional `example-prompt`) and optional
// scripts, references and assets. The library on this computer keeps every version; a new version never changes
// copies that agents already installed. Each agent gets its own installed copy, and a copy that someone changed
// is never overwritten without an explicit decision. Registering or installing a skill never runs its scripts.

import { isBoolean, isDynamicRecord, isNumber, isString } from "./runtime-values";

/** Every limit of the skill library in one place. */
export const SKILL_LIMITS = {
  /** Kebab-case name, also the folder name. */
  name: 64,
  description: 1_024,
  /** Optional `example-prompt`: only fills the composer draft for "Try skill", never sends. */
  examplePrompt: 1_000,
  skillMdBytes: 256 * 1024,
  files: 200,
  totalBytes: 10 * 1024 * 1024,
  /** Relative path of one file inside the skill folder. */
  filePath: 200,
  /** Note of one version, e.g. what a revision changed. */
  note: 500,
  skills: 500,
} as const;

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/** A skill in the library; `version` and `path` are its latest version. */
export interface LocalSkill {
  id: string;
  name: string;
  description: string;
  examplePrompt: string | null;
  version: number;
  /** The agent that created it, or null for a person. */
  createdByBotId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Read-only folder of the latest version in the library. */
  path: string;
}

/** One stored version. Versions never change; restoring an old one creates a new version. */
export interface SkillVersion {
  skillId: string;
  version: number;
  createdAt: string;
  authorBotId: string | null;
  note: string | null;
  /** Set when this version copies an older one (rollback). */
  restoredFrom: number | null;
  contentHash: string;
  files: number;
  bytes: number;
}

export interface SkillFile {
  /** Path inside the skill folder, with "/" separators. */
  path: string;
  bytes: number;
}

/** SKILL.md and the file list of one version. */
export interface SkillContent {
  skill: LocalSkill;
  version: number;
  skillMd: string;
  files: SkillFile[];
}

/** A skill installed for one agent: the agent's own copy of one version. */
export interface SkillInstall {
  botId: string;
  skillId: string;
  name: string;
  installedVersion: number;
  latestVersion: number;
  updateAvailable: boolean;
  /** Someone changed the agent's copy since it was installed; Update then needs `overwriteLocalChanges`. */
  modifiedLocally: boolean;
  /** The agent's copy (folder with SKILL.md). */
  path: string;
  installedAt: string;
}

export interface SkillIdInput {
  skillId: string;
}

export interface ReadSkillInput {
  skillId: string;
  /** Latest version when omitted. */
  version?: number;
}

/** Rollback: the library gets a new version with the content of `version`. */
export interface RestoreSkillVersionInput {
  skillId: string;
  version: number;
}

export interface DeleteSkillInput {
  skillId: string;
  /** Also remove installed copies that someone changed. */
  force?: boolean;
}

export interface ListSkillInstallsInput {
  /** Every agent when omitted. */
  botId?: string;
}

export interface InstallSkillInput {
  skillId: string;
  botId: string;
  /** Latest version when omitted. */
  version?: number;
}

export interface UpdateSkillInstallInput {
  skillId: string;
  botId: string;
  /** Required when the agent's copy was changed locally; those changes are lost. */
  overwriteLocalChanges?: boolean;
}

export interface UninstallSkillInput {
  skillId: string;
  botId: string;
}

export function isSkillName(value: unknown): value is string {
  return (
    isString(value) && value.length <= SKILL_LIMITS.name && SKILL_NAME.test(value) && !WINDOWS_RESERVED.test(value)
  );
}

function isVersionNumber(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 1;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isLocalSkill(value: unknown): value is LocalSkill {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isSkillName(value.name) &&
    isString(value.description) &&
    isNullableString(value.examplePrompt) &&
    isVersionNumber(value.version) &&
    isNullableString(value.createdByBotId) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    isString(value.path)
  );
}

export function isSkillVersion(value: unknown): value is SkillVersion {
  return (
    isDynamicRecord(value) &&
    isString(value.skillId) &&
    isVersionNumber(value.version) &&
    isString(value.createdAt) &&
    isNullableString(value.authorBotId) &&
    isNullableString(value.note) &&
    (value.restoredFrom === null || isVersionNumber(value.restoredFrom)) &&
    isString(value.contentHash) &&
    isNumber(value.files) &&
    isNumber(value.bytes)
  );
}

function isSkillFile(value: unknown): value is SkillFile {
  return isDynamicRecord(value) && isString(value.path) && isNumber(value.bytes);
}

export function isSkillContent(value: unknown): value is SkillContent {
  return (
    isDynamicRecord(value) &&
    isLocalSkill(value.skill) &&
    isVersionNumber(value.version) &&
    isString(value.skillMd) &&
    Array.isArray(value.files) &&
    value.files.every(isSkillFile)
  );
}

export function isSkillInstall(value: unknown): value is SkillInstall {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isString(value.skillId) &&
    isSkillName(value.name) &&
    isVersionNumber(value.installedVersion) &&
    isVersionNumber(value.latestVersion) &&
    isBoolean(value.updateAvailable) &&
    isBoolean(value.modifiedLocally) &&
    isString(value.path) &&
    isString(value.installedAt)
  );
}
