// COSGRAL W12 (BE-H): the library page, the usage report and the schedule for Storybook and the preview. Demo data only; nothing is
// contacted. The same rules as the program (they are shared in the contract): filters, sorting and paging of the library, a chat
// attachment is never deleted by "delete many", the usage report lists every day of the period, the schedule lists planned starts
// and runs. The clock is fixed so stories look the same every time.

import {
  aggregateUsage,
  type DeleteLibraryFilesResult,
  type LibraryCleanupResult,
  type LibraryEntry,
  type LibraryViewDesktopApi,
  parseDeleteLibraryFilesInput,
  parseLibraryCleanupInput,
  parseLibraryQuery,
  parseScheduleFeedInput,
  parseScheduleViewInput,
  parseUsageReportInput,
  type ScheduleDesktopApi,
  type ScheduleEntry,
  type ScheduleFeedItem,
  selectLibraryPage,
  type UsageDetailRow,
  type UsageReportDesktopApi,
  type UsageRow,
} from "@openbot/contracts/ipc";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const DAY = 86_400_000;
const NAMES: Record<string, string> = { chief: "Chief", research: "Research" };

function demoFiles(): LibraryEntry[] {
  const make = (
    index: number,
    name: string,
    origin: LibraryEntry["origin"],
    size: number,
    ageDays: number,
    botId: string | null,
    mimeType = "text/markdown",
  ): LibraryEntry => ({
    id: `f-${index}`,
    name,
    size,
    kind: mimeType.startsWith("image/") ? "image" : "file",
    mimeType,
    previewKind: mimeType.startsWith("image/") ? "image" : mimeType === "application/pdf" ? "pdf" : "text",
    previewUrl: null,
    origin,
    createdAt: new Date(NOW.getTime() - ageDays * DAY).toISOString(),
    createdByBotId: botId,
    messageId: origin === "chat" ? `m-${index}` : null,
    agentName: botId ? (NAMES[botId] ?? null) : null,
  });
  return [
    make(1, "launch-plan.md", "agent", 4_096, 1, "chief"),
    make(2, "sources.csv", "agent", 18_220, 3, "research", "text/csv"),
    make(3, "brand-guide.pdf", "upload", 912_000, 9, null, "application/pdf"),
    make(4, "logo.png", "upload", 64_300, 12, null, "image/png"),
    make(5, "screenshot-1.png", "chat", 210_000, 2, "chief", "image/png"),
    make(6, "notes-old.md", "upload", 1_200, 80, null),
    make(7, "report-q3.md", "agent", 22_800, 45, "chief"),
  ];
}

export function createMockLibraryView(): Required<LibraryViewDesktopApi> {
  let files = demoFiles();
  return {
    page: async (raw) => selectLibraryPage(files, parseLibraryQuery(raw)),
    deleteMany: async (raw) => {
      const { fileIds } = parseDeleteLibraryFilesInput(raw);
      const result: DeleteLibraryFilesResult = { deleted: [], skipped: [], freedBytes: 0 };
      for (const fileId of fileIds) {
        const file = files.find((candidate) => candidate.id === fileId);
        if (!file) result.skipped.push({ fileId, reason: "not-found" });
        else if (file.origin === "chat") result.skipped.push({ fileId, reason: "chat-attachment" });
        else {
          result.deleted.push(fileId);
          result.freedBytes += file.size;
        }
      }
      files = files.filter((file) => !result.deleted.includes(file.id));
      return result;
    },
    cleanup: async (raw) => {
      const input = parseLibraryCleanupInput(raw);
      const cutoff = NOW.getTime() - input.olderThanDays * DAY;
      const old = files.filter((file) => file.origin === input.origin && Date.parse(file.createdAt) < cutoff);
      const result: LibraryCleanupResult = {
        files: old.length,
        bytes: old.reduce((sum, file) => sum + file.size, 0),
        deleted: input.dryRun !== true,
      };
      if (result.deleted) files = files.filter((file) => !old.includes(file));
      return result;
    },
  };
}

function demoUsageRows(): UsageRow[] {
  const rows: UsageRow[] = [];
  for (let back = 0; back < 120; back += 3) {
    const day = new Date(NOW.getTime() - back * DAY).toISOString().slice(0, 10);
    rows.push({ day, botId: "chief", tokens: 12_000 + back * 40, turns: 4, costUsd: 0.42, pricedTurns: 3 });
    if (back % 6 === 0) rows.push({ day, botId: "research", tokens: 6_500, turns: 2, costUsd: 0.11, pricedTurns: 2 });
  }
  return rows;
}

