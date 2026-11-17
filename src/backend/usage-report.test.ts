// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUsageReport } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { BudgetMeter } from "./budget-meter";
import { MachineLoadSampler } from "./machine-load";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { UsageReportService } from "./usage-report";

const folders: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function open() {
  const folder = await mkdtemp(join(tmpdir(), "cosgral-usage-"));
  folders.push(folder);
  const database = testDatabase(join(folder, "data"));
  await database.initialize();
  let now = new Date("2026-11-10T12:00:00.000Z");
  const meter = new BudgetMeter({ database, emit: () => undefined, now: () => now });
  const service = new UsageReportService({
    rows: (fromDay) => meter.dailyRows(fromDay),
    firstDay: () => meter.firstDay(),
    agentName: (botId) => (botId === "chief" ? "Chief" : null),
    providers: () => [{ provider: "codex", model: null, state: "ok", resetsAt: null, usedPercent: 10, reason: null }],
    machine: async () => ({ cpuPercent: 7, memoryPercent: 40 }),
    now: () => now,
  });
  return {
    meter,
    service,
    setNow: (at: string) => {
      now = new Date(at);
    },
  };
}

describe("UsageReportService (W12 BE-H)", () => {
  it("turns what the counter recorded into a report per day and per agent, with the limits and the load of the computer", async () => {
    const { meter, service, setNow } = await open();
    meter.record({ botId: "chief", tokens: 1_000, costUsd: 0.25 });
    meter.record({ botId: "chief", tokens: 500, costUsd: null });
    setNow("2026-11-12T09:00:00.000Z");
    meter.record({ botId: "writer", tokens: 4_000, costUsd: 0.5 });
    const report = await service.get({ period: 7 });
    expect(isUsageReport(report)).toBe(true);
    expect(report).toMatchObject({ period: 7, from: "2026-11-06", to: "2026-11-12", collectingSince: "2026-11-10" });
    expect(report.days.find((day) => day.day === "2026-11-10")).toMatchObject({
      tokens: 1_500,
      turns: 2,
      costUsd: 0.25,
      pricedTurns: 1,
    });
    expect(report.totals).toMatchObject({ tokens: 5_500, turns: 3, pricedTurns: 2, costComplete: false });
    expect(report.byAgent.map((row) => [row.botId, row.name, row.tokenShare])).toEqual([
      ["writer", null, 73],
      ["chief", "Chief", 27],
    ]);
    expect(report.machine).toEqual({ cpuPercent: 7, memoryPercent: 40 });
    expect(report.providers[0]?.provider).toBe("codex");
  });

  it("narrows to one agent, leaves out days before the period and says when nothing was counted", async () => {
    const { meter, service, setNow } = await open();
    expect((await service.get({ period: 30 })).collectingSince).toBeNull();
    meter.record({ botId: "chief", tokens: 100, costUsd: null });
    setNow("2026-11-20T12:00:00.000Z");
    meter.record({ botId: "writer", tokens: 200, costUsd: null });
    const week = await service.get({ period: 7, botId: "writer" });
    expect(week.totals.tokens).toBe(200);
    expect(week.byAgent.map((row) => row.botId)).toEqual(["writer"]);
    expect((await service.get({ period: 7 })).totals.tokens).toBe(200);
    expect((await service.get({ period: 30 })).totals.tokens).toBe(300);
    await expect(service.get({ period: 14 })).rejects.toThrow();
  });

  it("still answers when the load of the computer cannot be read", async () => {
    const { meter } = await open();
    const service = new UsageReportService({
      rows: (fromDay) => meter.dailyRows(fromDay),
      firstDay: () => meter.firstDay(),
      agentName: () => null,
      providers: () => {
        throw new Error("no providers yet");
      },
      machine: async () => {
        throw new Error("no sensor");
      },
    });
    const report = await service.get({ period: 7 });
    expect(report.machine).toEqual({ cpuPercent: null, memoryPercent: null });
    expect(report.providers).toEqual([]);
  });
});

describe("MachineLoadSampler (W12 BE-H)", () => {
  const cpu = (idle: number, busy: number) => [{ times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } }];

  it("computes the load between two readings and the memory in use", async () => {
    const readings = [cpu(100, 0), cpu(150, 50), cpu(150, 150)];
    let index = 0;
    const sampler = new MachineLoadSampler({
      cpus: () => readings[Math.min(index++, readings.length - 1)] ?? [],
      totalMemory: () => 1_000,
      freeMemory: () => 250,
      wait: async () => undefined,
    });
    expect(await sampler.read()).toEqual({ cpuPercent: 50, memoryPercent: 75 });
    expect(await sampler.read()).toEqual({ cpuPercent: 100, memoryPercent: 75 });
  });

  it("gives null for the load when nothing moved or the system says nothing", async () => {
    const still = new MachineLoadSampler({
      cpus: () => cpu(10, 10),
      totalMemory: () => 0,
      freeMemory: () => 0,
      wait: async () => undefined,
    });
    expect(await still.read()).toEqual({ cpuPercent: null, memoryPercent: null });
    const none = new MachineLoadSampler({
      cpus: () => [],
      totalMemory: () => 100,
      freeMemory: () => 100,
      wait: async () => undefined,
    });
    expect(await none.read()).toEqual({ cpuPercent: null, memoryPercent: 0 });
  });
});
