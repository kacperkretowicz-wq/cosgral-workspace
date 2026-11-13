// COSGRAL W2: routines and webhooks (spec-w2 §4, lead decision 4).
//
// A routine belongs to one agent and gives it a new turn with the routine's instruction, marked as a
// routine run. It starts on a local schedule (every N minutes, every day at a time, or a 5-field cron,
// always in the person's time zone) or when the program's loopback webhook receiver gets a signed POST
// (Standard Webhooks). While the program is off nothing runs, and after a start missed runs are not
// made up: the history shows one "skipped" entry instead.
//
// A webhook routine has a signing secret. It is returned once to the person who created it (or
// regenerated it) and never to an agent.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const ROUTINE_LIMITS = {
  /** Routines on this computer, schedule and webhook together. */
  routines: 64,
  name: 80,
  prompt: 8_000,
  /** Largest webhook body (bytes). */
  webhookBody: 64 * 1024,
  /** A repeated delivery id within this many days starts nothing. */
  dedupeDays: 7,
  /** Seconds a signed webhook timestamp may differ from this computer's clock. */
  webhookToleranceSeconds: 300,
  minIntervalMinutes: 1,
  maxIntervalMinutes: 7 * 24 * 60,
  /** History entries kept per routine (oldest dropped). */
  runsKept: 100,
  eventTypes: 32,
} as const;

export const ROUTINE_TRIGGERS = ["schedule", "webhook"] as const;
export type RoutineTrigger = (typeof ROUTINE_TRIGGERS)[number];

export type RoutineSchedule =
  | { type: "interval"; everyMinutes: number }
  /** "HH:MM" local time; weekdays 0 (Sunday) … 6, empty or missing = every day. */
  | { type: "daily"; time: string; weekdays?: number[] }
  /** Five fields: minute hour day-of-month month day-of-week, local time. */
  | { type: "cron"; expression: string };

export interface RoutineWebhook {
  /** The loopback address that receives signed POSTs for this routine. */
  url: string;
  /** Only payloads whose "type" is one of these start a run; empty = every type. */
  eventTypes: string[];
}

export interface Routine {
  id: string;
  botId: string;
  name: string;
  /** What the agent is asked to do on each run. */
  prompt: string;
  trigger: RoutineTrigger;
  schedule: RoutineSchedule | null;
  /** IANA time zone the schedule is read in. */
  timezone: string;
  paused: boolean;
  /** Next scheduled start (ISO), null for paused and webhook routines. */
  nextRunAt: string | null;
  webhook: RoutineWebhook | null;
  createdBy: "person" | "agent";
  createdAt: string;
  updatedAt: string;
}

export const ROUTINE_RUN_STATUSES = ["running", "done", "failed", "skipped", "ignored"] as const;
export type RoutineRunStatus = (typeof ROUTINE_RUN_STATUSES)[number];

export interface RoutineRun {
  id: string;
  routineId: string;
  botId: string;
  /** What started it; "manual" = run now by a person. */
  cause: "schedule" | "webhook" | "manual";
  status: RoutineRunStatus;
  /** Why it was skipped, ignored or failed. */
  reason: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Webhook delivery id, when a webhook started it. */
  deliveryId: string | null;
}

export interface CreateRoutineInput {
  botId: string;
  name: string;
  prompt: string;
  trigger: RoutineTrigger;
  schedule?: RoutineSchedule;
  /** Default: the time zone of this computer. */
  timezone?: string;
  eventTypes?: string[];
  paused?: boolean;
}

export interface UpdateRoutineInput {
  routineId: string;
  name?: string;
  prompt?: string;
  schedule?: RoutineSchedule;
  timezone?: string;
  eventTypes?: string[];
  paused?: boolean;
}

export interface RoutineIdInput {
  routineId: string;
}

/** A webhook routine's signing secret, shown once. Format "whsec_<base64>" (Standard Webhooks). */
export interface RoutineWithSecret {
  routine: Routine;
  secret: string | null;
}

export function isRoutineTrigger(value: unknown): value is RoutineTrigger {
  return isOneOf(ROUTINE_TRIGGERS, value);
}

export function isRoutineRunStatus(value: unknown): value is RoutineRunStatus {
  return isOneOf(ROUTINE_RUN_STATUSES, value);
}

export function isRoutineSchedule(value: unknown): value is RoutineSchedule {
  if (!isDynamicRecord(value)) return false;
  if (value.type === "interval") return isNumber(value.everyMinutes);
  if (value.type === "daily") {
    return (
      isString(value.time) &&
      (value.weekdays === undefined || (Array.isArray(value.weekdays) && value.weekdays.every(isNumber)))
    );
  }
  return value.type === "cron" && isString(value.expression);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isRoutine(value: unknown): value is Routine {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.botId) &&
    isString(value.name) &&
    isString(value.prompt) &&
    isRoutineTrigger(value.trigger) &&
    (value.schedule === null || isRoutineSchedule(value.schedule)) &&
    isString(value.timezone) &&
    isBoolean(value.paused) &&
    isNullableString(value.nextRunAt) &&
    (value.webhook === null ||
      (isDynamicRecord(value.webhook) &&
        isString(value.webhook.url) &&
        Array.isArray(value.webhook.eventTypes) &&
        value.webhook.eventTypes.every(isString))) &&
    (value.createdBy === "person" || value.createdBy === "agent") &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isRoutineRun(value: unknown): value is RoutineRun {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.routineId) &&
    isString(value.botId) &&
    (value.cause === "schedule" || value.cause === "webhook" || value.cause === "manual") &&
    isRoutineRunStatus(value.status) &&
    isNullableString(value.reason) &&
    isString(value.startedAt) &&
    isNullableString(value.finishedAt) &&
    isNullableString(value.deliveryId)
  );
}

export function isRoutineWithSecret(value: unknown): value is RoutineWithSecret {
  return isDynamicRecord(value) && isRoutine(value.routine) && isNullableString(value.secret);
}
