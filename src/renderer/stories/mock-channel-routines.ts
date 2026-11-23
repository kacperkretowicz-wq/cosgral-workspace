// COSGRAL W12 (BE-R): the routines of a channel for Storybook and the preview (`window.openbot.channelRoutines`). Demo data only; the same
// rules as the program (`channelRoutineProblem`, `channelRoutineMessage`, one run at a time, history newest first, 100 entries). The planned
// starts are a demo rule (an interval counts from now, other schedules fall at the same time tomorrow): the program works them out with the
// real schedule code. `tick(minutes)` plays time passing: runs are started or skipped like the program does.

import {
  type AgentEvent,
  CHANNEL_ROUTINE_LIMITS,
  type ChannelRoutine,
  type ChannelRoutineRun,
  type ChannelRoutinesDesktopApi,
  type ChannelTaskState,
  channelRoutineChannelProblem,
  channelRoutineMessage,
  channelRoutineProblem,
  parseChannelRoutineIdInput,
  parseCreateChannelRoutineInput,
  parseListChannelRoutinesInput,
  parseUpdateChannelRoutineInput,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";

export interface MockChannelRoutines extends Required<ChannelRoutinesDesktopApi> {
  /** Time passes: planned starts that came are started (or skipped with the reason). */
  tick: (minutes: number) => void;
  /** The task of a run changes state (a run of a routine ends). */
  setTaskState: (taskId: string, state: ChannelTaskState) => void;
  /** The messages the routines sent to channels, in order. */
  sent: () => Array<{ channelId: string; text: string; taskId: string }>;
}

const OPEN: readonly ChannelTaskState[] = ["queued", "running", "waiting"];

export function createMockChannelRoutines(options: {
  channels: () => WorkspaceChannel[];
  emit?: (event: AgentEvent) => void;
}): MockChannelRoutines {
  let clock = Date.parse("2026-11-18T10:00:00.000Z");
  let counter = 0;
  const routines: ChannelRoutine[] = [];
  const runs = new Map<string, ChannelRoutineRun[]>();
  const states = new Map<string, ChannelTaskState>();
  const sent: Array<{ channelId: string; text: string; taskId: string }> = [];
  const iso = (time: number) => new Date(time).toISOString();
  const channelOf = (channelId: string) => options.channels().find((channel) => channel.id === channelId) ?? null;
  const announce = (channelId: string) =>
    options.emit?.({
      type: "channel-routines-changed",
      channelId,
      routines: structuredClone(routines.filter((routine) => routine.channelId === channelId)),
    });
  const next = (routine: Pick<ChannelRoutine, "schedule">): string =>
    iso(clock + (routine.schedule.type === "interval" ? routine.schedule.everyMinutes * 60_000 : 24 * 3_600_000));
  const find = (routineId: string): ChannelRoutine => {
    const found = routines.find((routine) => routine.id === routineId);
    if (!found) throw new Error("This routine no longer exists.");
    return found;
  };
  const withState = (run: ChannelRoutineRun): ChannelRoutineRun => ({
    ...run,
    taskState: run.taskId ? (states.get(run.taskId) ?? null) : null,
  });
  const stillGoing = (routineId: string): boolean => {
    const last = (runs.get(routineId) ?? []).find((run) => run.outcome === "started" && run.taskId !== null);
    const state = last?.taskId ? states.get(last.taskId) : undefined;
    return state !== undefined && OPEN.includes(state);
  };
  const fire = (routine: ChannelRoutine, cause: "schedule" | "manual"): ChannelRoutineRun => {
    const reason =
      channelRoutineChannelProblem(channelOf(routine.channelId)) ??
      (stillGoing(routine.id) ? "The previous run is still going." : null);
    counter += 1;
    const taskId = reason ? null : `mock-routine-task-${counter}`;
    if (taskId) {
      states.set(taskId, "queued");
      sent.push({ channelId: routine.channelId, text: channelRoutineMessage(routine.name, routine.prompt), taskId });
    }
    const run: ChannelRoutineRun = {
      id: `mock-routine-run-${counter}`,
      routineId: routine.id,
      at: iso(clock),
      cause,
      outcome: reason ? "skipped" : "started",
      reason,
      messageId: taskId ? `mock-routine-message-${counter}` : null,
      taskId,
      taskState: null,
    };
    runs.set(routine.id, [run, ...(runs.get(routine.id) ?? [])].slice(0, CHANNEL_ROUTINE_LIMITS.runsKept));
    routine.lastRunAt = run.at;
    if (cause === "schedule") routine.nextRunAt = routine.paused ? null : next(routine);
    announce(routine.channelId);
    return run;
  };

  return {
    list: async (input) => {
      const { channelId } = parseListChannelRoutinesInput(input);
      return structuredClone(routines.filter((routine) => channelId === undefined || routine.channelId === channelId));
    },
    create: async (raw) => {
      const input = parseCreateChannelRoutineInput(raw);
      const problem = channelRoutineProblem(
        input,
        channelOf(input.channelId),
        routines.filter((routine) => routine.channelId === input.channelId).length,
      );
      if (problem) throw new Error(problem);
      counter += 1;
      const routine: ChannelRoutine = {
        id: `mock-routine-${counter}`,
        channelId: input.channelId,
        name: input.name,
        prompt: input.prompt,
        schedule: input.schedule,
        timezone: input.timezone ?? "Europe/Warsaw",
        paused: input.paused ?? false,
        nextRunAt: null,
        lastRunAt: null,
        createdAt: iso(clock),
        updatedAt: iso(clock),
      };
      routine.nextRunAt = routine.paused ? null : next(routine);
      routines.push(routine);
      announce(routine.channelId);
      return structuredClone(routine);
    },
    update: async (raw) => {
      const patch = parseUpdateChannelRoutineInput(raw);
      const routine = find(patch.routineId);
      const planChanged = patch.schedule !== undefined || patch.timezone !== undefined || patch.paused !== undefined;
      Object.assign(routine, {
        name: patch.name ?? routine.name,
        prompt: patch.prompt ?? routine.prompt,
        schedule: patch.schedule ?? routine.schedule,
        timezone: patch.timezone ?? routine.timezone,
        paused: patch.paused ?? routine.paused,
        updatedAt: iso(clock),
      });
      if (planChanged) routine.nextRunAt = routine.paused ? null : next(routine);
      announce(routine.channelId);
      return structuredClone(routine);
    },
    delete: async (raw) => {
      const routine = find(parseChannelRoutineIdInput(raw).routineId);
      routines.splice(routines.indexOf(routine), 1);
      runs.delete(routine.id);
      announce(routine.channelId);
    },
    runNow: async (raw) => {
      const run = fire(find(parseChannelRoutineIdInput(raw).routineId), "manual");
      if (run.outcome === "skipped") throw new Error(run.reason ?? "The routine could not start.");
      return withState(structuredClone(run));
    },
    listRuns: async (raw) => {
      const routine = find(parseChannelRoutineIdInput(raw).routineId);
      return structuredClone((runs.get(routine.id) ?? []).map(withState));
    },
    // Demo secret and address: the program makes a random secret and uses the port of its local receiver.
    enableWebhook: async (raw) => {
      const routine = find(parseChannelRoutineIdInput(raw).routineId);
      counter += 1;
      routine.webhookEnabled = true;
      routine.updatedAt = iso(clock);
      announce(routine.channelId);
      return {
        routine: structuredClone(routine),
        url: `http://127.0.0.1:8787/webhooks/${routine.id}`,
        secret: `whsec_demo${counter}${"A".repeat(40)}`,
      };
    },
    disableWebhook: async (raw) => {
      const routine = find(parseChannelRoutineIdInput(raw).routineId);
      routine.webhookEnabled = false;
      routine.updatedAt = iso(clock);
      announce(routine.channelId);
      return structuredClone(routine);
    },
    tick: (minutes) => {
      clock += minutes * 60_000;
      for (const routine of [...routines]) {
        if (!routine.paused && routine.nextRunAt && Date.parse(routine.nextRunAt) <= clock) fire(routine, "schedule");
      }
    },
    setTaskState: (taskId, state) => {
      states.set(taskId, state);
    },
    sent: () => structuredClone(sent),
  };
}
