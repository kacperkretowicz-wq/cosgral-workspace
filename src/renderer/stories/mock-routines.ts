// COSGRAL W12-KK: routines (schedule and webhook) for Storybook and the preview. DEMO data only: nothing is scheduled, no agent runs and no
// webhook listens. The same rules as the program (`routine-manager.ts`): limits and sentences of the checks, a webhook routine gets a signing
// secret once (here the fake `whsec_DEMO_ONLY`, never usable), a paused routine has no next start, "run now" refuses a paused or already
// running routine. The next start of a daily or interval schedule is worked out in this computer's own time zone; a cron expression is only
// understood in the plain "minute hour * * *" form (anything else says "in an hour"): the program reads every cron form.

import {
  type AgentEvent,
  type CreateRoutineInput,
  ROUTINE_LIMITS,
  type Routine,
  type RoutineRun,
  type RoutineSchedule,
  type RoutinesDesktopApi,
  type UpdateRoutineInput,
} from "@openbot/contracts/ipc";

export interface MockRoutinesOptions {
  botExists: (botId: string) => boolean;
  /** Two demo routines (a daily review and a webhook) with some history, for this agent; null = an empty page. */
  seed?: { botId: string } | null;
  now?: () => Date;
}

export interface MockRoutines {
  api: Required<RoutinesDesktopApi>;
  simulate: {
    /** The running routine run finishes (done by default; "failed" needs a reason). */
    finishRun: (runId: string, outcome?: { status: "done" } | { status: "failed"; reason: string }) => RoutineRun;
    /** A signed webhook arrived for this routine (an unknown event type is "ignored"). */
    webhook: (routineId: string, eventType?: string) => RoutineRun | null;
    clear: () => void;
  };
}

const MINUTE = 60_000;

function parseTime(time: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const hour = match ? Number(match[1]) : Number.NaN;
  const minute = match ? Number(match[2]) : Number.NaN;
  if (!match || hour > 23 || minute > 59) throw new Error('A time is "HH:MM" from 00:00 to 23:59.');
  return { hour, minute };
}

function checkSchedule(schedule: RoutineSchedule): void {
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
    if ((schedule.weekdays ?? []).some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error("weekdays are numbers from 0 (Sunday) to 6 (Saturday).");
    }
    return;
  }
  if (schedule.expression.trim().split(/\s+/).length !== 5) {
    throw new Error("A cron expression has five fields: minute hour day-of-month month day-of-week.");
  }
}

/** The first start after `after` (see the note at the top about cron). */
function nextRun(schedule: RoutineSchedule, after: Date): Date {
  if (schedule.type === "interval") return new Date(after.getTime() + schedule.everyMinutes * MINUTE);
  let time: { hour: number; minute: number } | null = null;
  let weekdays: number[] = [];
  if (schedule.type === "daily") {
    time = parseTime(schedule.time);
    weekdays = schedule.weekdays ?? [];
  } else {
    const [minute, hour, day, month, week] = schedule.expression.trim().split(/\s+/);
    if (day === "*" && month === "*" && week === "*" && /^\d+$/.test(minute ?? "") && /^\d+$/.test(hour ?? "")) {
      time = { hour: Number(hour), minute: Number(minute) };
    }
  }
  if (!time) return new Date(after.getTime() + 60 * MINUTE);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(after);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(time.hour, time.minute, 0, 0);
    if (candidate.getTime() > after.getTime() && (weekdays.length === 0 || weekdays.includes(candidate.getDay()))) {
      return candidate;
    }
  }
  return new Date(after.getTime() + 24 * 60 * MINUTE);
}

function checkedText(value: string, field: string, limit: number): string {
  const text = value.trim();
  if (!text || text.length > limit) throw new Error(`The routine ${field} has 1–${limit} characters.`);
  return text;
}

function checkedEventTypes(values: string[]): string[] {
  const list = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (list.length > ROUTINE_LIMITS.eventTypes) throw new Error(`At most ${ROUTINE_LIMITS.eventTypes} event types.`);
  return list;
}

