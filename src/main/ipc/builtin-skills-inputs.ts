// COSGRAL: what a window may send for the built-in skills (see ipc-builtin-skills.ts).

import {
  type ApplyBuiltinSkillInput,
  BUILTIN_SKILL_LIMITS,
  isBuiltinSkillPackId,
  type SetBuiltinSkillDefaultInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

function packId(value: unknown): ApplyBuiltinSkillInput["packId"] {
  if (!isBuiltinSkillPackId(value)) throw new Error("Unknown built-in skill pack.");
  return value;
}

function record(value: unknown) {
  if (!isObject(value)) throw new Error("Expected an object.");
  return value;
}

export function parseApplyBuiltinSkill(value: unknown): ApplyBuiltinSkillInput {
  const input = record(value);
  if (!Array.isArray(input.botIds) || !input.botIds.every(isString)) throw new Error("botIds must be a list of text.");
  if (input.botIds.length > BUILTIN_SKILL_LIMITS.botIds) throw new Error("botIds is too long.");
  if (!isBoolean(input.enabled)) throw new Error("enabled must be true or false.");
  return {
    packId: packId(input.packId),
    botIds: input.botIds.map((botId) => requireString(botId, "botId")),
    enabled: input.enabled,
  };
}

export function parseSetBuiltinSkillDefault(value: unknown): SetBuiltinSkillDefaultInput {
  const input = record(value);
  if (!isBoolean(input.enabled)) throw new Error("enabled must be true or false.");
  return { packId: packId(input.packId), enabled: input.enabled };
}
