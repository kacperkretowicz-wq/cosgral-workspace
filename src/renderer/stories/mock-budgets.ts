// COSGRAL W8-KK2: the budgets for Storybook and the preview. Demo data only. The same rules as the program (the shared
// contract rules): tokens always counted, dollars only from reported prices, a cost that is incomplete says so, a hard
// stop blocks new turns, and the CSV has no names or text. `simulate.record` plays a finished turn.

import {
  type AgentEvent,
  BUDGET_CSV_HEADER,
  type Budget,
  type BudgetOverview,
  type BudgetScope,
  type BudgetStatus,
  type BudgetsDesktopApi,
  type BudgetUsage,
  budgetDay,
  budgetPeriodDays,
  csvCell,
  defaultCheapFirst,
  evaluateBudget,
  parseClearBudgetInput,
  parseExportBudgetCsvInput,
  parseSetBudgetInput,
  scopeKey,
} from "@openbot/contracts/ipc";

export interface MockBudgets extends Required<BudgetsDesktopApi> {
  simulate: {
    /** A finished turn: tokens, and the price in dollars only when the provider reported one (else null). */
    record: (botId: string, tokens: number, costUsd: number | null) => void;
    /** Moves the clock (for period changes). */
    setNow: (at: Date) => void;
  };
}

interface Turn {
  day: string;
  botId: string;
  tokens: number;
  costUsd: number | null;
}

export function createMockBudgets(emit: (event: AgentEvent) => void): MockBudgets {
  const budgets = new Map<string, Budget>();
  const turns: Turn[] = [];
  let now = new Date("2026-11-16T12:00:00.000Z");

  const usageFor = (scope: BudgetScope, period: Budget["period"]): BudgetUsage => {
    const days = budgetPeriodDays(period, now);
    const inScope = turns.filter(
      (turn) =>
        turn.day >= days.start && turn.day <= days.end && (scope.kind === "space" || turn.botId === scope.botId),
    );
    const priced = inScope.filter((turn) => turn.costUsd !== null);
    return {
      periodStart: days.start,
      periodEnd: days.end,
      tokens: inScope.reduce((sum, turn) => sum + turn.tokens, 0),
      turns: inScope.length,
      costUsd: Math.round(priced.reduce((sum, turn) => sum + (turn.costUsd ?? 0), 0) * 1e6) / 1e6,
      pricedTurns: priced.length,
      costComplete: priced.length === inScope.length,
    };
  };
  const statusOf = (scope: BudgetScope): BudgetStatus => {
    const budget = budgets.get(scopeKey(scope)) ?? null;
    const usage = usageFor(scope, budget?.period ?? "month");
    return { scope, budget, usage, ...evaluateBudget(scope, budget, usage) };
  };
  const overview = (): BudgetOverview => {
    const ids = new Set<string>(turns.map((turn) => turn.botId));
    for (const budget of budgets.values()) if (budget.scope.kind === "agent") ids.add(budget.scope.botId);
    return {
      space: statusOf({ kind: "space" }),
      agents: [...ids].sort().map((botId) => statusOf({ kind: "agent", botId })),
    };
  };
  const publish = (): BudgetOverview => {
    const snapshot = overview();
    emit({ type: "budgets-changed", ...snapshot });
    return snapshot;
  };

  return {
    list: async () => overview(),
    set: async (rawInput) => {
      const input = parseSetBudgetInput(rawInput);
      const before = budgets.get(scopeKey(input.scope));
      budgets.set(scopeKey(input.scope), {
        scope: input.scope,
        period: input.period,
        tokenLimit: input.tokenLimit,
        costLimitUsd: input.costLimitUsd,
        hardStop: input.hardStop,
        warnPercent: input.warnPercent ?? before?.warnPercent ?? 80,
        cheapFirst: { ...(before?.cheapFirst ?? defaultCheapFirst()), ...input.cheapFirst },
      });
      return publish();
    },
    clear: async (rawInput) => {
      budgets.delete(scopeKey(parseClearBudgetInput(rawInput).scope));
      return publish();
    },
    exportCsv: async (rawInput) => {
      const range = parseExportBudgetCsvInput(rawInput);
      const lines = [BUDGET_CSV_HEADER];
      const days = [
        ...new Set(
          turns.filter((t) => t.day >= range.from && t.day <= range.to).map((t) => `${t.day}\u0000${t.botId}`),
        ),
      ].sort();
      for (const key of days) {
        const [day = "", botId = ""] = key.split("\u0000");
        const own = turns.filter((turn) => turn.day === day && turn.botId === botId);
        const priced = own.filter((turn) => turn.costUsd !== null);
        lines.push(
          [
            day,
            "agent",
            botId,
            own.reduce((sum, turn) => sum + turn.tokens, 0),
            own.length,
            priced.length === 0
              ? null
              : Math.round(priced.reduce((sum, turn) => sum + (turn.costUsd ?? 0), 0) * 1e6) / 1e6,
            priced.length === own.length,
          ]
            .map(csvCell)
            .join(","),
        );
      }
      return { fileName: `budget-${range.from}-${range.to}.csv`, csv: `${lines.join("\n")}\n`, rows: lines.length - 1 };
    },
    simulate: {
      record: (botId, tokens, costUsd) => {
        turns.push({ day: budgetDay(now), botId, tokens, costUsd });
        publish();
      },
      setNow: (at) => {
        now = at;
        publish();
      },
    },
  };
}
