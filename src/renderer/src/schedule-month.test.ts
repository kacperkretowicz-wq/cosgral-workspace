import { describe, expect, it } from "vitest";
import { addMonths, localDayKey, monthCells, monthWindow, startOfMonth } from "./schedule-month";

const dayAt = (cells: Date[], index: number) => localDayKey(cells.at(index) ?? new Date(0));

describe("schedule month grid", () => {
  it("starts on the Monday on or before the first and ends on a Sunday", () => {
    const cells = monthCells(new Date(2026, 10, 25)); // November 2026 starts on a Sunday
    expect(dayAt(cells, 0)).toBe("2026-10-26");
    expect(cells).toHaveLength(42);
    expect(dayAt(cells, -1)).toBe("2026-12-06");
    expect((cells.at(-1) ?? new Date(0)).getDay()).toBe(0);
    expect(cells.map(localDayKey)).toContain("2026-11-30");
    expect(monthCells(new Date(2027, 1, 1))).toHaveLength(28); // February 2027 is exactly four weeks
  });

  it("uses six rows when the month needs them", () => {
    const cells = monthCells(new Date(2026, 7, 1)); // August 2026 starts on a Saturday
    expect(cells).toHaveLength(42);
    expect(dayAt(cells, 0)).toBe("2026-07-27");
  });

  it("moves between months and keeps the window within the contract limit", () => {
    expect(localDayKey(addMonths(startOfMonth(new Date(2026, 11, 31)), 1))).toBe("2027-01-01");
    expect(localDayKey(addMonths(new Date(2026, 0, 1), -1))).toBe("2025-12-01");
    const { from, to } = monthWindow(monthCells(new Date(2026, 7, 1)));
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeLessThanOrEqual(62);
    expect(Date.parse(to)).toBeGreaterThan(Date.parse(from));
  });
});
