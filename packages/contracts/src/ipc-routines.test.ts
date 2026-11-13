import { describe, expect, it } from "vitest";
import {
  IPC_CHANNELS,
  isAgentEvent,
  isRoutine,
  isRoutineRun,
  isRoutineSchedule,
  isRoutineWithSecret,
  ROUTINE_LIMITS,
  type Routine,
  type RoutineRun,
} from "./ipc";

const routine: Routine = {
  id: "r1",
  botId: "chief",
  name: "Morning summary",
  prompt: "Summarize the inbox.",
  trigger: "schedule",
  schedule: { type: "daily", time: "08:30", weekdays: [1, 2, 3, 4, 5] },
  timezone: "Europe/Warsaw",
  paused: false,
  nextRunAt: "2026-11-13T07:30:00.000Z",
  webhook: null,
  createdBy: "person",
  createdAt: "2026-11-13T03:00:00.000Z",
  updatedAt: "2026-11-13T03:00:00.000Z",
};

const run: RoutineRun = {
  id: "run1",
  routineId: "r1",
  botId: "chief",
  cause: "schedule",
  status: "skipped",
  reason: "The program was off at 08:30.",
  startedAt: "2026-11-13T07:30:00.000Z",
  finishedAt: "2026-11-13T07:30:00.000Z",
  deliveryId: null,
};

describe("routines IPC contract", () => {
  it("keeps the limits of 0.68 and the lead's decision", () => {
    expect(ROUTINE_LIMITS).toMatchObject({ routines: 64, webhookBody: 65_536, dedupeDays: 7 });
  });

  it("validates the three schedule kinds", () => {
    expect(isRoutineSchedule({ type: "interval", everyMinutes: 5 })).toBe(true);
    expect(isRoutineSchedule({ type: "daily", time: "08:30" })).toBe(true);
    expect(isRoutineSchedule({ type: "cron", expression: "*/15 9-17 * * 1-5" })).toBe(true);
    expect(isRoutineSchedule({ type: "daily", time: 830 })).toBe(false);
    expect(isRoutineSchedule({ type: "weekly" })).toBe(false);
  });

  it("validates routines, runs and the once-shown secret", () => {
    expect(isRoutine(routine)).toBe(true);
    expect(
      isRoutine({
        ...routine,
        trigger: "webhook",
        schedule: null,
        webhook: { url: "http://127.0.0.1:1/x", eventTypes: [] },
      }),
    ).toBe(true);
    expect(isRoutine({ ...routine, createdBy: "routine" })).toBe(false);
    expect(isRoutineRun(run)).toBe(true);
    expect(isRoutineRun({ ...run, status: "queued" })).toBe(false);
    expect(isRoutineWithSecret({ routine, secret: "whsec_abc" })).toBe(true);
    expect(isRoutineWithSecret({ routine, secret: null })).toBe(true);
  });

  it("accepts both events and has one IPC channel per operation", () => {
    expect(isAgentEvent({ type: "routines-changed", routines: [routine] })).toBe(true);
    expect(isAgentEvent({ type: "routine-run", run })).toBe(true);
    expect(isAgentEvent({ type: "routine-run", run: { id: "x" } })).toBe(false);
    expect(IPC_CHANNELS.routinesRegenerateSecret).toBe("routines:regenerate-secret");
    expect(IPC_CHANNELS.routinesRunNow).toBe("routines:run-now");
  });
});
