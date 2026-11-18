// COSGRAL W12 (BE-Q): the rules of a routine of a CHANNEL (owner question 2), written down before the engine so the engine, the mock and the
// screen can agree on them. A channel routine starts work for the whole team at a fixed time: on each run the program sends the routine's
// prompt to the channel as a message of the person ("Scheduled: <name>") and the channel's lead takes it like any other request (a task
// with an owner, a state and a result). It uses the schedule of the routines of an agent (`RoutineSchedule`: every N minutes, daily,
// cron; the person's time zone), so the starts are worked out by the same code (`nextRunAfter`) and the two kinds never disagree.
//
// Not done here, waits for the owner's yes: the store, the run (the message to the channel and the follow-up of the task as the
// result of the run) and the screen. Nothing here reads or changes anything.

import { ROUTINE_LIMITS, type RoutineSchedule } from "./ipc-routines";
import { CHANNEL_LIMITS, type WorkspaceChannel } from "./ipc-workspace-channels";
import { isBoolean, isDynamicRecord, isNumber, isString } from "./runtime-values";

export const CHANNEL_ROUTINE_LIMITS = {
  /** Channel routines on this computer (together with the routines of agents they stay under ROUTINE_LIMITS.routines). */
  perChannel: 16,
  name: ROUTINE_LIMITS.name,
  prompt: Math.min(ROUTINE_LIMITS.prompt, CHANNEL_LIMITS.message),
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
    if (!isString(value.time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))
      return "The time is written HH:MM, for example 09:30.";
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

/**
 * Why a channel routine cannot be made, in plain words, or null. `channel` is the channel the input names (null = it does not exist),
 * `routinesInChannel` how many routines it has now.
 */
export function channelRoutineProblem(
  input: unknown,
  channel: Pick<WorkspaceChannel, "archived" | "leadBotId"> | null,
  routinesInChannel: number,
): string | null {
  if (!isDynamicRecord(input) || !isString(input.channelId)) return "Choose a channel.";
  if (!channel) return "This channel no longer exists.";
  if (channel.archived) return "This channel is archived.";
  if (!channel.leadBotId) return "This channel has no lead to take the work. Make one of its members the lead first.";
  if (routinesInChannel >= CHANNEL_ROUTINE_LIMITS.perChannel) {
    return `A channel has at most ${CHANNEL_ROUTINE_LIMITS.perChannel} routines.`;
  }
  const name = isString(input.name) ? input.name.trim() : "";
  if (name.length === 0) return "Give the routine a name.";
  if (name.length > CHANNEL_ROUTINE_LIMITS.name)
    return `The name has at most ${CHANNEL_ROUTINE_LIMITS.name} characters.`;
  const prompt = isString(input.prompt) ? input.prompt.trim() : "";
  if (prompt.length === 0) return "Say what the lead should do on each run.";
  if (prompt.length > CHANNEL_ROUTINE_LIMITS.prompt) {
    return `The instruction has at most ${CHANNEL_ROUTINE_LIMITS.prompt} characters.`;
  }
  const schedule = scheduleProblem(input.schedule);
  if (schedule) return schedule;
  if (
    input.timezone !== undefined &&
    !(isString(input.timezone) && input.timezone.length > 0 && input.timezone.length <= 64)
  ) {
    return "The time zone is a name like Europe/Warsaw.";
  }
  if (input.paused !== undefined && !isBoolean(input.paused)) return "Paused is on or off.";
  return null;
}
