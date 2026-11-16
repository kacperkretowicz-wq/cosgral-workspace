import { describe, expect, it } from "vitest";
import {
  BUDGET_CSV_HEADER,
  type Budget,
  type BudgetUsage,
  budgetDay,
  budgetPeriodDays,
  csvCell,
  defaultCheapFirst,
  evaluateBudget,
  isBudgetOverview,
  isBudgetsChanged,
  parseClearBudgetInput,
  parseExportBudgetCsvInput,
  parseSetBudgetInput,
  preferredModel,
  scopeKey,
} from "./ipc-budgets";
import { isAgentEvent } from "./ipc-conversation";

const agent = { kind: "agent", botId: "chief" } as const;
const usage = (patch: Partial<BudgetUsage> = {}): BudgetUsage => ({
  periodStart: "2026-11-01",
  periodEnd: "2026-11-30",
  tokens: 0,
  turns: 0,
  costUsd: 0,
  pricedTurns: 0,
  costComplete: true,
  ...patch,
});
const budget = (patch: Partial<Budget> = {}): Budget => ({
  scope: agent,
  period: "month",
  tokenLimit: 1000,
  costLimitUsd: null,
  hardStop: true,
  warnPercent: 80,
  cheapFirst: defaultCheapFirst(),
  ...patch,
});

