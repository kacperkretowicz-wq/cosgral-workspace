// COSGRAL W2: input validation for the routine IPC calls. Content rules (time zone, cron, limits) are in RoutineManager.

import {
  type CreateRoutineInput,
  isRoutineSchedule,
  isRoutineTrigger,
  ROUTINE_LIMITS,
  type RoutineIdInput,
  type RoutineSchedule,
  type UpdateRoutineInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseCreateRoutine(value: unknown): CreateRoutineInput {
  if (!isObject(value)) throw new Error("Routine details are required.");
  if (!isRoutineTrigger(value.trigger)) throw new Error("The trigger is schedule or webhook.");
  return {
    botId: requireString(value.botId, "botId"),
    name: requireString(value.name, "name", ROUTINE_LIMITS.name),
    prompt: requireString(value.prompt, "prompt", ROUTINE_LIMITS.prompt),
    trigger: value.trigger,
    schedule: optionalSchedule(value.schedule),
    timezone: optionalText(value.timezone, "timezone"),
    eventTypes: optionalEventTypes(value.eventTypes),
    paused: optionalBoolean(value.paused),
  };
}

export function parseUpdateRoutine(value: unknown): UpdateRoutineInput {
  if (!isObject(value)) throw new Error("Routine details are required.");
  return {
    routineId: requireString(value.routineId, "routineId"),
    name: optionalText(value.name, "name", ROUTINE_LIMITS.name),
    prompt: optionalText(value.prompt, "prompt", ROUTINE_LIMITS.prompt),
    schedule: optionalSchedule(value.schedule),
    timezone: optionalText(value.timezone, "timezone"),
    eventTypes: optionalEventTypes(value.eventTypes),
    paused: optionalBoolean(value.paused),
  };
}

export function parseRoutineId(value: unknown): RoutineIdInput {
  if (!isObject(value)) throw new Error("The routine is required.");
  return { routineId: requireString(value.routineId, "routineId") };
}

export function parseRoutinesBotId(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : requireString(value, "botId");
}

function optionalText(value: unknown, name: string, maxLength?: number): string | undefined {
  return value === undefined || value === null ? undefined : requireString(value, name, maxLength);
}

function optionalSchedule(value: unknown): RoutineSchedule | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRoutineSchedule(value)) throw new Error("The schedule is interval, daily or cron.");
  return value;
}

function optionalEventTypes(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every(isString)) throw new Error("eventTypes must be a list of texts.");
  return [...value];
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isBoolean(value)) throw new Error("paused must be true or false.");
  return value;
}
