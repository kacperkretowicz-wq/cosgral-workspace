// COSGRAL W12 (BE-Q, BE-R): routines of a CHANNEL (owner question 2). A channel routine starts work for the whole team at a fixed time: on
// each run the program sends the routine's prompt to the channel as a message of the person ("Scheduled: <name>") and the channel's lead
// takes it like any other request (a task with an owner, a state and a result). It uses the schedule of the routines of an agent
// (`RoutineSchedule`: every N minutes, daily, cron; the person's time zone), so the starts are worked out by the same code
// (`nextRunAfter`) and the two kinds never disagree.
//
// A run is "started" (the message and the task exist; `taskState` follows the task, so the history says whether the work ended well) or
// "skipped" with a reason (the channel is archived or has no lead, the previous run is still going, the program was off at the planned
// time; missed runs are not made up). Nothing runs while the program is off. This computer only.
//
// Rules shared by the engine, the mock and the screen are the pure functions here; reads and writes are `window.openbot.channelRoutines`.

import { isRoutineSchedule, ROUTINE_LIMITS, type RoutineSchedule } from "./ipc-routines";
import {
  CHANNEL_LIMITS,
  type ChannelTaskState,
  isChannelTaskState,
  type WorkspaceChannel,
} from "./ipc-workspace-channels";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const CHANNEL_ROUTINE_LIMITS = {
  /** Channel routines on this computer (together with the routines of agents they stay under ROUTINE_LIMITS.routines). */
  perChannel: 16,
  name: ROUTINE_LIMITS.name,
  prompt: Math.min(ROUTINE_LIMITS.prompt, CHANNEL_LIMITS.message),
  /** Entries of the history kept per routine (oldest dropped). */
  runsKept: ROUTINE_LIMITS.runsKept,
} as const;

export interface CreateChannelRoutineInput {
  channelId: string;
  name: string;
  /** What the lead is asked to do on each run. */
  prompt: string;
  schedule: RoutineSchedule;
  /** IANA time zone; default: the time zone of this computer. */
  timezone?: string;
  paused?: boolean;
}

export interface UpdateChannelRoutineInput {
  routineId: string;
  name?: string;
  prompt?: string;
  schedule?: RoutineSchedule;
  timezone?: string;
  paused?: boolean;
}

export interface ChannelRoutineIdInput {
  routineId: string;
}

export interface ListChannelRoutinesInput {
  /** One channel's routines; missing = all. */
  channelId?: string;
}

export interface ChannelRoutine {
  id: string;
  channelId: string;
  name: string;
  prompt: string;
  schedule: RoutineSchedule;
  timezone: string;
  paused: boolean;
  /** The next planned start (ISO); null while paused or when the schedule has none. */
  nextRunAt: string | null;
  /** The last start or skip (ISO); null before the first. */
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * A signed POST to the program's local webhook receiver also starts the routine (besides the schedule). The secret is kept encrypted
   * on this computer and shown once, when the webhook is turned on or a new secret is made. Missing in rows saved before = off.
   */
  webhookEnabled?: boolean;
}

/** What turning the webhook on (or making a new secret) answers: the address to POST to and the signing secret, shown this once. */
export interface ChannelRoutineWebhook {
  routine: ChannelRoutine;
  /** The local address (127.0.0.1); reach it from outside only through a tunnel you trust. */
  url: string;
  /** Standard Webhooks signing secret ("whsec_…"). */
  secret: string;
}

export const CHANNEL_ROUTINE_RUN_OUTCOMES = ["started", "skipped"] as const;
export type ChannelRoutineRunOutcome = (typeof CHANNEL_ROUTINE_RUN_OUTCOMES)[number];

export interface ChannelRoutineRun {
  id: string;
  routineId: string;
  /** When it was planned or asked for (ISO). */
  at: string;
  /** "schedule" = the planned time; "manual" = "Run now" by a person; "webhook" = a signed delivery to the local receiver. */
  cause: "schedule" | "manual" | "webhook";
  outcome: ChannelRoutineRunOutcome;
  /** Why it was skipped; null when started. */
  reason: string | null;
  /** The message sent to the channel and the task it made; null when skipped. */
  messageId: string | null;
  taskId: string | null;
  /** The state of that task now (read live: queued, running, done, failed ...); null when skipped or when the task is gone. */
  taskState: ChannelTaskState | null;
}

/** `channel-routines-changed`: the routines of one channel changed (made, edited, started, skipped, removed). */
export interface ChannelRoutinesChanged {
  channelId: string;
  routines: ChannelRoutine[];
}

