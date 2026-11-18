import { describe, expect, it } from "vitest";
import { CHANNEL_ROUTINE_LIMITS, channelRoutineMessage, channelRoutineProblem } from "./ipc-channel-routines";

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
    expect(channelRoutineProblem({ ...input, schedule: { type: "interval", everyMinutes: 30 }, timezone: "Europe/Warsaw", paused: true }, open, 3)).toBeNull();
    expect(channelRoutineProblem({ ...input, schedule: { type: "cron", expression: "0 9 * * 1" } }, open, 0)).toBeNull();
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
    expect(channelRoutineProblem({ ...input, name: "n".repeat(CHANNEL_ROUTINE_LIMITS.name + 1) }, open, 0)).toContain("name has at most");
    expect(channelRoutineProblem({ ...input, prompt: "" }, open, 0)).toContain("what the lead should do");
    expect(channelRoutineProblem({ ...input, prompt: "p".repeat(CHANNEL_ROUTINE_LIMITS.prompt + 1) }, open, 0)).toContain("instruction has at most");
  });

  it("refuses a schedule the routines of an agent would refuse too", () => {
    expect(channelRoutineProblem({ ...input, schedule: undefined }, open, 0)).toBe("Give the schedule.");
    expect(channelRoutineProblem({ ...input, schedule: { type: "interval", everyMinutes: 0 } }, open, 0)).toContain("interval is from");
    expect(channelRoutineProblem({ ...input, schedule: { type: "interval", everyMinutes: 1.5 } }, open, 0)).toContain("whole number");
    expect(channelRoutineProblem({ ...input, schedule: { type: "daily", time: "25:00" } }, open, 0)).toContain("HH:MM");
    expect(channelRoutineProblem({ ...input, schedule: { type: "daily", time: "09:00", weekdays: [7] } }, open, 0)).toContain("Weekdays");
    expect(channelRoutineProblem({ ...input, schedule: { type: "cron", expression: "* * *" } }, open, 0)).toContain("five fields");
    expect(channelRoutineProblem({ ...input, schedule: { type: "weekly" } }, open, 0)).toContain("interval, a daily time or a cron");
    expect(channelRoutineProblem({ ...input, timezone: "" }, open, 0)).toContain("time zone");
  });

  it("writes the message of a run with the name first", () => {
    expect(channelRoutineMessage(" Weekly review ", " Summarise the week. ")).toBe("Scheduled: Weekly review\n\nSummarise the week.");
  });
});
