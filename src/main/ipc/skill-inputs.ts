// COSGRAL W2: what a window may send for the skill library (see ipc-skills.ts).

import type {
  DeleteSkillInput,
  InstallSkillInput,
  ListSkillInstallsInput,
  ReadSkillInput,
  RestoreSkillVersionInput,
  SkillIdInput,
  UninstallSkillInput,
  UpdateSkillInstallInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isNumber } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseSkillId(value: unknown): SkillIdInput {
  return { skillId: requireString(record(value).skillId, "skillId") };
}

export function parseReadSkill(value: unknown): ReadSkillInput {
  const input = record(value);
  const parsed: ReadSkillInput = { skillId: requireString(input.skillId, "skillId") };
  if (input.version !== undefined) parsed.version = version(input.version);
  return parsed;
}

export function parseRestoreSkillVersion(value: unknown): RestoreSkillVersionInput {
  const input = record(value);
  return { skillId: requireString(input.skillId, "skillId"), version: version(input.version) };
}

export function parseDeleteSkill(value: unknown): DeleteSkillInput {
  const input = record(value);
  const parsed: DeleteSkillInput = { skillId: requireString(input.skillId, "skillId") };
  if (input.force !== undefined) parsed.force = flag(input.force, "force");
  return parsed;
}

export function parseListSkillInstalls(value: unknown): ListSkillInstallsInput {
  if (value === null || value === undefined) return {};
  const input = record(value);
  return input.botId === undefined ? {} : { botId: requireString(input.botId, "botId") };
}

export function parseInstallSkill(value: unknown): InstallSkillInput {
  const input = record(value);
  const parsed: InstallSkillInput = {
    skillId: requireString(input.skillId, "skillId"),
    botId: requireString(input.botId, "botId"),
  };
  if (input.version !== undefined) parsed.version = version(input.version);
  return parsed;
}

export function parseUpdateSkillInstall(value: unknown): UpdateSkillInstallInput {
  const input = record(value);
  const parsed: UpdateSkillInstallInput = {
    skillId: requireString(input.skillId, "skillId"),
    botId: requireString(input.botId, "botId"),
  };
  if (input.overwriteLocalChanges !== undefined) {
    parsed.overwriteLocalChanges = flag(input.overwriteLocalChanges, "overwriteLocalChanges");
  }
  return parsed;
}

export function parseUninstallSkill(value: unknown): UninstallSkillInput {
  const input = record(value);
  return { skillId: requireString(input.skillId, "skillId"), botId: requireString(input.botId, "botId") };
}

function record(value: unknown): DynamicRecord {
  if (!isObject(value)) throw new Error("Invalid skill request.");
  return value;
}

function version(value: unknown): number {
  if (!isNumber(value) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("version must be a whole number from 1.");
  }
  return value;
}

function flag(value: unknown, field: string): boolean {
  if (!isBoolean(value)) throw new Error(`${field} must be true or false.`);
  return value;
}
