// COSGRAL W12 (BE-H): the schedule (contract: ipc-insights.ts): what the routines started and will start in a window of time, and a feed of
// the latest runs. It keeps nothing of its own: the routines and their runs come from the routine store, the planned starts are worked
// out with the same schedule rules the routine manager uses (`nextRunAfter`), so the screen and the real starts never disagree.

import {
  parseScheduleFeedInput,
  parseScheduleViewInput,
  type Routine,
  type RoutineRun,
  SCHEDULE_LIMITS,
  type ScheduleEntry,
  type ScheduleFeedItem,
  type ScheduleView,
} from "@openbot/contracts/ipc";
import { nextRunAfter } from "./routine-schedule";

export interface ScheduleViewOptions {
  routines: () => Routine[];
  runs: (routineId: string) => RoutineRun[];
  agentName: (botId: string) => string | null;
  now?: () => Date;
}

export class ScheduleViewService {
  readonly #options: ScheduleViewOptions;

  constructor(options: ScheduleViewOptions) {
    this.#options = options;
  }

  view(raw: unknown): ScheduleView {
    const input = parseScheduleViewInput(raw);
    const from = Date.parse(input.from);
    const to = Date.parse(input.to);
    const now = (this.#options.now?.() ?? new Date()).getTime();
    const routines = this.#options
      .routines()
      .filter((routine) => input.botId === undefined || routine.botId === input.botId);
    const entries: ScheduleEntry[] = [];
    const webhooks: ScheduleView["webhooks"] = [];
    const paused: ScheduleView["paused"] = [];
    for (const routine of routines) {
      const named = { routineId: routine.id, botId: routine.botId, routineName: routine.name };
      for (const item of this.#options.runs(routine.id)) {
        const at = Date.parse(item.startedAt);
        if (at >= from && at <= to) {
          entries.push({
            kind: "ran",
            ...named,
            at: item.startedAt,
            runId: item.id,
            status: item.status,
            cause: item.cause,
            reason: item.reason,
            finishedAt: item.finishedAt,
          });
        }
      }
      if (routine.trigger === "webhook") webhooks.push(named);
      else if (routine.paused) paused.push(named);
      else
        entries.push(
          ...this.#planned(routine, Math.max(from, now), to).map(
            (at): ScheduleEntry => ({ kind: "planned", ...named, at }),
          ),
        );
    }
    entries.sort((a, b) => a.at.localeCompare(b.at) || a.routineId.localeCompare(b.routineId));
    const truncated = entries.length > SCHEDULE_LIMITS.maxEntries;
    return {
      from: input.from,
      to: input.to,
      entries: entries.slice(0, SCHEDULE_LIMITS.maxEntries),
      truncated,
      webhooks,
      paused,
    };
  }

  feed(raw?: unknown): ScheduleFeedItem[] {
    const input = parseScheduleFeedInput(raw);
    const items: ScheduleFeedItem[] = [];
    for (const routine of this.#options.routines()) {
      if (input.botId !== undefined && routine.botId !== input.botId) continue;
      for (const run of this.#options.runs(routine.id)) {
        if (input.before !== undefined && Date.parse(run.startedAt) >= Date.parse(input.before)) continue;
        items.push({ run, routineName: routine.name, agentName: this.#options.agentName(routine.botId) });
      }
    }
    items.sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt) || b.run.id.localeCompare(a.run.id));
    return items.slice(0, input.limit);
  }

  /** The starts of a scheduled routine after `from` and up to `to` (ISO times), at most one more than the view can show. */
  #planned(routine: Routine, from: number, to: number): string[] {
    if (!routine.schedule) return [];
    const out: string[] = [];
    let next: Date | null = null;
    const known = routine.nextRunAt ? new Date(routine.nextRunAt) : null;
    if (known && known.getTime() > from) next = known;
    else {
      try {
        next = nextRunAfter(routine.schedule, routine.timezone, new Date(from));
      } catch {
        return [];
      }
    }
    while (next && next.getTime() <= to && out.length <= SCHEDULE_LIMITS.maxEntries) {
      out.push(next.toISOString());
      try {
        next = nextRunAfter(routine.schedule, routine.timezone, next);
      } catch {
        break;
      }
    }
    return out;
  }
}
