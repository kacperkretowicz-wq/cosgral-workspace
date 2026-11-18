import { describe, expect, it } from "vitest";
import {
  CHANNEL_ROUTINE_LIMITS,
  channelRoutineChannelProblem,
  channelRoutineMessage,
  channelRoutineProblem,
  isChannelRoutine,
  isChannelRoutineRun,
  isChannelRoutinesChanged,
  parseChannelRoutineIdInput,
  parseCreateChannelRoutineInput,
  parseListChannelRoutinesInput,
  parseUpdateChannelRoutineInput,
  updateChannelRoutineProblem,
} from "./ipc-channel-routines";

const open = { archived: false, leadBotId: "chief" };
const input = {
  channelId: "c-1",
  name: "Weekly review",
  prompt: "Summarise the week.",
  schedule: { type: "daily", time: "09:30", weekdays: [1] },
};

describe("rules of a routine of a channel (W12 BE-Q)", () => {
  it("accepts a normal routine and says nothing", () => {
    expect(channelRoutineProblem(input, open, 0)).toBeNull();
    expect(
      channelRoutineProblem(
        { ...input, schedule: { type: "interval", everyMinutes: 30 }, timezone: "Europe/Warsaw", paused: true },
        open,
        3,
      ),
    ).toBeNull();
    expect(
      channelRoutineProblem({ ...input, schedule: { type: "cron", expression: "0 9 * * 1" } }, open, 0),
    ).toBeNull();
  });

  it("refuses a channel that is gone, archived, has no lead, or has too many routines", () => {
    expect(channelRoutineProblem(input, null, 0)).toBe("This channel no longer exists.");
    expect(channelRoutineProblem(input, { archived: true, leadBotId: "chief" }, 0)).toBe("This channel is archived.");
    expect(channelRoutineProblem(input, { archived: false, leadBotId: null }, 0)).toContain("no lead");
    expect(channelRoutineProblem(input, open, CHANNEL_ROUTINE_LIMITS.perChannel)).toContain("at most 16 routines");
    expect(channelRoutineProblem({ name: "x" }, open, 0)).toBe("Choose a channel.");
  });

  it("refuses a missing or too long name and instruction", () => {
    expect(channelRoutineProblem({ ...input, name: "  " }, open, 0)).toBe("Give the routine a name.");
    expect(channelRoutineProblem({ ...input, name: "n".repeat(CHANNEL_ROUTINE_LIMITS.name + 1) }, open, 0)).toContain(
      "name has at most",
    );
    expect(channelRoutineProblem({ ...input, prompt: "" }, open, 0)).toContain("what the lead should do");
    expect(
      channelRoutineProblem({ ...input, prompt: "p".repeat(CHANNEL_ROUTINE_LIMITS.prompt + 1) }, open, 0),
    ).toContain("instruction has at most");
  });

  it("refuses a schedule the routines of an agent would refuse too", () => {
    expect(channelRoutineProblem({ ...input, schedule: undefined }, open, 0)).toBe("Give the schedule.");
    expect(channelRoutineProblem({ ...input, schedule: { type: "interval", everyMinutes: 0 } }, open, 0)).toContain(
      "interval is from",
    );
    expect(channelRoutineProblem({ ...input, schedule: { type: "interval", everyMinutes: 1.5 } }, open, 0)).toContain(
      "whole number",
    );
    expect(channelRoutineProblem({ ...input, schedule: { type: "daily", time: "25:00" } }, open, 0)).toContain("HH:MM");
    expect(
      channelRoutineProblem({ ...input, schedule: { type: "daily", time: "09:00", weekdays: [7] } }, open, 0),
    ).toContain("Weekdays");
    expect(channelRoutineProblem({ ...input, schedule: { type: "cron", expression: "* * *" } }, open, 0)).toContain(
      "five fields",
    );
    expect(channelRoutineProblem({ ...input, schedule: { type: "weekly" } }, open, 0)).toContain(
      "interval, a daily time or a cron",
    );
    expect(channelRoutineProblem({ ...input, timezone: "" }, open, 0)).toContain("time zone");
  });

  it("writes the message of a run with the name first", () => {
    expect(channelRoutineMessage(" Weekly review ", " Summarise the week. ")).toBe(
      "Scheduled: Weekly review\n\nSummarise the week.",
    );
  });
});

