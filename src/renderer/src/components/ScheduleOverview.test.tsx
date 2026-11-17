import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockSchedule } from "../../stories/mock-insights";
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
