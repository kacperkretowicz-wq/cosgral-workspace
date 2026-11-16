// @vitest-environment node
// COSGRAL W6-BE2: the context of a conversation per thread: what the provider reported, the settings, the restart.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, isContextState } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { type ContextProvider, ContextStore, ContextTracker, canCompactProvider } from "./context-tracker";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const folders: string[] = [];

afterEach(async () => {
  closeTestDatabases();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function open(existing?: string) {
  const folder = existing ?? (await mkdtemp(join(tmpdir(), "context-tracker-")));
  if (!existing) folders.push(folder);
  const database = testDatabase(join(folder, "data"));
  await database.initialize();
  const events: AgentEvent[] = [];
  let tick = 0;
  const tracker = new ContextTracker({
    store: new ContextStore(database),
    emit: (event) => events.push(event),
    now: () => new Date(Date.parse("2026-11-16T12:00:00.000Z") + ++tick * 1000),
  });
  return { tracker, events, folder, database };
}

const changed = (events: AgentEvent[]) => events.filter((event) => event.type === "context-changed");

describe("context tracker (W6-BE2)", () => {
  it("without a report there are no numbers and a plain reason, per provider", async () => {
    const { tracker } = await open();
    for (const provider of ["codex", "claude", "acp", "endpoint"] as const) {
      const state = tracker.state("bot", "t1", provider);
      expect(isContextState(state)).toBe(true);
      expect(state).toMatchObject({ source: "unavailable", used: null, limit: null, percent: null, warning: false });
      expect(state.unavailableReason?.length).toBeGreaterThan(10);
      expect(state.canCompact).toBe(canCompactProvider(provider));
    }
    expect(tracker.state("bot", "t1", "claude").unavailableReason).toMatch(/Claude Code does not report/);
    expect(tracker.state("bot", "t1", "codex").canCompact).toBe(true);
    expect(tracker.state("bot", "t1", "claude").canCompact).toBe(false);
  });

  it("a report gives real numbers, a warning from 80 percent, and tells the window only when something changed", async () => {
    const { tracker, events } = await open();
    const first = tracker.report("bot", "t1", "codex", 40_000, 100_000);
    expect(first).toMatchObject({
      source: "reported",
      used: 40_000,
      limit: 100_000,
      percent: 40,
      warning: false,
      stale: false,
    });
    tracker.report("bot", "t1", "codex", 40_000, 100_000);
    expect(changed(events)).toHaveLength(1);
    const high = tracker.report("bot", "t1", "codex", 81_000, 100_000);
    expect(high).toMatchObject({ percent: 81, warning: true });
    expect(changed(events)).toHaveLength(2);
    expect(isContextState(high)).toBe(true);
  });

  it("ignores a report that is not a real pair of numbers (no invented 0 % or 100 %)", async () => {
    const { tracker, events } = await open();
    for (const [used, limit] of [
      [Number.NaN, 100],
      [10, 0],
      [10, -5],
      [-1, 100],
      [Number.POSITIVE_INFINITY, 100],
    ] as const) {
      expect(tracker.report("bot", "t1", "codex", used, limit).source).toBe("unavailable");
    }
    expect(changed(events)).toHaveLength(0);
  });

  it("two threads of one agent and two agents never mix", async () => {
    const { tracker } = await open();
    tracker.report("a", "t1", "codex", 10_000, 100_000);
    tracker.report("a", "t2", "codex", 90_000, 100_000);
    tracker.report("b", "t1", "codex", 30_000, 100_000);
    expect(tracker.state("a", "t1", "codex").percent).toBe(10);
    expect(tracker.state("a", "t2", "codex").percent).toBe(90);
    expect(tracker.state("b", "t1", "codex").percent).toBe(30);
    expect(tracker.state("b", "t2", "codex").source).toBe("unavailable");
  });

  it("a compaction is shown while it runs, counted when it ends, and the old numbers stay marked stale until the next report", async () => {
    const { tracker, events } = await open();
    tracker.report("bot", "t1", "codex", 92_000, 100_000);
    expect(tracker.setCompacting("bot", "t1", "codex", true).compacting).toBe(true);
    const done = tracker.compactionDone("bot", "t1", "codex");
    expect(done).toMatchObject({
      compacting: false,
      stale: true,
      compactions: 1,
      used: 92_000,
      lastCompactedFromTokens: 92_000,
    });
    expect(done.lastCompactedAt).not.toBeNull();
    const after = tracker.report("bot", "t1", "codex", 18_000, 100_000);
    expect(after).toMatchObject({ stale: false, percent: 18, compactions: 1, lastCompactedFromTokens: 92_000 });
    expect(changed(events).length).toBeGreaterThanOrEqual(4);
  });

  it("a compaction of a thread nothing was reported for is counted but invents no numbers", async () => {
    const { tracker } = await open();
    const state = tracker.compactionDone("bot", "t1", "codex");
    expect(state).toMatchObject({ source: "unavailable", compactions: 1, stale: false, used: null });
  });

  it("the state comes back after a restart (numbers, stale mark, counters); a running compaction does not", async () => {
    const first = await open();
    first.tracker.report("bot", "t1", "codex", 95_000, 100_000);
    first.tracker.setCompacting("bot", "t1", "codex", true);
    first.tracker.compactionDone("bot", "t1", "codex");
    first.tracker.setCompacting("bot", "t1", "codex", true);
    first.database.close();
    const second = await open(first.folder);
    const state = second.tracker.state("bot", "t1", "codex");
    expect(state).toMatchObject({ source: "reported", percent: 95, stale: true, compactions: 1, compacting: false });
    expect(state.lastCompactedAt).not.toBeNull();
  });

  it("history cleared: the thread's numbers and counters go, another thread keeps its own", async () => {
    const { tracker, events } = await open();
    tracker.report("bot", "t1", "codex", 50_000, 100_000);
    tracker.report("bot", "t2", "codex", 60_000, 100_000);
    tracker.compactionDone("bot", "t1", "codex");
    const cleared = tracker.forget("bot", "t1", "codex");
    expect(cleared).toMatchObject({ source: "unavailable", compactions: 0, used: null });
    expect(tracker.state("bot", "t2", "codex").percent).toBe(60);
    expect(changed(events).at(-1)).toMatchObject({ threadId: "t1", source: "unavailable" });
  });

  it("settings: default 90 percent and on; a change is kept after a restart and announced; a bad value is refused", async () => {
    const first = await open();
    expect(first.tracker.settings()).toEqual({ autoCompact: true, thresholdPercent: 90 });
    expect(first.tracker.updateSettings({ thresholdPercent: 75 })).toEqual({ autoCompact: true, thresholdPercent: 75 });
    expect(first.events.at(-1)).toMatchObject({ type: "context-settings-changed", thresholdPercent: 75 });
    expect(() => first.tracker.updateSettings({ thresholdPercent: 99 })).toThrow(/whole number/);
    expect(first.tracker.settings().thresholdPercent).toBe(75);
    first.tracker.updateSettings({ autoCompact: false });
    first.database.close();
    const second = await open(first.folder);
    expect(second.tracker.settings()).toEqual({ autoCompact: false, thresholdPercent: 75 });
  });

  it("automatic compaction follows the threshold and the switch", async () => {
    const { tracker } = await open();
    expect(tracker.shouldAutoCompact(89_999, 100_000)).toBe(false);
    expect(tracker.shouldAutoCompact(90_000, 100_000)).toBe(true);
    tracker.updateSettings({ thresholdPercent: 60 });
    expect(tracker.shouldAutoCompact(60_000, 100_000)).toBe(true);
    expect(tracker.shouldAutoCompact(59_000, 100_000)).toBe(false);
    tracker.updateSettings({ autoCompact: false });
    expect(tracker.shouldAutoCompact(99_000, 100_000)).toBe(false);
    expect(tracker.shouldAutoCompact(10, 0)).toBe(false);
  });

  it("only Codex can be asked to compact", () => {
    const providers: ContextProvider[] = ["codex", "claude", "acp", "endpoint"];
    expect(providers.filter(canCompactProvider)).toEqual(["codex"]);
  });
});
