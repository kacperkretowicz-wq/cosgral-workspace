// @vitest-environment node
// COSGRAL W8-KK2: the budgets and the cost counter on a real database: counting, the gate before a new turn, the state
// after a restart, prices that are not reported, the cheaper-model preference, the CSV, and two spaces never mixing.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, isBudgetCsv, isBudgetOverview } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { BudgetMeter, UsageDeltaTracker } from "./budget-meter";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const folders: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function open(existing?: string, clock = "2026-11-16T12:00:00.000Z") {
  const folder = existing ?? (await mkdtemp(join(tmpdir(), "cosgral-budgets-")));
  if (!existing) folders.push(folder);
  const database = testDatabase(join(folder, "data"));
  await database.initialize();
  const events: AgentEvent[] = [];
  let now = new Date(clock);
  const meter = new BudgetMeter({ database, emit: (event) => events.push(event), now: () => now });
  const setNow = (at: string) => {
    now = new Date(at);
  };
  return { meter, events, folder, database, setNow };
}

const agent = (botId: string) => ({ kind: "agent", botId }) as const;
const limitTokens = (
  botId: string,
  tokenLimit: number,
  extra: { hardStop?: boolean; costLimitUsd?: number | null } = {},
) => ({
  scope: agent(botId),
  period: "month" as const,
  tokenLimit,
  costLimitUsd: extra.costLimitUsd ?? null,
  hardStop: extra.hardStop ?? true,
});