const routine = {
  id: "r-1",
  channelId: "c-1",
  name: "Weekly review",
  prompt: "Summarise the week.",
  schedule: { type: "interval", everyMinutes: 30 },
  timezone: "Europe/Warsaw",
  paused: false,
  nextRunAt: "2026-11-18T10:30:00.000Z",
  lastRunAt: null,
  createdAt: "2026-11-18T10:00:00.000Z",
  updatedAt: "2026-11-18T10:00:00.000Z",
};
const run = {
  id: "run-1",
  routineId: "r-1",
  at: "2026-11-18T10:30:00.000Z",
  cause: "schedule",
  outcome: "started",
  reason: null,
  messageId: "m-1",
  taskId: "t-1",
  taskState: "running",
};

describe("routines of a channel: shapes and parsers (W12 BE-R)", () => {
  it("tells the problem of a channel on its own", () => {
    expect(channelRoutineChannelProblem(open)).toBeNull();
    expect(channelRoutineChannelProblem(null)).toBe("This channel no longer exists.");
    expect(channelRoutineChannelProblem({ archived: true, leadBotId: "chief" })).toBe("This channel is archived.");
    expect(channelRoutineChannelProblem({ archived: false, leadBotId: null })).toContain("no lead");
  });

  it("checks a change field by field and only the fields that are given", () => {
    expect(updateChannelRoutineProblem({ routineId: "r-1" })).toBeNull();
    expect(updateChannelRoutineProblem({ routineId: "r-1", paused: true, name: "New" })).toBeNull();
    expect(updateChannelRoutineProblem({ routineId: "r-1", name: " " })).toBe("Give the routine a name.");
    expect(updateChannelRoutineProblem({ routineId: "r-1", schedule: { type: "daily", time: "99:00" } })).toContain("HH:MM");
    expect(updateChannelRoutineProblem({ routineId: "r-1", paused: "yes" })).toBe("Paused is on or off.");
    expect(updateChannelRoutineProblem({ name: "x" })).toBe("Choose a routine.");
  });

  it("reads a request: trims the text, keeps only what is valid, and refuses what the rules refuse", () => {
    expect(parseCreateChannelRoutineInput({ ...input, name: "  Weekly review ", timezone: "Europe/Warsaw", paused: true })).toEqual({
      channelId: "c-1",
      name: "Weekly review",
      prompt: "Summarise the week.",
      schedule: { type: "daily", time: "09:30", weekdays: [1] },
      timezone: "Europe/Warsaw",
      paused: true,
    });
    expect(() => parseCreateChannelRoutineInput({ ...input, channelId: "" })).toThrow("Choose a channel.");
    expect(() => parseCreateChannelRoutineInput({ ...input, prompt: "" })).toThrow("what the lead should do");
    expect(parseUpdateChannelRoutineInput({ routineId: "r-1", name: " A ", paused: false })).toEqual({
      routineId: "r-1",
      name: "A",
      paused: false,
    });
    expect(() => parseUpdateChannelRoutineInput({ routineId: "r-1", name: "" })).toThrow("name");
    expect(parseChannelRoutineIdInput({ routineId: "r-1" })).toEqual({ routineId: "r-1" });
    expect(() => parseChannelRoutineIdInput({})).toThrow("Choose a routine.");
    expect(parseListChannelRoutinesInput(undefined)).toEqual({});
    expect(parseListChannelRoutinesInput({ channelId: "c-1" })).toEqual({ channelId: "c-1" });
    expect(() => parseListChannelRoutinesInput({ channelId: 5 })).toThrow("Choose a channel.");
  });

  it("checks what the program answers and what it announces", () => {
    expect(isChannelRoutine(routine)).toBe(true);
    expect(isChannelRoutine({ ...routine, nextRunAt: 5 })).toBe(false);
    expect(isChannelRoutine({ ...routine, schedule: { type: "weekly" } })).toBe(false);
    expect(isChannelRoutineRun(run)).toBe(true);
    expect(isChannelRoutineRun({ ...run, outcome: "failed" })).toBe(false);
    expect(isChannelRoutineRun({ ...run, taskState: "sleeping" })).toBe(false);
    expect(isChannelRoutineRun({ ...run, cause: "webhook" })).toBe(false);
    expect(isChannelRoutinesChanged({ type: "channel-routines-changed", channelId: "c-1", routines: [routine] })).toBe(true);
    expect(isChannelRoutinesChanged({ type: "channel-routines-changed", channelId: "c-1", routines: [{ id: 1 }] })).toBe(false);
    expect(isChannelRoutinesChanged({ type: "threads-changed", channelId: "c-1", routines: [] })).toBe(false);
  });
});