/** `window.openbot.channelRoutines` (this computer only). */
export interface ChannelRoutinesDesktopApi {
  list: (input?: ListChannelRoutinesInput) => Promise<ChannelRoutine[]>;
  create: (input: CreateChannelRoutineInput) => Promise<ChannelRoutine>;
  update: (input: UpdateChannelRoutineInput) => Promise<ChannelRoutine>;
  delete: (input: ChannelRoutineIdInput) => Promise<void>;
  /** Starts it now, outside the schedule (the next planned start does not move). A skipped run is refused with the reason. */
  runNow: (input: ChannelRoutineIdInput) => Promise<ChannelRoutineRun>;
  /** The history of one routine, newest first. */
  listRuns: (input: ChannelRoutineIdInput) => Promise<ChannelRoutineRun[]>;
  /** Turns the webhook on, or makes a new secret when it is on (the old one stops working). Optional: older builds lack it. */
  enableWebhook?: (input: ChannelRoutineIdInput) => Promise<ChannelRoutineWebhook>;
  /** Turns the webhook off and forgets the secret. */
  disableWebhook?: (input: ChannelRoutineIdInput) => Promise<ChannelRoutine>;
}

/** The text sent to the channel on each run: the name first, so the history says why the work started. */
export function channelRoutineMessage(name: string, prompt: string): string {
  return `Scheduled: ${name.trim()}\n\n${prompt.trim()}`;
}

function scheduleProblem(value: unknown): string | null {
  if (!isDynamicRecord(value)) return "Give the schedule.";
  if (value.type === "interval") {
    const minutes = value.everyMinutes;
    if (!isNumber(minutes) || !Number.isInteger(minutes)) return "The interval is a whole number of minutes.";
    if (minutes < ROUTINE_LIMITS.minIntervalMinutes || minutes > ROUTINE_LIMITS.maxIntervalMinutes) {
      return `The interval is from ${ROUTINE_LIMITS.minIntervalMinutes} minute to ${ROUTINE_LIMITS.maxIntervalMinutes / 1440} days.`;
    }
    return null;
  }
  if (value.type === "daily") {
    if (!isString(value.time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) {
      return "The time is written HH:MM, for example 09:30.";
    }
    const weekdays = value.weekdays;
    if (
      weekdays !== undefined &&
      !(
        Array.isArray(weekdays) &&
        weekdays.every((day) => isNumber(day) && Number.isInteger(day) && day >= 0 && day <= 6)
      )
    ) {
      return "Weekdays are numbers from 0 (Sunday) to 6 (Saturday).";
    }
    return null;
  }
  if (value.type === "cron") {
    return isString(value.expression) && value.expression.trim().split(/\s+/).length === 5
      ? null
      : "A cron schedule has five fields: minute hour day month weekday.";
  }
  return "The schedule is an interval, a daily time or a cron expression.";
}

function nameProblem(value: unknown): string | null {
  const name = isString(value) ? value.trim() : "";
  if (name.length === 0) return "Give the routine a name.";
  if (name.length > CHANNEL_ROUTINE_LIMITS.name)
    return `The name has at most ${CHANNEL_ROUTINE_LIMITS.name} characters.`;
  return null;
}

function promptProblem(value: unknown): string | null {
  const prompt = isString(value) ? value.trim() : "";
  if (prompt.length === 0) return "Say what the lead should do on each run.";
  if (prompt.length > CHANNEL_ROUTINE_LIMITS.prompt) {
    return `The instruction has at most ${CHANNEL_ROUTINE_LIMITS.prompt} characters.`;
  }
  return null;
}

function optionsProblem(input: { timezone?: unknown; paused?: unknown }) {
  if (
    input.timezone !== undefined &&
    !(isString(input.timezone) && input.timezone.length > 0 && input.timezone.length <= 64)
  ) {
    return "The time zone is a name like Europe/Warsaw.";
  }
  if (input.paused !== undefined && !isBoolean(input.paused)) return "Paused is on or off.";
  return null;
}

/** Why a channel cannot take one more routine, in plain words, or null. `channel` null = it does not exist. */
export function channelRoutineChannelProblem(channel: Pick<WorkspaceChannel, "archived" | "leadBotId"> | null) {
  if (!channel) return "This project no longer exists.";
  if (channel.archived) return "This project is archived.";
  if (!channel.leadBotId) return "This project has no lead to take the work. Make one of its members the lead first.";
  return null;
}

/**
 * Why a channel routine cannot be made, in plain words, or null. `channel` is the channel the input names (null = it does not exist),
 * `routinesInChannel` how many routines it has now.
 */
export function channelRoutineProblem(
  input: unknown,
  channel: Pick<WorkspaceChannel, "archived" | "leadBotId"> | null,
  routinesInChannel: number,
): string | null {
  if (!isDynamicRecord(input) || !isString(input.channelId)) return "Choose a project.";
  const channelProblem = channelRoutineChannelProblem(channel);
  if (channelProblem) return channelProblem;
  if (routinesInChannel >= CHANNEL_ROUTINE_LIMITS.perChannel) {
    return `A channel has at most ${CHANNEL_ROUTINE_LIMITS.perChannel} routines.`;
  }
  return (
    nameProblem(input.name) ?? promptProblem(input.prompt) ?? scheduleProblem(input.schedule) ?? optionsProblem(input)
  );
}

/** Why a change to a routine is refused, or null; only the fields that are given are checked. */
export function updateChannelRoutineProblem(input: unknown): string | null {
  if (!isDynamicRecord(input) || !isString(input.routineId) || input.routineId.length === 0) return "Choose a routine.";
  if (input.name !== undefined) {
    const problem = nameProblem(input.name);
    if (problem) return problem;
  }
  if (input.prompt !== undefined) {
    const problem = promptProblem(input.prompt);
    if (problem) return problem;
  }
  if (input.schedule !== undefined) {
    const problem = scheduleProblem(input.schedule);
    if (problem) return problem;
  }
  return optionsProblem(input);
}

// -- guards and parsers ------------------------------------------------------------------------------------------------------------

export function isChannelRoutine(value: unknown): value is ChannelRoutine {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.channelId) &&
    isString(value.name) &&
    isString(value.prompt) &&
    isRoutineSchedule(value.schedule) &&
    isString(value.timezone) &&
    isBoolean(value.paused) &&
    (value.nextRunAt === null || isString(value.nextRunAt)) &&
    (value.lastRunAt === null || isString(value.lastRunAt)) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    (value.webhookEnabled === undefined || isBoolean(value.webhookEnabled))
  );
}

