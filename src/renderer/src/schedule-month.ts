// The month grid of the schedule: which days it shows and how entries are counted per day. Weeks start on Monday.

/** "2026-11-25" in the local time zone: the key of a day cell. */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

/** Every day shown for one month, whole weeks from Monday to Sunday (35 or 42 days, local midnight). */
export function monthCells(month: Date): Date[] {
  const first = startOfMonth(month);
  const lead = (first.getDay() + 6) % 7;
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const total = Math.ceil((lead + length) / 7) * 7;
  return Array.from({ length: total }, (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - lead + index));
}

/** The time window of `schedule.view` that covers all cells of the grid. */
export function monthWindow(cells: readonly Date[]): { from: string; to: string } {
  const first = cells[0] ?? new Date();
  const last = cells[cells.length - 1] ?? first;
  return {
    from: first.toISOString(),
    to: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).toISOString(),
  };
}
