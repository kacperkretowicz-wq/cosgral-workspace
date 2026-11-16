// @vitest-environment node
import { type AgentEvent, isBudgetCsv, isBudgetOverview } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockBudgets } from "./mock-budgets";

const agent = { kind: "agent", botId: "chief" } as const;
const setup = () => {
  const events: AgentEvent[] = [];
  return { api: createMockBudgets((event) => events.push(event)), events };
};

describe("mock budgets (W8-KK2)", () => {
  it("starts empty and valid", async () => {
    const { api } = setup();
    const overview = await api.list();
    expect(isBudgetOverview(overview)).toBe(true);
    expect(overview.agents).toEqual([]);
    expect(overview.space).toMatchObject({ budget: null, state: "ok" });
  });

  it("counts tokens per agent and for the space; the agent budget moves ok > warning > exhausted and blocks", async () => {
    const { api, events } = setup();
    await api.set({ scope: agent, period: "month", tokenLimit: 1000, costLimitUsd: null, hardStop: true });
    api.simulate.record("chief", 500, null);
    api.simulate.record("scout", 200, null);
    expect((await api.list()).agents.find((a) => a.scope.kind === "agent" && a.scope.botId === "chief")).toMatchObject({
      state: "ok",
      usage: { tokens: 500 },
    });
    api.simulate.record("chief", 350, null);
    expect((await api.list()).agents[0]).toMatchObject({ state: "warning", blocked: false });
    api.simulate.record("chief", 200, null);
    expect((await api.list()).agents[0]).toMatchObject({ state: "exhausted", blocked: true });
    expect((await api.list()).space.usage.tokens).toBe(1250);
    expect(events.at(-1)).toMatchObject({ type: "budgets-changed" });
  });

  it("dollars: only reported prices count, the counter says when it is incomplete, no price = no stop by dollars", async () => {
    const { api } = setup();
    await api.set({ scope: agent, period: "month", tokenLimit: null, costLimitUsd: 1, hardStop: true });
    api.simulate.record("chief", 9000, null);
    expect((await api.list()).agents[0]).toMatchObject({
      state: "ok",
      blocked: false,
      enforceable: false,
      usage: { costUsd: 0, costComplete: false },
    });
    api.simulate.record("chief", 100, 0.4);
    expect((await api.list()).agents[0]).toMatchObject({
      costPercent: 40,
      usage: { costUsd: 0.4, costComplete: false },
    });
    api.simulate.record("chief", 100, 0.7);
    expect((await api.list()).agents[0]).toMatchObject({ state: "exhausted", blocked: true });
  });

  it("clear removes the limit and keeps the counter; a new period starts from zero", async () => {
    const { api } = setup();
    await api.set({ scope: { kind: "space" }, period: "day", tokenLimit: 100, costLimitUsd: null, hardStop: true });
    api.simulate.record("chief", 100, null);
    expect((await api.list()).space).toMatchObject({ state: "exhausted", blocked: true });
    api.simulate.setNow(new Date("2026-11-17T00:00:01Z"));
    expect((await api.list()).space).toMatchObject({ state: "ok", usage: { tokens: 0 } });
    api.simulate.setNow(new Date("2026-11-16T12:00:00Z"));
    expect((await api.clear({ scope: { kind: "space" } })).space).toMatchObject({
      budget: null,
      state: "ok",
      usage: { tokens: 100 },
    });
  });

  it("bad input is refused the way the program refuses it", async () => {
    const { api } = setup();
    await expect(
      api.set({ scope: agent, period: "month", tokenLimit: -5, costLimitUsd: null, hardStop: true }),
    ).rejects.toThrow(/token limit/);
    await expect(api.exportCsv({ from: "2026-11-30", to: "2026-11-01" })).rejects.toThrow(/not be after/);
  });

  it("the CSV has days, agent ids, tokens and prices only; an unknown price is empty, a formula-like id is made harmless", async () => {
    const { api } = setup();
    api.simulate.record("chief", 100, 0.25);
    api.simulate.record("chief", 50, null);
    api.simulate.record("=cmd", 10, null);
    const file = await api.exportCsv({ from: "2026-11-01", to: "2026-11-30" });
    expect(isBudgetCsv(file)).toBe(true);
    const lines = file.csv.trim().split("\n");
    expect(lines[0]).toBe("day,scope,agent_id,tokens,turns,cost_usd,cost_complete");
    expect(lines).toContain("2026-11-16,agent,chief,150,2,0.25,false");
    expect(lines).toContain("2026-11-16,agent,'=cmd,10,1,,false");
    expect(file.rows).toBe(2);
    expect(file.fileName).toBe("budget-2026-11-01-2026-11-30.csv");
    expect((await api.exportCsv({ from: "2026-01-01", to: "2026-01-31" })).rows).toBe(0);
  });
});