describe("budget meter (W8-KK2)", () => {
  it("starts empty and valid, and creates its tables only when used", async () => {
    const { meter } = await open();
    const overview = meter.overview();
    expect(isBudgetOverview(overview)).toBe(true);
    expect(overview.agents).toEqual([]);
    expect(overview.space).toMatchObject({ budget: null, state: "ok", usage: { tokens: 0, turns: 0 } });
    expect(meter.gate("chief")).toEqual({ allowed: true, stoppedBy: null, reason: null });
  });

  it("counts tokens and turns per agent and for the space, and ignores nothing-turns and bad numbers", async () => {
    const { meter } = await open();
    meter.record({ botId: "chief", tokens: 300, costUsd: null });
    meter.record({ botId: "chief", tokens: 200.4, costUsd: null });
    meter.record({ botId: "scout", tokens: 50, costUsd: null });
    meter.record({ botId: "scout", tokens: Number.NaN, costUsd: null });
    meter.record({ botId: "scout", tokens: -5, costUsd: null });
    const overview = meter.overview();
    expect(overview.space.usage).toMatchObject({ tokens: 550, turns: 3 });
    expect(overview.agents.map((entry) => entry.scope)).toEqual([agent("chief"), agent("scout")]);
    expect(overview.agents[0]?.usage).toMatchObject({ tokens: 500, turns: 2 });
    expect(overview.agents[1]?.usage).toMatchObject({ tokens: 50, turns: 1 });
  });

  it("the gate: ok > warning > exhausted stops new turns of that agent only; a soft budget never stops", async () => {
    const { meter } = await open();
    meter.set(limitTokens("chief", 1000));
    meter.set(limitTokens("scout", 100, { hardStop: false }));
    meter.record({ botId: "chief", tokens: 850, costUsd: null });
    expect(meter.gate("chief").allowed).toBe(true);
    expect(meter.status(agent("chief")).state).toBe("warning");
    meter.record({ botId: "chief", tokens: 150, costUsd: null });
    const stopped = meter.gate("chief");
    expect(stopped).toMatchObject({ allowed: false, stoppedBy: "agent" });
    expect(stopped.reason).toMatch(/New turns are not started/);
    meter.record({ botId: "scout", tokens: 5000, costUsd: null });
    expect(meter.status(agent("scout"))).toMatchObject({ state: "exhausted", blocked: false });
    expect(meter.gate("scout").allowed).toBe(true);
    expect(meter.gate("other").allowed).toBe(true);
  });

  it("the space budget stops every agent of the space", async () => {
    const { meter } = await open();
    meter.set({ scope: { kind: "space" }, period: "day", tokenLimit: 100, costLimitUsd: null, hardStop: true });
    meter.record({ botId: "a", tokens: 60, costUsd: null });
    meter.record({ botId: "b", tokens: 40, costUsd: null });
    expect(meter.gate("a")).toMatchObject({ allowed: false, stoppedBy: "space" });
    expect(meter.gate("c")).toMatchObject({ allowed: false, stoppedBy: "space" });
    expect(meter.gate("c").reason).toMatch(/^This space/);
  });

  it("dollars come only from reported prices: no price = tokens only, the counter says it is incomplete, no dollar stop (W8-29)", async () => {
    const { meter } = await open();
    meter.set({ scope: agent("chief"), period: "month", tokenLimit: null, costLimitUsd: 1, hardStop: true });
    meter.record({ botId: "chief", tokens: 9_000_000, costUsd: null });
    const unpriced = meter.status(agent("chief"));
    expect(unpriced).toMatchObject({
      state: "ok",
      blocked: false,
      enforceable: false,
      usage: { costUsd: 0, pricedTurns: 0, costComplete: false },
    });
    expect(meter.gate("chief").allowed).toBe(true);
    meter.record({ botId: "chief", tokens: 10, costUsd: 0.4 });
    expect(meter.status(agent("chief"))).toMatchObject({
      costPercent: 40,
      usage: { costUsd: 0.4, pricedTurns: 1, costComplete: false },
    });
    meter.record({ botId: "chief", tokens: 10, costUsd: 0.6 });
    expect(meter.gate("chief")).toMatchObject({ allowed: false, stoppedBy: "agent" });
    // sums stay exact (millionths of a dollar)
    meter.record({ botId: "x", tokens: 1, costUsd: 0.1 });
    meter.record({ botId: "x", tokens: 1, costUsd: 0.2 });
    expect(meter.status(agent("x")).usage.costUsd).toBe(0.3);
    // a price that is not a number is the same as no price
    meter.record({ botId: "y", tokens: 5, costUsd: Number.NaN });
    expect(meter.status(agent("y")).usage).toMatchObject({ tokens: 5, costUsd: 0, pricedTurns: 0 });
  });

  it("a new period starts from zero: a day budget the next day, a month budget in the next month", async () => {
    const { meter, setNow } = await open();
    meter.set({ scope: agent("chief"), period: "day", tokenLimit: 100, costLimitUsd: null, hardStop: true });
    meter.record({ botId: "chief", tokens: 100, costUsd: null });
    expect(meter.gate("chief").allowed).toBe(false);
    setNow("2026-11-17T00:00:05.000Z");
    expect(meter.gate("chief").allowed).toBe(true);
    expect(meter.status(agent("chief")).usage.tokens).toBe(0);
    meter.set(limitTokens("chief", 100));
    meter.record({ botId: "chief", tokens: 100, costUsd: null });
    expect(meter.gate("chief").allowed).toBe(false);
    setNow("2026-12-01T00:00:05.000Z");
    expect(meter.gate("chief").allowed).toBe(true);
  });

  it("limits, usage and the stop are the same after a restart; clearing a budget keeps the counter", async () => {
    const first = await open();
    first.meter.set({ ...limitTokens("chief", 1000), cheapFirst: { enabled: true, model: "small", onWarning: true } });
    first.meter.record({ botId: "chief", tokens: 1000, costUsd: 0.5 });
    first.database.close();
    const second = await open(first.folder);
    expect(second.meter.gate("chief")).toMatchObject({ allowed: false, stoppedBy: "agent" });
    expect(second.meter.status(agent("chief"))).toMatchObject({
      usage: { tokens: 1000, costUsd: 0.5, pricedTurns: 1 },
      budget: { tokenLimit: 1000, cheapFirst: { enabled: true, model: "small", onWarning: true } },
    });
    const cleared = second.meter.clear({ scope: agent("chief") });
    expect(cleared.agents[0]).toMatchObject({ budget: null, usage: { tokens: 1000 } });
    expect(second.meter.gate("chief").allowed).toBe(true);
  });

  it("setting again keeps what was not said (the warning share and the cheaper-model policy) and tells the window", async () => {
    const { meter, events } = await open();
    meter.set({ ...limitTokens("chief", 1000), warnPercent: 60, cheapFirst: { enabled: true, model: "small" } });
    meter.set(limitTokens("chief", 2000));
    expect(meter.status(agent("chief")).budget).toMatchObject({
      tokenLimit: 2000,
      warnPercent: 60,
      cheapFirst: { enabled: true, model: "small", onWarning: false },
    });
    expect(events.filter((event) => event.type === "budgets-changed").length).toBe(2);
  });

  it("the window is told when usage changes, not when nothing did", async () => {
    const { meter, events } = await open();
    meter.record({ botId: "chief", tokens: 10, costUsd: null });
    meter.record({ botId: "chief", tokens: 0, costUsd: null });
    expect(events.filter((event) => event.type === "budgets-changed")).toHaveLength(1);
  });

  it("the cheaper model: only among the allowed ones, the agent's policy first, else the space's", async () => {
    const { meter } = await open();
    const allowed = ["big", "mid", "small"];
    expect(meter.preferred("chief", allowed, true)).toBe("big");
    meter.set({
      scope: { kind: "space" },
      period: "month",
      tokenLimit: null,
      costLimitUsd: null,
      hardStop: false,
      cheapFirst: { enabled: true, model: "small" },
    });
    expect(meter.preferred("chief", allowed, true)).toBe("small");
    expect(meter.preferred("chief", allowed, false)).toBe("big");
    expect(meter.preferred("chief", ["big", "mid"], true)).toBe("big");
    meter.set({
      ...limitTokens("chief", 100, { hardStop: false }),
      cheapFirst: { enabled: true, model: "mid", onWarning: true },
    });
    expect(meter.preferred("chief", allowed, true)).toBe("mid");
    meter.record({ botId: "chief", tokens: 90, costUsd: null });
    expect(meter.preferred("chief", allowed, false)).toBe("mid");
    expect(meter.preferred("chief", [], true)).toBeNull();
  });

  it("the CSV: days, agent ids, tokens and reported dollars only; unknown prices are empty; dangerous ids are made harmless", async () => {
    const { meter, setNow } = await open();
    meter.record({ botId: "chief", tokens: 100, costUsd: 0.25 });
    meter.record({ botId: "chief", tokens: 50, costUsd: null });
    meter.record({ botId: "=cmd", tokens: 10, costUsd: null });
    setNow("2026-11-17T10:00:00.000Z");
    meter.record({ botId: "chief", tokens: 7, costUsd: 0.5 });
    const file = meter.exportCsv({ from: "2026-11-01", to: "2026-11-30" });
    expect(isBudgetCsv(file)).toBe(true);
    const lines = file.csv.trim().split("\n");
    expect(lines).toEqual([
      "day,scope,agent_id,tokens,turns,cost_usd,cost_complete",
      "2026-11-16,agent,'=cmd,10,1,,false",
      "2026-11-16,agent,chief,150,2,0.25,false",
      "2026-11-17,agent,chief,7,1,0.5,true",
    ]);
    expect(file.rows).toBe(3);
    expect(meter.exportCsv({ from: "2026-11-17", to: "2026-11-17" }).rows).toBe(1);
    expect(meter.exportCsv({ from: "2025-01-01", to: "2025-01-31" })).toMatchObject({
      rows: 0,
      csv: "day,scope,agent_id,tokens,turns,cost_usd,cost_complete\n",
    });
    expect(file.csv).not.toMatch(/[A-Za-z]:\\|Users|password|secret/i);
  });

  it("two spaces are two databases: a budget and the usage of one are not in the other", async () => {
    const a = await open();
    const b = await open();
    a.meter.set({ scope: { kind: "space" }, period: "month", tokenLimit: 10, costLimitUsd: null, hardStop: true });
    a.meter.record({ botId: "chief", tokens: 10, costUsd: 1 });
    expect(a.meter.gate("chief").allowed).toBe(false);
    expect(b.meter.gate("chief").allowed).toBe(true);
    expect(b.meter.overview()).toMatchObject({ space: { budget: null, usage: { tokens: 0 } }, agents: [] });
    expect(b.meter.exportCsv({ from: "2026-11-01", to: "2026-11-30" }).rows).toBe(0);
  });

  it("a damaged stored budget is treated as not set, never as a guess", async () => {
    const { meter, database } = await open();
    meter.set(limitTokens("chief", 10));
    database.connection
      .prepare("UPDATE projection_budgets SET budget_json = ? WHERE scope = ?")
      .run('{"scope":"x"}', "agent:chief");
    meter.record({ botId: "chief", tokens: 1_000_000, costUsd: null });
    expect(meter.status(agent("chief")).budget).toBeNull();
    expect(meter.gate("chief").allowed).toBe(true);
  });
});

describe("usage delta tracker (W8-KK2)", () => {
  it("a new thread counts its whole total, then only what is new; a lower total starts again; a resumed thread is not recounted", () => {
    const tracker = new UsageDeltaTracker();
    expect(tracker.observeTotal("t1", 1000)).toBe(1000);
    expect(tracker.observeTotal("t1", 1800)).toBe(800);
    expect(tracker.observeTotal("t1", 1800)).toBe(0);
    expect(tracker.observeTotal("t1", 300)).toBe(300);
    tracker.baseline("resumed", 50_000);
    expect(tracker.observeTotal("resumed", 50_400)).toBe(400);
    expect(tracker.observeTotal("t2", 70)).toBe(70);
    expect(tracker.observeTotal("t1", Number.NaN)).toBe(0);
    expect(tracker.observeTotal("t1", -1)).toBe(0);
    tracker.forget("t1");
    expect(tracker.observeTotal("t1", 10)).toBe(10);
  });
});
