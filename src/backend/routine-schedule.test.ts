import { describe, expect, it } from "vitest";
import { checkSchedule, isTimeZone, nextRunAfter, parseCron } from "./routine-schedule";

const at = (iso: string) => new Date(iso);

describe("routine schedule", () => {
  it("runs an interval routine N minutes after the given moment, on a whole minute", () => {
    expect(
      nextRunAfter({ type: "interval", everyMinutes: 1 }, "UTC", at("2026-11-13T03:00:20.500Z"))?.toISOString(),
    ).toBe("2026-11-13T03:01:00.000Z");
    expect(
      nextRunAfter({ type: "interval", everyMinutes: 90 }, "UTC", at("2026-11-13T03:00:00.000Z"))?.toISOString(),
    ).toBe("2026-11-13T04:30:00.000Z");
  });

  it("reads a daily time in the person's time zone", () => {
    // Warsaw is UTC+1 in November.
    expect(
      nextRunAfter({ type: "daily", time: "08:30" }, "Europe/Warsaw", at("2026-11-13T06:00:00Z"))?.toISOString(),
    ).toBe("2026-11-13T07:30:00.000Z");
    expect(
      nextRunAfter({ type: "daily", time: "08:30" }, "Europe/Warsaw", at("2026-11-13T07:30:00Z"))?.toISOString(),
    ).toBe("2026-11-14T07:30:00.000Z");
    // New York is UTC-5 in November.
    expect(
      nextRunAfter({ type: "daily", time: "08:30" }, "America/New_York", at("2026-11-13T06:00:00Z"))?.toISOString(),
    ).toBe("2026-11-13T13:30:00.000Z");
  });

  it("follows daylight saving: the same local time, a different UTC hour", () => {
    // Europe/Warsaw switches to UTC+2 on 2026-03-29.
    expect(
      nextRunAfter({ type: "daily", time: "09:00" }, "Europe/Warsaw", at("2026-03-28T09:00:00Z"))?.toISOString(),
    ).toBe("2026-03-29T07:00:00.000Z");
    // 02:30 does not exist that night in Warsaw: the next real 02:30 is a day later.
    expect(
      nextRunAfter({ type: "daily", time: "02:30" }, "Europe/Warsaw", at("2026-03-28T23:00:00Z"))?.toISOString(),
    ).toBe("2026-03-30T00:30:00.000Z");
  });

  it("keeps to the chosen weekdays", () => {
    // 2026-11-13 is a Friday; Monday is 2026-11-16.
    expect(
      nextRunAfter({ type: "daily", time: "09:00", weekdays: [1] }, "UTC", at("2026-11-13T10:00:00Z"))?.toISOString(),
    ).toBe("2026-11-16T09:00:00.000Z");
  });

  it("supports five-field cron with lists, ranges and steps", () => {
    expect(
      nextRunAfter({ type: "cron", expression: "*/15 * * * *" }, "UTC", at("2026-11-13T03:07:00Z"))?.toISOString(),
    ).toBe("2026-11-13T03:15:00.000Z");
    // Weekdays 9-17 every 30 minutes; Friday 17:45 → Monday 09:00.
    expect(
      nextRunAfter({ type: "cron", expression: "0,30 9-17 * * 1-5" }, "UTC", at("2026-11-13T17:45:00Z"))?.toISOString(),
    ).toBe("2026-11-16T09:00:00.000Z");
    // Day of month and day of week both set: either matches (classic cron).
    expect(
      nextRunAfter({ type: "cron", expression: "0 12 1 * 0" }, "UTC", at("2026-11-13T00:00:00Z"))?.toISOString(),
    ).toBe("2026-11-15T12:00:00.000Z");
    // 7 is Sunday too.
    expect(parseCron("0 0 * * 7").daysOfWeek).toEqual(new Set([0]));
  });

  it("refuses invalid schedules and time zones with a readable message", () => {
    expect(isTimeZone("Europe/Warsaw")).toBe(true);
    expect(isTimeZone("Mars/Base")).toBe(false);
    expect(() => checkSchedule({ type: "interval", everyMinutes: 0 })).toThrow(/minutes/);
    expect(() => checkSchedule({ type: "interval", everyMinutes: 1.5 })).toThrow(/minutes/);
    expect(() => checkSchedule({ type: "daily", time: "25:00" })).toThrow(/HH:MM/);
    expect(() => checkSchedule({ type: "daily", time: "08:30", weekdays: [8] })).toThrow(/weekdays/);
    expect(() => checkSchedule({ type: "cron", expression: "* * *" })).toThrow(/five fields/);
    expect(() => checkSchedule({ type: "cron", expression: "61 * * * *" })).toThrow(/minute/);
    expect(() => checkSchedule({ type: "cron", expression: "0 0 31 2 *" })).not.toThrow();
    expect(nextRunAfter({ type: "cron", expression: "0 0 31 2 *" }, "UTC", at("2026-11-13T00:00:00Z"))).toBeNull();
  });
});
