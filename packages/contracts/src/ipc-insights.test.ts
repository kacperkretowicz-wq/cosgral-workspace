import { describe, expect, it } from "vitest";
import {
  aggregateUsage,
  isDeleteLibraryFilesResult,
  isLibraryCleanupResult,
  isLibraryPage,
  isScheduleFeed,
  isScheduleView,
  isUsageReport,
  LIBRARY_VIEW_LIMITS,
  type LibraryEntry,
  libraryKindOf,
  parseDeleteLibraryFilesInput,
  parseLibraryCleanupInput,
  parseLibraryQuery,
  parseScheduleFeedInput,
  parseScheduleViewInput,
  parseUsageReportInput,
  SCHEDULE_LIMITS,
  selectLibraryPage,
  type USAGE_PERIODS,
  type UsageRow,
} from "./ipc-insights";

const entry = (
  id: string,
  name: string,
  origin: LibraryEntry["origin"],
  size: number,
  createdAt: string,
  botId: string | null = null,
  mimeType = "text/plain",
): LibraryEntry => ({
  id,
  name,
  size,
  kind: mimeType.startsWith("image/") ? "image" : "file",
  mimeType,
  previewKind: mimeType.startsWith("image/") ? "image" : "text",
  previewUrl: null,
  origin,
  createdAt,
  createdByBotId: botId,
  messageId: null,
  agentName: botId,
});

const files = [
  entry("1", "b-plan.md", "agent", 300, "2026-11-10T00:00:00.000Z", "chief"),
  entry("2", "A-logo.png", "upload", 100, "2026-11-12T00:00:00.000Z", null, "image/png"),
  entry("3", "c-chat.png", "chat", 900, "2026-11-11T00:00:00.000Z", "chief", "image/png"),
  entry("4", "d-notes.md", "upload", 50, "2026-11-01T00:00:00.000Z"),
];

describe("library page (W12 BE-H)", () => {
  it("fills the defaults and refuses a wrong query", () => {
    expect(parseLibraryQuery(undefined)).toEqual({ sort: "newest", offset: 0, limit: LIBRARY_VIEW_LIMITS.defaultPage });
    expect(
      parseLibraryQuery({ query: " Plan ", origin: "agent", kind: "document", botId: "chief", sort: "size", limit: 5 }),
    ).toMatchObject({
      query: "Plan",
      origin: "agent",
      sort: "size",
      limit: 5,
    });
    const bad: unknown[] = [
      5,
      { origin: "cloud" },
      { kind: "video" },
      { sort: "random" },
      { limit: 0 },
      { limit: LIBRARY_VIEW_LIMITS.maxPage + 1 },
      { offset: -1 },
      { botId: "" },
      { query: "x".repeat(201) },
    ];
    for (const query of bad) expect(() => parseLibraryQuery(query), JSON.stringify(query)).toThrow();
  });

  it("filters by name, origin, kind and agent, sorts four ways, pages, and counts the whole library", () => {
    const page = (query: unknown) => selectLibraryPage(files, parseLibraryQuery(query));
    expect(page({}).items.map((item) => item.id)).toEqual(["2", "3", "1", "4"]);
    expect(page({ sort: "oldest" }).items.map((item) => item.id)).toEqual(["4", "1", "3", "2"]);
    expect(page({ sort: "name" }).items.map((item) => item.id)).toEqual(["2", "1", "3", "4"]);
    expect(page({ sort: "size" }).items.map((item) => item.id)).toEqual(["3", "1", "2", "4"]);
    expect(page({ query: "PLAN" }).items.map((item) => item.id)).toEqual(["1"]);
    expect(page({ kind: "image" }).items.map((item) => item.id)).toEqual(["2", "3"]);
    expect(page({ botId: "chief" }).total).toBe(2);
    const second = page({ limit: 2, offset: 2 });
    expect(second.items.map((item) => item.id)).toEqual(["1", "4"]);
    expect(second).toMatchObject({ total: 4, counts: { all: 4, upload: 2, agent: 1, chat: 1 }, bytes: 1350 });
    expect(page({ origin: "upload" }).counts.all).toBe(4);
    expect(isLibraryPage(page({}))).toBe(true);
    expect(isLibraryPage({ ...page({}), total: -1 })).toBe(false);
  });

  it("knows the kind of a file from its preview", () => {
    expect(libraryKindOf({ kind: "image", previewKind: "image", mimeType: "image/png" })).toBe("image");
    expect(libraryKindOf({ kind: "file", previewKind: "pdf", mimeType: "application/pdf" })).toBe("document");
    expect(libraryKindOf({ kind: "file", previewKind: "none", mimeType: "application/zip" })).toBe("other");
  });

  it("checks delete-many and clean-up requests", () => {
    expect(parseDeleteLibraryFilesInput({ fileIds: ["a", "b", "a"] })).toEqual({ fileIds: ["a", "b"] });
    for (const input of [
      null,
      {},
      { fileIds: [] },
      { fileIds: [1] },
      { fileIds: [""] },
      { fileIds: Array.from({ length: 201 }, (_, i) => `${i}`) },
    ]) {
      expect(() => parseDeleteLibraryFilesInput(input), JSON.stringify(input)).toThrow();
    }
    expect(parseLibraryCleanupInput({ origin: "agent", olderThanDays: 30, dryRun: true })).toEqual({
      origin: "agent",
      olderThanDays: 30,
      dryRun: true,
    });
    for (const input of [
      { origin: "chat", olderThanDays: 30 },
      { origin: "upload", olderThanDays: 0 },
      { origin: "upload", olderThanDays: 1.5 },
      { origin: "upload", olderThanDays: 30, dryRun: "yes" },
    ]) {
      expect(() => parseLibraryCleanupInput(input), JSON.stringify(input)).toThrow();
    }
    expect(
      isDeleteLibraryFilesResult({
        deleted: ["a"],
        skipped: [{ fileId: "b", reason: "chat-attachment" }],
        freedBytes: 5,
      }),
    ).toBe(true);
    expect(
      isDeleteLibraryFilesResult({ deleted: [], skipped: [{ fileId: "b", reason: "because" }], freedBytes: 0 }),
    ).toBe(false);
    expect(isLibraryCleanupResult({ files: 2, bytes: 9, deleted: false })).toBe(true);
  });
});

