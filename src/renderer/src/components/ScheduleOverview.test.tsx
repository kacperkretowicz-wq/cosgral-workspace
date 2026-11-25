import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockSchedule } from "../../stories/mock-insights";
import { setLanguage } from "../i18n";
import { ScheduleOverview } from "./ScheduleOverview";

let schedule = createMockSchedule();

beforeEach(() => {
  schedule = createMockSchedule();
  Object.assign(window, { openbot: { schedule } });
});
afterEach(cleanup);

it("loads the next 14 days and the latest runs", async () => {
  const view = vi.spyOn(schedule, "view");
  const feed = vi.spyOn(schedule, "feed");
  render(() => <ScheduleOverview />);
  await waitFor(() => expect(view).toHaveBeenCalledOnce());
  expect(feed).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Next 14 days" })).toHaveAttribute("aria-current", "page");
});

it("switches the window", async () => {
  const view = vi.spyOn(schedule, "view");
  render(() => <ScheduleOverview />);
  await waitFor(() => expect(view).toHaveBeenCalledOnce());
  await fireEvent.click(screen.getByRole("button", { name: "Next 30 days" }));
  await waitFor(() => expect(view).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: "Next 30 days" })).toHaveAttribute("aria-current", "page");
});

it("shows an error with Retry", async () => {
  vi.spyOn(schedule, "view").mockRejectedValueOnce(new Error("no routines"));
  render(() => <ScheduleOverview />);
  expect(await screen.findByRole("alert")).toHaveTextContent("no routines");
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <ScheduleOverview />);
  expect(screen.getByText("The schedule overview is not available in this version.")).toBeInTheDocument();
});

it("shows why a run was skipped in the language of the window", async () => {
  setLanguage("pl");
  try {
    vi.spyOn(schedule, "view").mockImplementation(async (input) => ({
      from: input.from,
      to: input.to,
      entries: [
        {
          kind: "ran",
          routineId: "r-1",
          botId: "chief",
          routineName: "Raport",
          at: input.from,
          runId: "run-skipped",
          status: "skipped",
          cause: "schedule",
          reason: "COSGRAL Workspace was not running at the planned time; missed runs are not made up.",
          finishedAt: input.from,
        },
        {
          // Saved before 24.11.2026: the time was inside the sentence.
          kind: "ran",
          routineId: "r-1",
          botId: "chief",
          routineName: "Raport",
          at: input.from,
          runId: "run-skipped-old",
          status: "skipped",
          cause: "schedule",
          reason: "COSGRAL Workspace was not running at 23/11/2026, 16:06; missed runs are not made up.",
          finishedAt: input.from,
        },
      ],
      truncated: false,
      webhooks: [],
      paused: [],
    }));
    render(() => <ScheduleOverview />);
    expect(
      await screen.findAllByText(/nie był uruchomiony o zaplanowanej porze; pominiętych uruchomień nie nadrabia/),
    ).toHaveLength(2);
    expect(screen.queryByText(/was not running/)).not.toBeInTheDocument();
  } finally {
    setLanguage("en");
  }
});

it("shows a month grid with the runs of one chosen day under it", async () => {
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const planned = new Date(today.getTime());
  const failed = new Date(today.getTime() + 3_600_000);
  vi.spyOn(schedule, "view").mockImplementation(async (input) => ({
    from: input.from,
    to: input.to,
    entries: [
      { kind: "planned", routineId: "r-1", botId: "chief", routineName: "Poranny raport", at: planned.toISOString() },
      {
        kind: "ran",
        routineId: "r-2",
        botId: "chief",
        routineName: "Tygodniowy raport",
        at: failed.toISOString(),
        runId: "run-x",
        status: "failed",
        cause: "schedule",
        reason: "Usage limit reached",
        finishedAt: failed.toISOString(),
      },
    ],
    truncated: false,
    webhooks: [],
    paused: [],
  }));
  render(() => <ScheduleOverview />);
  await screen.findByRole("button", { name: "Month" });
  await fireEvent.click(screen.getByRole("button", { name: "Month" }));
  const todayCell = await screen.findByRole("button", {
    name: new RegExp(
      `^${today.toLocaleDateString("en-US", { day: "numeric", month: "long" })}: planned 1, done 0, failed 1`,
    ),
  });
  expect(todayCell).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByText("Poranny raport")).toBeInTheDocument();
  // Another day with no runs: the grid says so instead of staying silent.
  const other = screen.getAllByRole("button", { name: /planned 0, done 0, failed 0/ })[0];
  if (!other) throw new Error("Expected an empty day");
  await fireEvent.click(other);
  expect(await screen.findByText("Nothing is planned or has run on this day.")).toBeInTheDocument();
  expect(screen.queryByText("Poranny raport")).not.toBeInTheDocument();
});

it("asks for the whole month and moves between months", async () => {
  const view = vi.spyOn(schedule, "view");
  render(() => <ScheduleOverview />);
  await waitFor(() => expect(view).toHaveBeenCalledOnce());
  await fireEvent.click(screen.getByRole("button", { name: "Month" }));
  await waitFor(() => expect(view).toHaveBeenCalledTimes(2));
  const first = view.mock.calls[1]?.[0];
  expect(Date.parse(first?.to ?? "") - Date.parse(first?.from ?? "")).toBeGreaterThanOrEqual(28 * 86_400_000);
  await fireEvent.click(await screen.findByRole("button", { name: "Next month" }));
  await waitFor(() => expect(view).toHaveBeenCalledTimes(3));
  expect(Date.parse(view.mock.calls[2]?.[0].from ?? "")).toBeGreaterThan(Date.parse(first?.from ?? ""));
  expect(screen.getByText("Pick a day to see its runs.")).toBeInTheDocument();
});