export function isChannelRoutineWebhook(value: unknown): value is ChannelRoutineWebhook {
  return (
    isDynamicRecord(value) &&
    isChannelRoutine(value.routine) &&
    isString(value.url) &&
    isString(value.secret) &&
    value.secret.startsWith("whsec_")
  );
}

export function isChannelRoutineRun(value: unknown): value is ChannelRoutineRun {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.routineId) &&
    isString(value.at) &&
    (value.cause === "schedule" || value.cause === "manual" || value.cause === "webhook") &&
    isOneOf(CHANNEL_ROUTINE_RUN_OUTCOMES, value.outcome) &&
    (value.reason === null || isString(value.reason)) &&
    (value.messageId === null || isString(value.messageId)) &&
    (value.taskId === null || isString(value.taskId)) &&
    (value.taskState === null || isChannelTaskState(value.taskState))
  );
}

export function isChannelRoutineList(value: unknown): value is ChannelRoutine[] {
  return Array.isArray(value) && value.every(isChannelRoutine);
}

export function isChannelRoutineRunList(value: unknown): value is ChannelRoutineRun[] {
  return Array.isArray(value) && value.every(isChannelRoutineRun);
}

export function isChannelRoutinesChanged(
  value: unknown,
): value is ChannelRoutinesChanged & { type: "channel-routines-changed" } {
  return (
    isDynamicRecord(value) &&
    value.type === "channel-routines-changed" &&
    isString(value.channelId) &&
    isChannelRoutineList(value.routines)
  );
}

export function parseChannelRoutineIdInput(input: unknown): ChannelRoutineIdInput {
  if (!isDynamicRecord(input) || !isString(input.routineId) || input.routineId.length === 0) {
    throw new Error("Choose a routine.");
  }
  return { routineId: input.routineId };
}

export function parseListChannelRoutinesInput(input: unknown): ListChannelRoutinesInput {
  if (input === undefined || input === null) return {};
  if (!isDynamicRecord(input)) throw new Error("The query is a set of fields.");
  if (input.channelId === undefined) return {};
  if (!isString(input.channelId) || input.channelId.length === 0) throw new Error("Choose a project.");
  return { channelId: input.channelId };
}

/** The shape of a create request (the rules that need the channel are `channelRoutineProblem`). */
export function parseCreateChannelRoutineInput(input: unknown): CreateChannelRoutineInput {
  if (!isDynamicRecord(input) || !isString(input.channelId) || input.channelId.length === 0) {
    throw new Error("Choose a project.");
  }
  const problem =
    nameProblem(input.name) ?? promptProblem(input.prompt) ?? scheduleProblem(input.schedule) ?? optionsProblem(input);
  if (problem) throw new Error(problem);
  if (!isRoutineSchedule(input.schedule)) throw new Error("Give the schedule.");
  return {
    channelId: input.channelId,
    name: String(input.name).trim(),
    prompt: String(input.prompt).trim(),
    schedule: input.schedule,
    ...(isString(input.timezone) ? { timezone: input.timezone } : {}),
    ...(isBoolean(input.paused) ? { paused: input.paused } : {}),
  };
}

export function parseUpdateChannelRoutineInput(input: unknown): UpdateChannelRoutineInput {
  const problem = updateChannelRoutineProblem(input);
  if (problem) throw new Error(problem);
  if (!isDynamicRecord(input)) throw new Error("Choose a routine.");
  const patch: UpdateChannelRoutineInput = { routineId: String(input.routineId) };
  if (isString(input.name)) patch.name = input.name.trim();
  if (isString(input.prompt)) patch.prompt = input.prompt.trim();
  if (isRoutineSchedule(input.schedule)) patch.schedule = input.schedule;
  if (isString(input.timezone)) patch.timezone = input.timezone;
  if (isBoolean(input.paused)) patch.paused = input.paused;
  return patch;
}