describe("usage report (W12 BE-H)", () => {
  const today = new Date("2026-11-17T10:00:00.000Z");
  const rows: UsageRow[] = [
    { day: "2026-11-17", botId: "chief", tokens: 1_000, turns: 2, costUsd: 0.5, pricedTurns: 2 },
    { day: "2026-11-15", botId: "chief", tokens: 3_000, turns: 3, costUsd: 0.2, pricedTurns: 1 },
    { day: "2026-11-15", botId: "writer", tokens: 1_000, turns: 1, costUsd: 0, pricedTurns: 0 },
    { day: "2026-10-01", botId: "chief", tokens: 9_999, turns: 9, costUsd: 9, pricedTurns: 9 },
  ];
  const report = (period: (typeof USAGE_PERIODS)[number], botId: string | null = null) =>
    aggregateUsage({
      rows,
      period,
      botId,
      today,
      now: today,
      names: (id) => (id === "chief" ? "Chief" : null),
      providers: [],
      machine: { cpuPercent: 12, memoryPercent: 55 },
      firstDay: "2026-10-01",
    });

  it("parses the request: four periods, one agent or all", () => {
    expect(parseUsageReportInput({ period: 30 })).toEqual({ period: 30, botId: null });
    expect(parseUsageReportInput({ period: 7, botId: "chief" })).toEqual({ period: 7, botId: "chief" });
    for (const input of [null, {}, { period: 14 }, { period: 7, botId: "" }]) {
      expect(() => parseUsageReportInput(input), JSON.stringify(input)).toThrow();
    }
  });

  it("lists every day of the period, also those without use, and ignores rows outside it", () => {
    const week = report(7);
    expect(week.days).toHaveLength(7);
    expect(week.from).toBe("2026-11-11");
    expect(week.to).toBe("2026-11-17");
    expect(week.days.at(-1)).toMatchObject({ day: "2026-11-17", tokens: 1_000 });
    expect(week.days.find((day) => day.day === "2026-11-16")).toMatchObject({ tokens: 0, turns: 0, costUsd: 0 });
    expect(week.totals).toMatchObject({ tokens: 5_000, turns: 6, pricedTurns: 3, costComplete: false });
    expect(report(90).totals.tokens).toBe(14_999);
    expect(report(365).days).toHaveLength(365);
    expect(isUsageReport(week)).toBe(true);
  });

  it("splits by agent with shares, biggest first, and narrows to one agent", () => {
    const all = report(30);
    expect(all.byAgent.map((row) => [row.botId, row.name, row.tokenShare, row.costShare])).toEqual([
      ["chief", "Chief", 80, 100],
      ["writer", null, 20, 0],
    ]);
    const one = report(30, "writer");
    expect(one.byAgent).toHaveLength(1);
    expect(one.totals).toMatchObject({ tokens: 1_000, costUsd: 0, costComplete: false });
    expect(one.byAgent[0]?.costShare).toBeNull();
  });

  it("says what it does not collect instead of inventing it", () => {
    expect(report(7).unavailable.map((item) => item.breakdown)).toEqual(["model", "skill", "cache"]);
    expect(report(7).collectingSince).toBe("2026-10-01");
    expect(isUsageReport({ ...report(7), days: report(7).days.slice(1) })).toBe(false);
    expect(isUsageReport({ ...report(7), machine: { cpuPercent: 120, memoryPercent: 1 } })).toBe(false);
  });
});

