// COSGRAL W8-KK2: the budgets and the cost counter of this computer (spec-w8.md 1E; contract: ipc-budgets.ts).
//
// What it keeps, in the database of the space the program runs on (a client space is its own database, so a client's
// counters and budgets never mix with another's):
//   projection_budget_usage   one row per day and agent: tokens, turns, dollars the provider REPORTED (in millionths of a
//                             dollar, so sums stay exact) and how many turns had a price;
//   projection_budgets        the budget of the space and of each agent (JSON).
// Tables are created on first use (the shared schema stays untouched).
//
// What it does NOT do: it does not read anything from a provider. The engine tells it what a finished turn used
// (`record`) and asks it before a new paid turn starts (`gate`). A turn without a price adds tokens and no dollars; the
// counter then says the dollar figure is incomplete (W8-29). The two calls are the hook in agent-service.ts, described in
// docs/cosgral-raporty/kk-w8-kk2.md; this class never touches a running turn.

import {
  type AgentEvent,
  BUDGET_CSV_HEADER,
  BUDGET_LIMITS,
  type Budget,
  type BudgetCsv,
  type BudgetOverview,
  type BudgetScope,
  type BudgetStatus,
  type BudgetUsage,
  budgetDay,
  budgetPeriodDays,
  type ClearBudgetInput,
  csvCell,
  defaultCheapFirst,
  type ExportBudgetCsvInput,
  evaluateBudget,
  isBudget,
  preferredModel,
  type SetBudgetInput,
  scopeKey,
  type UsageRow,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_budget_usage (
    day TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    tokens INTEGER NOT NULL DEFAULT 0,
    turns INTEGER NOT NULL DEFAULT 0,
    cost_micro INTEGER NOT NULL DEFAULT 0,
    priced_turns INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, agent_id)
  );
  CREATE TABLE IF NOT EXISTS projection_budgets (
    scope TEXT PRIMARY KEY,
    budget_json TEXT NOT NULL CHECK(json_valid(budget_json))
  );
