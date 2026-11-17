// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BudgetMeter } from "./budget-meter";
import { PersistentSplitTracker, splitFromTokenUsage } from "./budget-thread-split";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const folders: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function open(existing?: string) {
  const folder = existing ?? (await mkdtemp(join(tmpdir(), "cosgral-split-")));
  if (!existing) folders.push(folder);
  const database = testDatabase(join(folder, "data"));
  await database.initialize();
  return { folder, database };
}

describe("token split of a thread (W12 BE-I)", () => {
  it("reads the parts of what a provider reported and says nothing when it reported none", () => {
    expect(
      splitFromTokenUsage({
        totalTokens: 10,
        inputTokens: 6,
        cachedInputTokens: 2,
        outputTokens: 4,
        reasoningOutputTokens: 1,
      }),
    ).toEqual({
      input: 6,
      cached: 2,
      output: 4,
      reasoning: 1,
    });
    expect(splitFromTokenUsage({ inputTokens: 5 })).toEqual({ input: 5, cached: 0, output: 0, reasoning: 0 });
    expect(splitFromTokenUsage({ totalTokens: 10 })).toBeNull();
    expect(splitFromTokenUsage(null)).toBeNull();
    expect(splitFromTokenUsage({ inputTokens: -1, outputTokens: "x" })).toBeNull();
  });

  it("gives the use of each part since the last report, counts a restart once, and starts over after a compaction", async () => {
    const { folder, database } = await open();
    const tracker = new PersistentSplitTracker(database);
    expect(tracker.observe("t1", { input: 100, cached: 40, output: 20, reasoning: 5 })).toEqual({
      input: 100,
      cached: 40,
      output: 20,
      reasoning: 5,
    });
    expect(tracker.observe("t1", { input: 150, cached: 60, output: 30, reasoning: 5 })).toEqual({
      input: 50,
      cached: 20,
      output: 10,
      reasoning: 0,
    });
    const reopened = await open(folder);
    const again = new PersistentSplitTracker(reopened.database);
    expect(again.observe("t1", { input: 160, cached: 60, output: 35, reasoning: 5 })).toEqual({
      input: 10,
      cached: 0,
      output: 5,
      reasoning: 0,
    });
    expect(again.observe("t1", { input: 10, cached: 0, output: 5, reasoning: 0 })).toEqual({
      input: 10,
      cached: 0,
      output: 5,
      reasoning: 0,
    });
  });
});

describe("the counter keeps the use per model and per kind of token (W12 BE-I)", () => {
  it("records the detail of a turn with its model, adds turns of the same day and model, and reads it back by day", async () => {
    const { database } = await open();
    let now = new Date("2026-11-16T10:00:00.000Z");
    const meter = new BudgetMeter({ database, emit: () => undefined, now: () => now });
    meter.record({
      botId: "chief",
      tokens: 130,
      costUsd: null,
      detail: { model: "gpt-6-luna", split: { input: 100, cached: 40, output: 30, reasoning: 5 } },
    });
    meter.record({
      botId: "chief",
      tokens: 60,
      costUsd: null,
      detail: { model: "gpt-6-luna", split: { input: 50, cached: 0, output: 10, reasoning: 0 } },
    });
    meter.record({
      botId: "chief",
      tokens: 20,
      costUsd: null,
      detail: { model: "claude-haiku-5-5", split: { input: 15, cached: 5, output: 5, reasoning: 0 } },
    });
    meter.record({ botId: "chief", tokens: 7, costUsd: null });
    now = new Date("2026-11-17T10:00:00.000Z");
    meter.record({
      botId: "writer",
      tokens: 10,
      costUsd: null,
      detail: { model: "gpt-6-luna", split: { input: 8, cached: 0, output: 2, reasoning: 0 } },
    });
    const rows = meter.dailyDetail("2026-11-01");
    expect(rows).toEqual([
      {
        day: "2026-11-16",
        botId: "chief",
        model: "claude-haiku-5-5",
        turns: 1,
        input: 15,
        cached: 5,
        output: 5,
        reasoning: 0,
      },
      {
        day: "2026-11-16",
        botId: "chief",
        model: "gpt-6-luna",
        turns: 2,
        input: 150,
        cached: 40,
        output: 40,
        reasoning: 5,
      },
      {
        day: "2026-11-17",
        botId: "writer",
        model: "gpt-6-luna",
        turns: 1,
        input: 8,
        cached: 0,
        output: 2,
        reasoning: 0,
      },
    ]);
    expect(meter.dailyDetail("2026-11-17")).toHaveLength(1);
    expect(meter.firstDetailDay()).toBe("2026-11-16");
    expect(meter.dailyRows("2026-11-01").find((row) => row.day === "2026-11-16")?.tokens).toBe(217);
  });

  it("has no detail rows and no first day before anything was recorded with a split", async () => {
    const { database } = await open();
    const meter = new BudgetMeter({ database, emit: () => undefined });
    meter.record({ botId: "chief", tokens: 5, costUsd: null });
    expect(meter.dailyDetail("2020-01-01")).toEqual([]);
    expect(meter.firstDetailDay()).toBeNull();
  });
});
