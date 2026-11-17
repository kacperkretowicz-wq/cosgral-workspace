import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockUsageReport } from "../../stories/mock-insights";
import { UsageReportView } from "./UsageReportView";

let usage = createMockUsageReport();

beforeEach(() => {
  usage = createMockUsageReport();
  Object.assign(window, { openbot: { usageReport: usage } });
});
afterEach(cleanup);

it("shows totals, the daily chart, the machine rings and the agent table", async () => {
  render(() => <UsageReportView />);
  expect(await screen.findByRole("img", { name: /^Tokens per day/ })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /^Processor:/ })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /^Memory:/ })).toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
});

it("asks for the period that was chosen", async () => {
  const spy = vi.spyOn(usage, "get");
  render(() => <UsageReportView />);
  await screen.findByRole("table");
  await fireEvent.click(screen.getByRole("button", { name: "90 days" }));
  await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ period: 90 })));
  expect(screen.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-current", "page");
});

it("lists what is not collected instead of inventing it", async () => {
  render(() => <UsageReportView />);
  await screen.findByRole("table");
  expect(screen.getByText("Not collected yet")).toBeInTheDocument();
});

it("shows an error with Retry", async () => {
  vi.spyOn(usage, "get").mockRejectedValueOnce(new Error("counter locked"));
  render(() => <UsageReportView />);
  expect(await screen.findByRole("alert")).toHaveTextContent("counter locked");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("table")).toBeInTheDocument();
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <UsageReportView />);
  expect(screen.getByText("The usage report is not available in this version.")).toBeInTheDocument();
});