describe("schedule (W12 BE-H)", () => {
  it("checks the window: a start, a later end, at most 62 days", () => {
    expect(
      parseScheduleViewInput({ from: "2026-11-17T00:00:00Z", to: "2026-11-24T00:00:00Z", botId: "chief" }),
    ).toEqual({
      from: "2026-11-17T00:00:00.000Z",
      to: "2026-11-24T00:00:00.000Z",
      botId: "chief",
    });
    const bad: unknown[] = [
      null,
      { from: "x", to: "2026-11-24T00:00:00Z" },
      { from: "2026-11-24T00:00:00Z", to: "2026-11-17T00:00:00Z" },
      { from: "2026-01-01T00:00:00Z", to: "2026-06-01T00:00:00Z" },
    ];
    for (const input of bad) expect(() => parseScheduleViewInput(input), JSON.stringify(input)).toThrow();
    expect(SCHEDULE_LIMITS.maxWindowDays).toBe(62);
  });

  it("checks the feed query and fills the defaults", () => {
    expect(parseScheduleFeedInput(undefined)).toEqual({ limit: SCHEDULE_LIMITS.defaultFeed });
    expect(parseScheduleFeedInput({ limit: 5, before: "2026-11-17T08:00:00Z" })).toEqual({
      limit: 5,
      before: "2026-11-17T08:00:00.000Z",
    });
    for (const input of [{ limit: 0 }, { limit: 101 }, { before: "yesterday" }, { botId: "" }]) {
      expect(() => parseScheduleFeedInput(input), JSON.stringify(input)).toThrow();
    }
  });

  it("accepts a well-formed schedule and feed and refuses a broken one", () => {
    const named = { routineId: "r", botId: "b", routineName: "Brief" };
    const view = {
      from: "a",
      to: "b",
      entries: [
        { kind: "planned", ...named, at: "t" },
        {
          kind: "ran",
          ...named,
          at: "t",
          runId: "x",
          status: "done",
          cause: "schedule",
          reason: null,
          finishedAt: null,
        },
      ],
      truncated: false,
      webhooks: [named],
      paused: [],
    };
    expect(isScheduleView(view)).toBe(true);
    expect(isScheduleView({ ...view, entries: [{ kind: "ran", ...named, at: "t" }] })).toBe(false);
    expect(isScheduleView({ ...view, truncated: "no" })).toBe(false);
    const run = {
      id: "x",
      routineId: "r",
      botId: "b",
      cause: "manual",
      status: "failed",
      reason: "no",
      startedAt: "t",
      finishedAt: null,
      deliveryId: null,
    };
    expect(isScheduleFeed([{ run, routineName: "Brief", agentName: null }])).toBe(true);
    expect(isScheduleFeed([{ run: { ...run, status: "odd" }, routineName: "Brief", agentName: null }])).toBe(false);
  });
});