/** The same days as the counter, with a model and the parts of the tokens (as if they were kept from the start). */
function demoDetailRows(rows: readonly UsageRow[]): UsageDetailRow[] {
  return rows.map((row) => {
    const output = Math.round(row.tokens * 0.2);
    const input = row.tokens - output;
    return {
      day: row.day,
      botId: row.botId,
      model: row.botId === "chief" ? "gpt-6-luna" : "claude-haiku-5-5",
      turns: row.turns,
      input,
      cached: Math.round(input * 0.4),
      output,
      reasoning: Math.round(output * 0.3),
    };
  });
}

export function createMockUsageReport(): Required<UsageReportDesktopApi> {
  const rows = demoUsageRows();
  const detail = demoDetailRows(rows);
  return {
    get: async (raw) => {
      const input = parseUsageReportInput(raw);
      return aggregateUsage({
        rows,
        period: input.period,
        botId: input.botId,
        today: NOW,
        now: NOW,
        names: (botId) => NAMES[botId] ?? null,
        providers: [
          { provider: "codex", model: null, state: "ok", resetsAt: null, usedPercent: 42, reason: null },
          {
            provider: "claude",
            model: null,
            state: "limited",
            resetsAt: Math.floor(NOW.getTime() / 1000) + 5_400,
            usedPercent: 100,
            reason: "Usage limit reached",
          },
        ],
        machine: { cpuPercent: 23, memoryPercent: 61 },
        firstDay: rows.map((row) => row.day).sort()[0] ?? null,
        detail,
        firstDetailDay: detail.map((row) => row.day).sort()[0] ?? null,
      });
    },
  };
}

export function createMockSchedule(): Required<ScheduleDesktopApi> {
  const routines = [
    { routineId: "r-1", botId: "research", routineName: "Morning brief" },
    { routineId: "r-2", botId: "chief", routineName: "Weekly report" },
  ];
  const ran = (
    run: number,
    routine: (typeof routines)[number],
    at: string,
    status: "done" | "failed",
    reason: string | null,
  ): ScheduleEntry => ({
    kind: "ran",
    ...routine,
    at,
    runId: `run-${run}`,
    status,
    cause: "schedule",
    reason,
    finishedAt: new Date(Date.parse(at) + 90_000).toISOString(),
  });
  const history = [
    ran(1, routines[0], "2026-11-16T08:00:00.000Z", "done", null),
    ran(2, routines[0], "2026-11-17T08:00:00.000Z", "failed", "Usage limit reached"),
    ran(3, routines[1], "2026-11-14T16:00:00.000Z", "done", null),
  ];
  return {
    view: async (raw) => {
      const input = parseScheduleViewInput(raw);
      const from = Date.parse(input.from);
      const to = Date.parse(input.to);
      const planned: ScheduleEntry[] = [];
      for (let day = Math.floor(from / DAY) * DAY; day <= to; day += DAY) {
        const at = day + 8 * 3_600_000;
        if (at > NOW.getTime() && at >= from && at <= to)
          planned.push({ kind: "planned", ...routines[0], at: new Date(at).toISOString() });
      }
      const within = (entry: ScheduleEntry) => Date.parse(entry.at) >= from && Date.parse(entry.at) <= to;
      const mine = (entry: ScheduleEntry) => input.botId === undefined || entry.botId === input.botId;
      const entries = [...history, ...planned]
        .filter((entry) => within(entry) && mine(entry))
        .sort((a, b) => a.at.localeCompare(b.at));
      return {
        from: input.from,
        to: input.to,
        entries,
        truncated: false,
        webhooks: [{ routineId: "r-3", botId: "chief", routineName: "On new ticket" }],
        paused: [],
      };
    },
    feed: async (raw) => {
      const input = parseScheduleFeedInput(raw);
      const items: ScheduleFeedItem[] = history
        .flatMap((entry) =>
          entry.kind === "ran"
            ? [
                {
                  run: {
                    id: entry.runId,
                    routineId: entry.routineId,
                    botId: entry.botId,
                    cause: entry.cause,
                    status: entry.status,
                    reason: entry.reason,
                    startedAt: entry.at,
                    finishedAt: entry.finishedAt,
                    deliveryId: null,
                  },
                  routineName: entry.routineName,
                  agentName: NAMES[entry.botId] ?? null,
                },
              ]
            : [],
        )
        .filter(
          (item) =>
            (input.botId === undefined || item.run.botId === input.botId) &&
            (input.before === undefined || item.run.startedAt < input.before),
        )
        .sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt));
      return items.slice(0, input.limit);
    },
  };
}
