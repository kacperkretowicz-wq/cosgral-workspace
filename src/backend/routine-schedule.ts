// COSGRAL W2: when a scheduled routine runs next. Pure functions; times are read in an IANA time zone,
// so "every day at 08:30" stays 08:30 local across daylight saving changes.
import { ROUTINE_LIMITS, type RoutineSchedule } from "@openbot/contracts/ipc";

const MINUTE = 60_000;
/** How far ahead a daily or cron schedule is searched before it counts as never running. */
const SEARCH_DAYS = 366;

export interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  /** Classic cron: when both day fields are restricted, a match of either is enough. */
  anyDay: boolean;
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Throws a readable error for an invalid schedule. */
export function checkSchedule(schedule: RoutineSchedule): void {
  if (schedule.type === "interval") {
    const minutes = schedule.everyMinutes;
    if (
      !Number.isInteger(minutes) ||
      minutes < ROUTINE_LIMITS.minIntervalMinutes ||
      minutes > ROUTINE_LIMITS.maxIntervalMinutes
    ) {
      throw new Error(
        `An interval is a whole number of minutes from ${ROUTINE_LIMITS.minIntervalMinutes} to ${ROUTINE_LIMITS.maxIntervalMinutes}.`,
      );
    }
    return;
  }
  if (schedule.type === "daily") {
    parseTime(schedule.time);
    const weekdays = schedule.weekdays ?? [];
    if (weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error("weekdays are numbers from 0 (Sunday) to 6 (Saturday).");
    }
    return;
  }
  parseCron(schedule.expression);
}

/** The first start strictly after `after`, or null when the schedule never matches within a year. */
export function nextRunAfter(schedule: RoutineSchedule, timeZone: string, after: Date): Date | null {
  checkSchedule(schedule);
  const start = Math.floor(after.getTime() / MINUTE) * MINUTE;
  if (schedule.type === "interval") return new Date(start + schedule.everyMinutes * MINUTE);

  const matches = matcher(schedule);
  const parts = partsReader(timeZone);
  const limit = start + SEARCH_DAYS * 24 * 60 * MINUTE;
  let candidate = start + MINUTE;
  while (candidate <= limit) {
    const local = parts(candidate);
    if (!matches.day(local)) {
      // Jump to the next local midnight (the next loop re-checks, so DST shifts are safe).
      candidate += Math.max(1, 24 * 60 - local.hour * 60 - local.minute) * MINUTE;
      continue;
    }
    if (!matches.hours.has(local.hour)) {
      candidate += Math.max(1, 60 - local.minute) * MINUTE;
      continue;
    }
    if (matches.minutes.has(local.minute)) return new Date(candidate);
    candidate += MINUTE;
  }
  return null;
}

export function parseCron(expression: string): CronFields {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("A cron expression has five fields: minute hour day month weekday.");
  const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = ""] = fields;
  const daysOfWeek = new Set([...parseField(dayOfWeek, 0, 7, "weekday")].map((day) => (day === 7 ? 0 : day)));
  return {
    minutes: parseField(minute, 0, 59, "minute"),
    hours: parseField(hour, 0, 23, "hour"),
    daysOfMonth: parseField(dayOfMonth, 1, 31, "day of month"),
    months: parseField(month, 1, 12, "month"),
    daysOfWeek,
    anyDay: dayOfMonth !== "*" && dayOfWeek !== "*",
  };
}

interface LocalParts {
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

function matcher(schedule: Exclude<RoutineSchedule, { type: "interval" }>): {
  minutes: Set<number>;
  hours: Set<number>;
  day: (local: LocalParts) => boolean;
} {
  if (schedule.type === "daily") {
    const { hour, minute } = parseTime(schedule.time);
    const weekdays = new Set(schedule.weekdays ?? []);
    return {
      minutes: new Set([minute]),
      hours: new Set([hour]),
      day: (local) => weekdays.size === 0 || weekdays.has(local.weekday),
    };
  }
  const cron = parseCron(schedule.expression);
  return {
    minutes: cron.minutes,
    hours: cron.hours,
    day: (local) => {
      if (!cron.months.has(local.month)) return false;
      const byMonthDay = cron.daysOfMonth.has(local.day);
      const byWeekday = cron.daysOfWeek.has(local.weekday);
      return cron.anyDay ? byMonthDay || byWeekday : byMonthDay && byWeekday;
    },
  };
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partsReader(timeZone: string): (epochMs: number) => LocalParts {
  if (!isTimeZone(timeZone)) throw new Error(`Unknown time zone ${timeZone}.`);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
  });
  return (epochMs) => {
    const values: Record<string, string> = {};
    for (const part of format.formatToParts(epochMs)) values[part.type] = part.value;
    return {
      month: Number(values.month),
      day: Number(values.day),
      weekday: WEEKDAYS[values.weekday ?? ""] ?? 0,
      hour: Number(values.hour) % 24,
      minute: Number(values.minute),
    };
  };
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error("A daily time is HH:MM, 00:00 to 23:59.");
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function parseField(field: string, min: number, max: number, name: string): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step in the cron ${name} field.`);
    let from = min;
    let to = max;
    if (range !== "*") {
      const [startText, endText] = (range ?? "").split("-");
      from = Number(startText);
      to = endText === undefined ? (stepText === undefined ? from : max) : Number(endText);
    }
    if (![from, to].every((value) => Number.isInteger(value) && value >= min && value <= max) || from > to) {
      throw new Error(`The cron ${name} field allows ${min}-${max}.`);
    }
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return values;
}
