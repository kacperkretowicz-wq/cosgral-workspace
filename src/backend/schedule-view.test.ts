// @vitest-environment node
import { isScheduleFeed, isScheduleView, type Routine, type RoutineRun, SCHEDULE_LIMITS } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { ScheduleViewService } from "./schedule-view";

const NOW = new Date("2026-11-17T10:00:00.000Z");

function routine(id: string, botId: string, patch: Partial<Routine> = {}): Routine {
  return {
    id,
    botId,
    name: `Routine ${id}`,
    prompt: "Do it",
    trigger: "schedule",
    schedule: { type: "daily", time: "08:00" },
    timezone: "UTC",
    paused: false,
    nextRunAt: null,
    webhook: null,
    createdBy: "person",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...patch,
  };
}

function run(
  id: string,
  routineId: string,
  botId: string,
  startedAt: string,
  status: RoutineRun["status"] = "done",
): RoutineRun {
  return {
    id,
    routineId,
    botId,
    cause: "schedule",
    status,
    reason: status === "failed" ? "Usage limit reached" : null,
    startedAt,
    finishedAt: null,
    deliveryId: null,
  };
}

function setup(routines: Routine[], runs: RoutineRun[]) {
  return new ScheduleViewService({
    routines: () => routines,
    runs: (routineId) => runs.filter((item) => item.routineId === routineId),
    agentName: (botId) => (botId === "chief" ? "Chief" : null),
    now: () => NOW,
  });
}

const window = { from: "2026-11-16T00:00:00Z", to: "2026-11-20T00:00:00Z" };

describe("ScheduleViewService (W12 BE-H)", () => {
  it("lists what ran and what is planned, oldest first, and planned starts only after now", () => {
    const service = setup(
      [routine("r1", "chief")],
      [
        run("x1", "r1", "chief", "2026-11-16T08:00:00.000Z"),
        run("x2", "r1", "chief", "2026-11-17T08:00:00.000Z", "failed"),
      ],
    );
    const view = service.view(window);
    expect(isScheduleView(view)).toBe(true);
    expect(view.entries.map((entry) => [entry.kind, entry.at])).toEqual([
      ["ran", "2026-11-16T08:00:00.000Z"],
      ["ran", "2026-11-17T08:00:00.000Z"],
      ["planned", "2026-11-18T08:00:00.000Z"],
      ["planned", "2026-11-19T08:00:00.000Z"],
    ]);
    const failed = view.entries[1];
    expect(failed?.kind === "ran" ? failed.reason : null).toBe("Usage limit reached");
    expect(view.truncated).toBe(false);
  });

  it("puts paused and webhook routines aside, with no planned starts, and narrows to one agent", () => {
    const service = setup(
      [
        routine("r1", "chief"),
        routine("r2", "writer", { paused: true }),
        routine("r3", "chief", { trigger: "webhook", schedule: null }),
      ],
      [],
    );
    const view = service.view(window);
    expect(view.entries.every((entry) => entry.routineId === "r1")).toBe(true);
    expect(view.paused).toEqual([{ routineId: "r2", botId: "writer", routineName: "Routine r2" }]);
    expect(view.webhooks).toEqual([{ routineId: "r3", botId: "chief", routineName: "Routine r3" }]);
    const mine = service.view({ ...window, botId: "writer" });
    expect(mine.entries).toEqual([]);
    expect(mine.paused).toHaveLength(1);
    expect(mine.webhooks).toEqual([]);
  });

  it("starts the planned list from the next start the routine already has, and cuts a long list with a note", () => {
    const every = routine("r1", "chief", {
      schedule: { type: "interval", everyMinutes: 1 },
      nextRunAt: "2026-11-17T10:07:00.000Z",
    });
    const view = setup([every], []).view({ from: "2026-11-17T10:00:00Z", to: "2026-11-18T10:00:00Z" });
    expect(view.entries).toHaveLength(SCHEDULE_LIMITS.maxEntries);
    expect(view.entries[0]?.at).toBe("2026-11-17T10:07:00.000Z");
    expect(view.truncated).toBe(true);
  });

  it("refuses a bad window", () => {
    const service = setup([], []);
    expect(() => service.view({ from: "2026-11-20T00:00:00Z", to: "2026-11-16T00:00:00Z" })).toThrow();
    expect(() => service.view({ from: "2026-01-01T00:00:00Z", to: "2026-12-01T00:00:00Z" })).toThrow();
  });

  it("gives the latest runs of all routines as a feed, newest first, with names, one agent, and the next page", () => {
    const service = setup(
      [routine("r1", "chief"), routine("r2", "writer")],
      [
        run("x1", "r1", "chief", "2026-11-15T08:00:00.000Z"),
        run("x2", "r2", "writer", "2026-11-16T08:00:00.000Z", "failed"),
        run("x3", "r1", "chief", "2026-11-17T08:00:00.000Z"),
      ],
    );
    const feed = service.feed({ limit: 2 });
    expect(isScheduleFeed(feed)).toBe(true);
    expect(feed.map((item) => [item.run.id, item.routineName, item.agentName])).toEqual([
      ["x3", "Routine r1", "Chief"],
      ["x2", "Routine r2", null],
    ]);
    expect(service.feed({ botId: "chief" }).map((item) => item.run.id)).toEqual(["x3", "x1"]);
    expect(service.feed({ before: "2026-11-16T08:00:00Z" }).map((item) => item.run.id)).toEqual(["x1"]);
    expect(service.feed().length).toBe(3);
  });
});
