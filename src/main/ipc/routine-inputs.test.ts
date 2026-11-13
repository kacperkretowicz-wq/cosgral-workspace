import { describe, expect, it } from "vitest";
import { parseCreateRoutine, parseRoutineId, parseRoutinesBotId, parseUpdateRoutine } from "./routine-inputs";

describe("routine IPC input parsing", () => {
  it("parses schedule and webhook routines", () => {
    expect(
      parseCreateRoutine({
        botId: "chief",
        name: "Morning",
        prompt: "Summarize.",
        trigger: "schedule",
        schedule: { type: "daily", time: "08:30", weekdays: [1, 2] },
        timezone: "Europe/Warsaw",
      }),
    ).toEqual({
      botId: "chief",
      name: "Morning",
      prompt: "Summarize.",
      trigger: "schedule",
      schedule: { type: "daily", time: "08:30", weekdays: [1, 2] },
      timezone: "Europe/Warsaw",
      eventTypes: undefined,
      paused: undefined,
    });
    expect(
      parseCreateRoutine({ botId: "chief", name: "Hook", prompt: "React.", trigger: "webhook", eventTypes: ["a.b"] }),
    ).toMatchObject({ trigger: "webhook", eventTypes: ["a.b"], schedule: undefined });
  });

  it("rejects wrong shapes before they reach the manager", () => {
    expect(() => parseCreateRoutine(null)).toThrow();
    expect(() => parseCreateRoutine({ botId: "c", name: "n", prompt: "p", trigger: "cron" })).toThrow(/trigger/);
    expect(() =>
      parseCreateRoutine({ botId: "c", name: "n", prompt: "p", trigger: "schedule", schedule: { type: "weekly" } }),
    ).toThrow(/schedule/);
    expect(() =>
      parseCreateRoutine({ botId: "c", name: "n", prompt: "p", trigger: "webhook", eventTypes: [1] }),
    ).toThrow(/eventTypes/);
    expect(() => parseUpdateRoutine({ routineId: "r", paused: "yes" })).toThrow(/paused/);
  });

  it("parses updates, ids and the optional agent filter", () => {
    expect(parseUpdateRoutine({ routineId: "r1", paused: true })).toEqual({
      routineId: "r1",
      name: undefined,
      prompt: undefined,
      schedule: undefined,
      timezone: undefined,
      eventTypes: undefined,
      paused: true,
    });
    expect(parseRoutineId({ routineId: "r1" })).toEqual({ routineId: "r1" });
    expect(parseRoutinesBotId(undefined)).toBeUndefined();
    expect(parseRoutinesBotId(null)).toBeUndefined();
    expect(parseRoutinesBotId("chief")).toBe("chief");
  });
});