`;

/** Millionths of a dollar per dollar. */
const MICRO = 1_000_000;

export interface RecordedTurn {
  botId: string;
  /** Tokens of the turn (input + output); counted as a whole number. */
  tokens: number;
  /** Dollars the provider reported for the turn; null when it reported none (never a guess). */
  costUsd: number | null;
}

/** What the engine asks before it starts a new paid turn. */
export interface BudgetGate {
  allowed: boolean;
  /** Which budget stopped it; null when allowed. */
  stoppedBy: "agent" | "space" | null;
  /** One plain sentence for the person (a card or the queue); null when allowed. */
  reason: string | null;
}

export interface BudgetMeterOptions {
  database: OpenBotDatabase;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
}

export class BudgetMeter {
  readonly #database: OpenBotDatabase;
  readonly #emit: (event: AgentEvent) => void;
  readonly #now: () => Date;
  #ready = false;
  #told = "";

  constructor(options: BudgetMeterOptions) {
    this.#database = options.database;
    this.#emit = options.emit;
    this.#now = options.now ?? (() => new Date());
  }

  overview(): BudgetOverview {
    const ids = new Set<string>();
    const rows = this.#db()
      .prepare("SELECT DISTINCT agent_id FROM projection_budget_usage WHERE day >= ?")
      .all(this.#oldestDayToShow());
    for (const row of rows) if (isDynamicRecord(row) && isString(row.agent_id)) ids.add(row.agent_id);
    for (const budget of this.#budgets()) if (budget.scope.kind === "agent") ids.add(budget.scope.botId);
    return {
      space: this.status({ kind: "space" }),
      agents: [...ids].sort().map((botId) => this.status({ kind: "agent", botId })),
    };
  }

  status(scope: BudgetScope): BudgetStatus {
    const budget = this.#budget(scope);
    const usage = this.#usage(scope, budget?.period ?? "month");
    return { scope, budget, usage, ...evaluateBudget(scope, budget, usage) };
  }

  set(input: SetBudgetInput): BudgetOverview {
    const before = this.#budget(input.scope);
    const budget: Budget = {
      scope: input.scope,
      period: input.period,
      tokenLimit: input.tokenLimit,
      costLimitUsd: input.costLimitUsd,
      hardStop: input.hardStop,
      warnPercent: input.warnPercent ?? before?.warnPercent ?? BUDGET_LIMITS.defaultWarnPercent,
      cheapFirst: { ...(before?.cheapFirst ?? defaultCheapFirst()), ...input.cheapFirst },
    };
    this.#db()
      .prepare(
        `INSERT INTO projection_budgets (scope, budget_json) VALUES (?, ?)
         ON CONFLICT(scope) DO UPDATE SET budget_json = excluded.budget_json`,
      )
      .run(scopeKey(input.scope), JSON.stringify(budget));
    return this.#publish(true);
  }

  clear(input: ClearBudgetInput): BudgetOverview {
    this.#db().prepare("DELETE FROM projection_budgets WHERE scope = ?").run(scopeKey(input.scope));
    return this.#publish(true);
  }

  /** A finished turn. Tokens always; dollars only when the provider reported a price. Nothing else is stored about it. */
  record(turn: RecordedTurn): void {
    const tokens = Number.isFinite(turn.tokens) && turn.tokens > 0 ? Math.round(turn.tokens) : 0;
    const priced = turn.costUsd !== null && Number.isFinite(turn.costUsd) && turn.costUsd >= 0;
    if (tokens === 0 && !priced) return;
    this.#db()
      .prepare(
        `INSERT INTO projection_budget_usage (day, agent_id, tokens, turns, cost_micro, priced_turns)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(day, agent_id) DO UPDATE SET
           tokens = tokens + excluded.tokens, turns = turns + 1,
           cost_micro = cost_micro + excluded.cost_micro, priced_turns = priced_turns + excluded.priced_turns`,
      )
      .run(
        budgetDay(this.#now()),
        turn.botId,
        tokens,
        priced ? Math.round((turn.costUsd ?? 0) * MICRO) : 0,
        priced ? 1 : 0,
      );
    this.#publish(false);
  }

  /** May a NEW paid turn of this agent start? A running turn is never cut: this is asked only before a start. */
  gate(botId: string): BudgetGate {
    const agent = this.status({ kind: "agent", botId });
    if (agent.blocked) return { allowed: false, stoppedBy: "agent", reason: agent.reason };
    const space = this.status({ kind: "space" });
    if (space.blocked) return { allowed: false, stoppedBy: "space", reason: space.reason };
    return { allowed: true, stoppedBy: null, reason: null };
  }

  /** Q7: the preferred model among the allowed ones (the agent's own policy first, else the space's); never adds one. */
  preferred(botId: string, allowed: readonly string[], simpleWork: boolean): string | null {
    const agent = this.status({ kind: "agent", botId });
    const space = this.status({ kind: "space" });
    const source = agent.budget?.cheapFirst.enabled ? agent : space;
    return preferredModel({
      allowed,
      policy: source.budget?.cheapFirst ?? defaultCheapFirst(),
      state: agent.state === "ok" ? space.state : agent.state,
      simpleWork,
    });
  }

  /** The days of a range, one row per day and agent: ids, tokens, turns, reported dollars. No names, no text, no paths. */
  exportCsv(range: ExportBudgetCsvInput): BudgetCsv {
    const rows = this.#db()
      .prepare(
        `SELECT day, agent_id, tokens, turns, cost_micro, priced_turns FROM projection_budget_usage
         WHERE day >= ? AND day <= ? ORDER BY day, agent_id LIMIT ?`,
      )
      .all(range.from, range.to, BUDGET_LIMITS.maxCsvRows + 1);
    if (rows.length > BUDGET_LIMITS.maxCsvRows)
      throw new Error("This export would be too large: choose a shorter range of days.");
    const lines = [BUDGET_CSV_HEADER];
    for (const row of rows) {
      if (!isDynamicRecord(row) || !isString(row.day) || !isString(row.agent_id))
        throw new Error("A stored usage row is malformed.");
      const turns = numberOf(row.turns);
      const priced = numberOf(row.priced_turns);
      lines.push(
        [
          row.day,
          "agent",
          row.agent_id,
          numberOf(row.tokens),
          turns,
          priced === 0 ? null : numberOf(row.cost_micro) / MICRO,
          priced === turns,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    return { fileName: `budget-${range.from}-${range.to}.csv`, csv: `${lines.join("\n")}\n`, rows: lines.length - 1 };
  }

  // --- internals ---

  #db() {
    const connection = this.#database.connection;
    if (!this.#ready) {
      connection.exec(SCHEMA);
      this.#ready = true;
    }
    return connection;
  }

  #budget(scope: BudgetScope): Budget | null {
    const row = this.#db().prepare("SELECT budget_json FROM projection_budgets WHERE scope = ?").get(scopeKey(scope));
    return isDynamicRecord(row) && isString(row.budget_json) ? parseBudget(row.budget_json, scope) : null;
  }

  #budgets(): Budget[] {
    const out: Budget[] = [];
    for (const row of this.#db().prepare("SELECT scope, budget_json FROM projection_budgets").all()) {
      if (!isDynamicRecord(row) || !isString(row.budget_json)) continue;
      const budget = parseBudget(row.budget_json, null);
      if (budget) out.push(budget);
    }
    return out;
  }

  #usage(scope: BudgetScope, period: Budget["period"]): BudgetUsage {
    const days = budgetPeriodDays(period, this.#now());
    const agent = scope.kind === "agent" ? scope.botId : null;
    const row = this.#db()
      .prepare(
        `SELECT COALESCE(SUM(tokens), 0) AS tokens, COALESCE(SUM(turns), 0) AS turns,
                COALESCE(SUM(cost_micro), 0) AS cost_micro, COALESCE(SUM(priced_turns), 0) AS priced_turns
         FROM projection_budget_usage WHERE day >= ? AND day <= ? AND (? IS NULL OR agent_id = ?)`,
      )
      .get(days.start, days.end, agent, agent);
    const record = isDynamicRecord(row) ? row : {};
    const turns = numberOf(record.turns);
    const pricedTurns = numberOf(record.priced_turns);
    return {
      periodStart: days.start,
      periodEnd: days.end,
      tokens: numberOf(record.tokens),
      turns,
      costUsd: numberOf(record.cost_micro) / MICRO,
      pricedTurns,
      costComplete: pricedTurns === turns,
    };
  }

  /** COSGRAL W12: the counter rows (one per day and agent) from `fromDay` (`YYYY-MM-DD`) on, for the usage report. */
  dailyRows(fromDay: string): UsageRow[] {
    return this.#db()
      .prepare(
        "SELECT day, agent_id, tokens, turns, cost_micro, priced_turns FROM projection_budget_usage WHERE day >= ? ORDER BY day, agent_id",
      )
      .all(fromDay)
      .flatMap((row) =>
        isDynamicRecord(row) && isString(row.day) && isString(row.agent_id)
          ? [
              {
                day: row.day,
                botId: row.agent_id,
                tokens: numberOf(row.tokens),
                turns: numberOf(row.turns),
                costUsd: numberOf(row.cost_micro) / MICRO,
                pricedTurns: numberOf(row.priced_turns),
              },
            ]
          : [],
      );
  }

  /** COSGRAL W12: the first day anything was counted; null when nothing was. */
  firstDay(): string | null {
    const row = this.#db().prepare("SELECT MIN(day) AS day FROM projection_budget_usage").get();
    return isDynamicRecord(row) && isString(row.day) ? row.day : null;
  }

  /** Agents that used something this month still show (the longest period); older ones show only with a budget. */
  #oldestDayToShow(): string {
    return budgetPeriodDays("month", this.#now()).start;
  }

  #publish(force: boolean): BudgetOverview {
    const overview = this.overview();
    const fingerprint = JSON.stringify(overview);
    if (force || fingerprint !== this.#told) {
      this.#told = fingerprint;
      this.#emit({ type: "budgets-changed", ...overview });
    }
    return overview;
  }
}

function numberOf(value: unknown): number {
  return isNumber(value) && Number.isFinite(value) ? value : 0;
}

/** A stored budget, or null when it is damaged or of another scope (it is then treated as not set, never as a guess). */
function parseBudget(json: string, scope: BudgetScope | null): Budget | null {
  try {
    const parsed = JSON.parse(json);
    if (!isBudget(parsed)) return null;
    if (scope && scopeKey(parsed.scope) !== scopeKey(scope)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The engine reports the running total of a thread (Codex: `tokenUsage.total.totalTokens`, growing with the thread).
 * This gives the tokens USED SINCE THE LAST REPORT of that thread, so a turn is counted once.
 * - A thread not seen yet is a NEW thread: its whole total is its use.
 * - A thread that is RESUMED (after a restart it already has a total) gets `baseline` first, so what it used before is
 *   not counted again.
 * - A total that goes down (a compaction restarted the count) is a new start: its whole value is the new use.
 */
export class UsageDeltaTracker {
  readonly #last = new Map<string, number>();

  baseline(threadKey: string, total: number): void {
    if (Number.isFinite(total) && total >= 0) this.#last.set(threadKey, total);
  }

  observeTotal(threadKey: string, total: number): number {
    if (!Number.isFinite(total) || total < 0) return 0;
    const before = this.#last.get(threadKey) ?? 0;
    this.#last.set(threadKey, total);
    return total >= before ? total - before : total;
  }

  forget(threadKey: string): void {
    this.#last.delete(threadKey);
  }
}