export function createMockRoutines(emit: (event: AgentEvent) => void, options: MockRoutinesOptions): MockRoutines {
  const now = options.now ?? (() => new Date());
  let counter = 0;
  let routines: Routine[] = [];
  const runs = new Map<string, RoutineRun[]>();

  const nextId = (): string => {
    counter += 1;
    return String(counter);
  };
  const emitRoutines = (): void => emit({ type: "routines-changed", routines: structuredClone(routines) });
  const find = (routineId: string): Routine => {
    const routine = routines.find((item) => item.id === routineId);
    if (!routine) throw new Error("You have no routine with this id.");
    return routine;
  };
  const withNext = (routine: Routine): Routine => ({
    ...routine,
    nextRunAt:
      routine.trigger === "schedule" && !routine.paused && routine.schedule
        ? nextRun(routine.schedule, now()).toISOString()
        : null,
  });
  const replace = (routine: Routine): Routine => {
    routines = routines.map((item) => (item.id === routine.id ? routine : item));
    emitRoutines();
    return structuredClone(routine);
  };
  const addRun = (
    routine: Routine,
    cause: RoutineRun["cause"],
    status: RoutineRun["status"],
    reason: string | null,
  ): RoutineRun => {
    const at = now().toISOString();
    const run: RoutineRun = {
      id: `rr-demo-${nextId()}`,
      routineId: routine.id,
      botId: routine.botId,
      cause,
      status,
      reason,
      startedAt: at,
      finishedAt: status === "running" ? null : at,
      deliveryId: cause === "webhook" ? `msg_demo_${counter}` : null,
    };
    runs.set(routine.id, [run, ...(runs.get(routine.id) ?? [])].slice(0, ROUTINE_LIMITS.runsKept));
    emit({ type: "routine-run", run: structuredClone(run) });
    return run;
  };
  const running = (routineId: string): RoutineRun | undefined =>
    (runs.get(routineId) ?? []).find((run) => run.status === "running");
  const secret = (routine: Routine, replacement = false): string | null =>
    routine.trigger === "webhook" ? (replacement ? "whsec_DEMO_REPLACEMENT" : "whsec_DEMO_ONLY") : null;

  const api: Required<RoutinesDesktopApi> = {
    list: async (botId) =>
      structuredClone(botId === undefined ? routines : routines.filter((item) => item.botId === botId)),
    create: async (input: CreateRoutineInput) => {
      if (routines.length >= ROUTINE_LIMITS.routines)
        throw new Error(`At most ${ROUTINE_LIMITS.routines} routines on this computer.`);
      if (!options.botExists(input.botId)) throw new Error("This agent no longer exists.");
      const name = checkedText(input.name, "name", ROUTINE_LIMITS.name);
      const prompt = checkedText(input.prompt, "prompt", ROUTINE_LIMITS.prompt);
      const at = now().toISOString();
      let schedule: RoutineSchedule | null = null;
      if (input.trigger === "schedule") {
        if (!input.schedule) throw new Error("A scheduled routine needs a schedule.");
        checkSchedule(input.schedule);
        schedule = structuredClone(input.schedule);
      }
      const id = `rt-demo-${nextId()}`;
      const routine = withNext({
        id,
        botId: input.botId,
        name,
        prompt,
        trigger: input.trigger,
        schedule,
        timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        paused: input.paused ?? false,
        nextRunAt: null,
        webhook:
          input.trigger === "webhook"
            ? { url: `http://127.0.0.1:47900/webhooks/${id}`, eventTypes: checkedEventTypes(input.eventTypes ?? []) }
            : null,
        createdBy: "person",
        createdAt: at,
        updatedAt: at,
      });
      routines = [...routines, routine];
      emitRoutines();
      return { routine: structuredClone(routine), secret: secret(routine) };
    },
    update: async (input: UpdateRoutineInput) => {
      const current = find(input.routineId);
      if (input.schedule && current.trigger !== "schedule") throw new Error("A webhook routine has no schedule.");
      if (input.schedule) checkSchedule(input.schedule);
      const next = withNext({
        ...current,
        name: input.name === undefined ? current.name : checkedText(input.name, "name", ROUTINE_LIMITS.name),
        prompt:
          input.prompt === undefined ? current.prompt : checkedText(input.prompt, "prompt", ROUTINE_LIMITS.prompt),
        schedule: input.schedule ? structuredClone(input.schedule) : current.schedule,
        timezone: input.timezone ?? current.timezone,
        paused: input.paused ?? current.paused,
        webhook:
          current.webhook && input.eventTypes !== undefined
            ? { ...current.webhook, eventTypes: checkedEventTypes(input.eventTypes) }
            : current.webhook,
        updatedAt: now().toISOString(),
      });
      return replace(next);
    },
    delete: async ({ routineId }) => {
      routines = routines.filter((item) => item.id !== routineId);
      runs.delete(routineId);
      emitRoutines();
    },
    runNow: async ({ routineId }) => {
      const routine = find(routineId);
      if (routine.paused) throw new Error("The routine is paused; resume it first.");
      if (running(routine.id)) throw new Error("The routine is already running.");
      return structuredClone(addRun(routine, "manual", "running", null));
    },
    listRuns: async ({ routineId }) => {
      find(routineId);
      return structuredClone(runs.get(routineId) ?? []);
    },
    regenerateSecret: async ({ routineId }) => {
      const routine = find(routineId);
      if (routine.trigger !== "webhook") throw new Error("Only a webhook routine has a signing secret.");
      return { routine: structuredClone(routine), secret: secret(routine, true) };
    },
  };

  const seed = (botId: string): void => {
    const at = now();
    const hours = (count: number): string => new Date(at.getTime() - count * 60 * MINUTE).toISOString();
    const daily: Routine = withNext({
      id: "routine-demo",
      botId,
      name: "Weekly review",
      prompt: "Summarise progress",
      trigger: "schedule",
      schedule: { type: "daily", time: "09:00" },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      paused: false,
      nextRunAt: null,
      webhook: null,
      createdBy: "person",
      createdAt: hours(72),
      updatedAt: hours(72),
    });
    const hook: Routine = {
      id: "rt-demo-pipeline",
      botId,
      name: "Pipeline report",
      prompt: "Summarise the event and post the numbers that changed.",
      trigger: "webhook",
      schedule: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      paused: false,
      nextRunAt: null,
      webhook: { url: "http://127.0.0.1:47900/webhooks/rt-demo-pipeline", eventTypes: ["pipeline.finished"] },
      createdBy: "person",
      createdAt: hours(48),
      updatedAt: hours(48),
    };
    routines = [daily, hook];
    runs.set(daily.id, [
      {
        id: "rr-demo-s2",
        routineId: daily.id,
        botId,
        cause: "schedule",
        status: "done",
        reason: null,
        startedAt: hours(24),
        finishedAt: hours(24),
        deliveryId: null,
      },
      {
        id: "rr-demo-s1",
        routineId: daily.id,
        botId,
        cause: "schedule",
        status: "skipped",
        reason: "The program was off at the scheduled time.",
        startedAt: hours(48),
        finishedAt: hours(48),
        deliveryId: null,
      },
    ]);
    runs.set(hook.id, [
      {
        id: "rr-demo-w1",
        routineId: hook.id,
        botId,
        cause: "webhook",
        status: "done",
        reason: null,
        startedAt: hours(5),
        finishedAt: hours(5),
        deliveryId: "msg_demo_1",
      },
    ]);
  };
  if (options.seed) seed(options.seed.botId);

  return {
    api,
    simulate: {
      finishRun: (runId, outcome = { status: "done" }) => {
        for (const [routineId, list] of runs) {
          const found = list.find((run) => run.id === runId);
          if (!found) continue;
          if (found.status !== "running") throw new Error("This run has already ended.");
          const finished: RoutineRun = {
            ...found,
            status: outcome.status,
            reason: outcome.status === "failed" ? outcome.reason : null,
            finishedAt: now().toISOString(),
          };
          runs.set(
            routineId,
            list.map((run) => (run.id === runId ? finished : run)),
          );
          emit({ type: "routine-run", run: structuredClone(finished) });
          return structuredClone(finished);
        }
        throw new Error("This run does not exist.");
      },
      webhook: (routineId, eventType = "demo.event") => {
        const routine = find(routineId);
        if (routine.trigger !== "webhook") throw new Error("Only a webhook routine gets webhooks.");
        if (routine.paused) return structuredClone(addRun(routine, "webhook", "ignored", "The routine is paused."));
        const types = routine.webhook?.eventTypes ?? [];
        if (types.length > 0 && !types.includes(eventType)) {
          return structuredClone(
            addRun(routine, "webhook", "ignored", `The event type "${eventType}" is not one of the routine's types.`),
          );
        }
        if (running(routine.id))
          return structuredClone(addRun(routine, "webhook", "skipped", "The routine is already running."));
        return structuredClone(addRun(routine, "webhook", "running", null));
      },
      clear: () => {
        routines = [];
        runs.clear();
        emitRoutines();
      },
    },
  };
}