describe("budget contract (W8-KK2)", () => {
  it("periods: a day is one day, a month is the calendar month in UTC (also February and December)", () => {
    expect(budgetPeriodDays("day", new Date("2026-11-16T23:59:59Z"))).toEqual({
      start: "2026-11-16",
      end: "2026-11-16",
    });
    expect(budgetPeriodDays("month", new Date("2026-11-16T12:00:00Z"))).toEqual({
      start: "2026-11-01",
      end: "2026-11-30",
    });
    expect(budgetPeriodDays("month", new Date("2028-02-10T00:00:00Z"))).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    expect(budgetPeriodDays("month", new Date("2026-12-31T23:00:00Z"))).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
    expect(budgetDay(new Date("2026-11-16T00:00:00Z"))).toBe("2026-11-16");
  });

  it("no budget: ok, nothing blocked, a counter only", () => {
    expect(evaluateBudget(agent, null, usage({ tokens: 5_000_000 }))).toMatchObject({
      state: "ok",
      blocked: false,
      reason: null,
    });
  });

  it("tokens: ok, then warning from the share, then exhausted; a hard stop blocks and a soft one only warns", () => {
    expect(evaluateBudget(agent, budget(), usage({ tokens: 799 })).state).toBe("ok");
    const warning = evaluateBudget(agent, budget(), usage({ tokens: 800 }));
    expect(warning).toMatchObject({ state: "warning", blocked: false, tokenPercent: 80 });
    expect(warning.reason).toMatch(/80 % of its token budget/);
    const stopped = evaluateBudget(agent, budget(), usage({ tokens: 1000 }));
    expect(stopped).toMatchObject({ state: "exhausted", blocked: true, tokenPercent: 100 });
    expect(stopped.reason).toMatch(/New turns are not started/);
    const soft = evaluateBudget(agent, budget({ hardStop: false }), usage({ tokens: 5000 }));
    expect(soft).toMatchObject({ state: "exhausted", blocked: false, tokenPercent: 100 });
    expect(soft.reason).not.toMatch(/not started/);
    expect(
      evaluateBudget({ kind: "space" }, budget({ scope: { kind: "space" } }), usage({ tokens: 1000 })).reason,
    ).toMatch(/^This space/);
  });

  it("dollars count only prices the provider reported; without any price a dollar limit cannot stop anything (W8-29)", () => {
    const onlyDollars = budget({ tokenLimit: null, costLimitUsd: 10 });
    const unpriced = evaluateBudget(agent, onlyDollars, usage({ tokens: 9_999_999, turns: 40, costComplete: false }));
    expect(unpriced).toMatchObject({ state: "ok", blocked: false, costPercent: null, enforceable: false });
    expect(unpriced.reason).toMatch(/reports no price/);
    expect(evaluateBudget(agent, onlyDollars, usage({ costUsd: 10, pricedTurns: 3, turns: 3 }))).toMatchObject({
      state: "exhausted",
      blocked: true,
      costPercent: 100,
    });
    const partial = evaluateBudget(
      agent,
      onlyDollars,
      usage({ costUsd: 1, pricedTurns: 1, turns: 3, costComplete: false }),
    );
    expect(partial).toMatchObject({ state: "ok", costPercent: 10 });
    expect(partial.reason).toMatch(/lower bound/);
    // with a token limit as well, tokens still stop even when no price ever comes
    expect(
      evaluateBudget(agent, budget({ costLimitUsd: 10 }), usage({ tokens: 1000, costComplete: false })).blocked,
    ).toBe(true);
    expect(
      evaluateBudget(agent, budget({ tokenLimit: null, costLimitUsd: 0 }), usage({ pricedTurns: 1, turns: 1 })).blocked,
    ).toBe(true);
  });

  it("the cheaper model is preferred only among the allowed ones and never adds one (W8-27)", () => {
    const allowed = ["big", "mid", "small"];
    const on = { enabled: true, model: "small", onWarning: false };
    expect(preferredModel({ allowed, policy: on, state: "ok", simpleWork: false })).toBe("big");
    expect(preferredModel({ allowed, policy: on, state: "ok", simpleWork: true })).toBe("small");
    expect(preferredModel({ allowed, policy: { ...on, onWarning: true }, state: "warning", simpleWork: false })).toBe(
      "small",
    );
    expect(preferredModel({ allowed, policy: { ...on, onWarning: true }, state: "ok", simpleWork: false })).toBe("big");
    expect(preferredModel({ allowed: ["big", "mid"], policy: on, state: "exhausted", simpleWork: true })).toBe("big");
    expect(preferredModel({ allowed, policy: { ...on, enabled: false }, state: "warning", simpleWork: true })).toBe(
      "big",
    );
    expect(preferredModel({ allowed, policy: { ...on, model: null }, state: "ok", simpleWork: true })).toBe("big");
    expect(preferredModel({ allowed: [], policy: on, state: "ok", simpleWork: true })).toBeNull();
  });

  it("CSV cells cannot run as formulas and are quoted when needed", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@SUM")).toBe("'@SUM");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(true)).toBe("true");
    expect(BUDGET_CSV_HEADER.split(",")).toHaveLength(7);
  });

  it("set: limits are whole tokens or dollars or empty, a hard stop must be said, bad values are refused", () => {
    const ok = parseSetBudgetInput({
      scope: agent,
      period: "day",
      tokenLimit: 5000,
      costLimitUsd: 2.5,
      hardStop: true,
    });
    expect(ok).toMatchObject({ period: "day", tokenLimit: 5000, costLimitUsd: 2.5, hardStop: true });
    expect(
      parseSetBudgetInput({
        scope: { kind: "space" },
        period: "month",
        tokenLimit: null,
        costLimitUsd: null,
        hardStop: false,
      }).scope,
    ).toEqual({ kind: "space" });
    for (const bad of [
      { tokenLimit: -1 },
      { tokenLimit: 1.5 },
      { tokenLimit: 1e13 },
      { tokenLimit: "5" },
      { costLimitUsd: -0.01 },
      { costLimitUsd: Number.NaN },
      { hardStop: "yes" },
      { period: "year" },
      { scope: { kind: "agent", botId: "" } },
      { scope: { kind: "team" } },
      { warnPercent: 49 },
      { warnPercent: 99.5 },
      { cheapFirst: { enabled: "on" } },
      { cheapFirst: { model: "" } },
    ]) {
      expect(() =>
        parseSetBudgetInput({ scope: agent, period: "day", tokenLimit: 1, costLimitUsd: null, hardStop: true, ...bad }),
      ).toThrow();
    }
    expect(() => parseSetBudgetInput(null)).toThrow(/malformed/);
    expect(
      parseSetBudgetInput({
        scope: agent,
        period: "day",
        tokenLimit: 1,
        costLimitUsd: null,
        hardStop: true,
        cheapFirst: { enabled: true, model: "small" },
      }).cheapFirst,
    ).toEqual({ enabled: true, model: "small" });
    expect(parseClearBudgetInput({ scope: agent })).toEqual({ scope: agent });
    expect(scopeKey(agent)).toBe("agent:chief");
    expect(scopeKey({ kind: "space" })).toBe("space");
  });

  it("export: two real days in order", () => {
    expect(parseExportBudgetCsvInput({ from: "2026-11-01", to: "2026-11-30" })).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    for (const bad of [
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2026-11-30", to: "2026-11-01" },
      { from: "yesterday", to: "today" },
      { from: 1, to: 2 },
    ]) {
      expect(() => parseExportBudgetCsvInput(bad)).toThrow();
    }
  });

  it("a status that claims a block without a hard-stop budget is not valid; the event is in the agent event union", () => {
    const status = {
      scope: agent,
      budget: budget(),
      usage: usage({ tokens: 1000 }),
      ...evaluateBudget(agent, budget(), usage({ tokens: 1000 })),
    };
    const overview = {
      space: {
        ...status,
        scope: { kind: "space" as const },
        budget: null,
        state: "ok" as const,
        blocked: false,
        reason: null,
        tokenPercent: null,
        costPercent: null,
        enforceable: true,
      },
      agents: [status],
    };
    expect(isBudgetOverview(overview)).toBe(true);
    expect(isBudgetsChanged({ type: "budgets-changed", ...overview })).toBe(true);
    expect(isAgentEvent({ type: "budgets-changed", ...overview })).toBe(true);
    expect(isBudgetOverview({ ...overview, agents: [{ ...status, budget: budget({ hardStop: false }) }] })).toBe(false);
    expect(
      isBudgetOverview({ ...overview, agents: [{ ...status, budget: null, state: "exhausted", blocked: false }] }),
    ).toBe(false);
    expect(isAgentEvent({ type: "budgets-changed", space: 1, agents: [] })).toBe(false);
  });
});
