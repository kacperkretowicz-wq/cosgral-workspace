// COSGRAL: built-in skills. Three skills (superpowers, i-have-adhd, graphify) ship with the app, are always in the
// skill library, and can be switched on per agent. This computer only. The skill files are copies of the public
// sources under their own licenses; nothing here runs a skill.

import { isBoolean, isDynamicRecord, isString } from "./runtime-values";

export const BUILTIN_SKILL_PACK_IDS = ["superpowers", "i-have-adhd", "graphify"] as const;
export type BuiltinSkillPackId = (typeof BUILTIN_SKILL_PACK_IDS)[number];

/** Most agents one request may change at once. */
export const BUILTIN_SKILL_LIMITS = { botIds: 500 } as const;

/**
 * Where one skill of a pack stands in the library:
 * `ready` it is in the library, `name-taken` the library holds a different skill with this name (left alone),
 * `missing` it could not be added (the reason is in `problem`).
 */
export const BUILTIN_SKILL_STATES = ["ready", "name-taken", "missing"] as const;
export type BuiltinSkillState = (typeof BUILTIN_SKILL_STATES)[number];

export interface BuiltinSkillEntry {
  name: string;
  description: string;
  /** The library skill, or null when it is not in the library. */
  skillId: string | null;
  state: BuiltinSkillState;
}

/** A program outside the app that a skill needs (graphify). The app never installs it; it only checks and explains. */
export interface BuiltinSkillProgram {
  /** The command name, e.g. "graphify". */
  command: string;
  /** What to type in a terminal to install it. */
  installCommand: string;
  /** Found on this computer's search path. */
  found: boolean;
}

export interface BuiltinSkillPack {
  id: BuiltinSkillPackId;
  /** English text of the engine; the window shows its Polish translation. */
  title: string;
  summary: string;
  whenToUse: string;
  license: string;
  sourceUrl: string;
  /** Version of the public source the files come from. */
  sourceVersion: string;
  skills: BuiltinSkillEntry[];
  /** New agents get the whole pack when they are created. */
  defaultForNewAgents: boolean;
  /** Agents that have every skill of the pack. */
  installedBotIds: string[];
  /** Agents that have some, not all, of the skills. */
  partialBotIds: string[];
  program: BuiltinSkillProgram | null;
}

export interface ApplyBuiltinSkillInput {
  packId: BuiltinSkillPackId;
  botIds: string[];
  /** true: give the agents the whole pack. false: take the whole pack away from them. */
  enabled: boolean;
}

export interface SetBuiltinSkillDefaultInput {
  packId: BuiltinSkillPackId;
  enabled: boolean;
}

/** The window API (`window.openbot.builtinSkills`). Every call answers with the packs as they are now. */
export interface BuiltinSkillsDesktopApi {
  list: () => Promise<BuiltinSkillPack[]>;
  apply: (input: ApplyBuiltinSkillInput) => Promise<BuiltinSkillPack[]>;
  setDefault: (input: SetBuiltinSkillDefaultInput) => Promise<BuiltinSkillPack[]>;
}

export function isBuiltinSkillPackId(value: unknown): value is BuiltinSkillPackId {
  return BUILTIN_SKILL_PACK_IDS.some((id) => id === value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isBuiltinSkillEntry(value: unknown): value is BuiltinSkillEntry {
  return (
    isDynamicRecord(value) &&
    isString(value.name) &&
    isString(value.description) &&
    (value.skillId === null || isString(value.skillId)) &&
    BUILTIN_SKILL_STATES.some((state) => state === value.state)
  );
}

function isBuiltinSkillProgram(value: unknown): value is BuiltinSkillProgram {
  return isDynamicRecord(value) && isString(value.command) && isString(value.installCommand) && isBoolean(value.found);
}

export function isBuiltinSkillPack(value: unknown): value is BuiltinSkillPack {
  return (
    isDynamicRecord(value) &&
    isBuiltinSkillPackId(value.id) &&
    isString(value.title) &&
    isString(value.summary) &&
    isString(value.whenToUse) &&
    isString(value.license) &&
    isString(value.sourceUrl) &&
    isString(value.sourceVersion) &&
    Array.isArray(value.skills) &&
    value.skills.every(isBuiltinSkillEntry) &&
    isBoolean(value.defaultForNewAgents) &&
    isStringArray(value.installedBotIds) &&
    isStringArray(value.partialBotIds) &&
    (value.program === null || isBuiltinSkillProgram(value.program))
  );
}
