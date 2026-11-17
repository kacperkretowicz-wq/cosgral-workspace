// @vitest-environment node
import { isLibraryPage, isScheduleFeed, isScheduleView, isUsageReport } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockLibraryView, createMockSchedule, createMockUsageReport } from "./mock-insights";

describe("mock library page, usage report and schedule (W12 BE-H)", () => {
  it("pages the library, deletes many without touching a chat attachment, and cleans up old files with a dry run first", async () => {
    const mock = createMockLibraryView();
    const first = await mock.page({});
    expect(isLibraryPage(first)).toBe(true);
    expect(first.counts).toMatchObject({ all: 7, chat: 1 });
    expect((await mock.page({ origin: "agent", sort: "name" })).items.map((item) => item.name)).toEqual([
      "launch-plan.md",
      "report-q3.md",
      "sources.csv",
    ]);
    const deleted = await mock.deleteMany({ fileIds: ["f-1", "f-5", "f-999"] });
    expect(deleted.deleted).toEqual(["f-1"]);
    expect(deleted.skipped).toEqual([
      { fileId: "f-5", reason: "chat-attachment" },
      { fileId: "f-999", reason: "not-found" },
    ]);
    expect((await mock.page({})).counts.all).toBe(6);
    const preview = await mock.cleanup({ origin: "upload", olderThanDays: 30, dryRun: true });
    expect(preview).toMatchObject({ files: 1, deleted: false });
    expect((await mock.page({})).counts.upload).toBe(3);
    expect(await mock.cleanup({ origin: "upload", olderThanDays: 30 })).toMatchObject({ files: 1, deleted: true });
    expect((await mock.page({})).counts.upload).toBe(2);
  });

  it("gives a usage report for each period with the days, the agents and the limits", async () => {
    const mock = createMockUsageReport();
    for (const period of [7, 30, 90, 365] as const) {
      const report = await mock.get({ period });
      expect(isUsageReport(report), String(period)).toBe(true);
      expect(report.days).toHaveLength(period);
    }
    const month = await mock.get({ period: 30 });
    expect(month.byAgent[0]?.name).toBe("Chief");
    expect(month.providers.map((usage) => usage.state)).toEqual(["ok", "limited"]);
    expect((await mock.get({ period: 30, botId: "research" })).byAgent.map((row) => row.botId)).toEqual(["research"]);
  });

  it("shows planned starts and runs in a window, and the latest runs as a feed", async () => {
    const mock = createMockSchedule();
    const view = await mock.view({ from: "2026-11-16T00:00:00Z", to: "2026-11-20T00:00:00Z" });
    expect(isScheduleView(view)).toBe(true);
    expect(view.entries.filter((entry) => entry.kind === "planned").length).toBeGreaterThanOrEqual(2);
    expect(view.entries.filter((entry) => entry.kind === "ran")).toHaveLength(2);
    expect(view.entries.map((entry) => entry.at)).toEqual([...view.entries.map((entry) => entry.at)].sort());
    const feed = await mock.feed({ limit: 2 });
    expect(isScheduleFeed(feed)).toBe(true);
    expect(feed.map((item) => item.run.id)).toEqual(["run-2", "run-1"]);
    expect(await mock.feed({ botId: "chief" })).toHaveLength(1);
    await expect(mock.view({ from: "2026-11-20T00:00:00Z", to: "2026-11-16T00:00:00Z" })).rejects.toThrow();
  });
});
