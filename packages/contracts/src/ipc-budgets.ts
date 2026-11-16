// COSGRAL W8-KK2: budgets and the cost counter (spec-w8.md 1E, W8-25 ... W8-29; decisions Q6, Q7, Q11).
//
// A budget limits what an agent, or the whole space the program runs on, may use in a period (a day or a calendar month
// in UTC): a number of TOKENS and, only where the provider reports a price, DOLLARS (Q6). Nothing is guessed: a turn
// whose provider reported no price adds tokens but no dollars, the counter says the cost is incomplete, and a dollar
// limit that cannot be checked says so (`enforceable: false`) instead of pretending (W8-29).
//
// The stop is hard when the person chose it (`hardStop`): once a limit is reached no NEW paid turn starts and the reason
// is readable; a turn that is already running is not cut (it finishes, then the next one is refused). No silent
// "one more turn" (W8-26). The warning comes earlier (default 80 %).
//
// The budget decides the PREFERRED model first (Q7: `cheapFirst`), and only among the models the agent is already
// allowed to use (its own model and its fallback list); the account pool and the fallback lists of W5 work after that,
// unchanged. The policy never adds a model, an account or a permission (W8-27).
//
// The space budget belongs to the space the program runs on: spaces are separate data folders (ipc-spaces.ts), so a
// client's budget and counters are in that client's own database and never mix with another's.
//
// Everything here is about THIS computer only (a phone or a remote server may not call it).

import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isString } from "./runtime-values";

export const BUDGET_PERIODS = ["day", "month"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

/** ok: under the warning share (or no limit); warning: from the warning share; exhausted: a limit is reached. */
export const BUDGET_STATES = ["ok", "warning", "exhausted"] as const;
export type BudgetState = (typeof BUDGET_STATES)[number];

export const BUDGET_LIMITS = {
  defaultWarnPercent: 80,
  minWarnPercent: 50,
  maxWarnPercent: 99,
  /** Largest token limit (a safe whole number well below 2^53). */
  maxTokens: 1_000_000_000_000,
  /** Largest dollar limit. */
  maxCostUsd: 1_000_000,
  /** Rows of one CSV export (a year of days for 30 agents is far below this). */
  maxCsvRows: 20_000,
} as const;

export type BudgetScope = { kind: "space" } | { kind: "agent"; botId: string };

/** What the person set. A limit that is null is not checked. */
export interface Budget {
  scope: BudgetScope;
  period: BudgetPeriod;
  /** Tokens (input + output) allowed in the period; null = no token limit. */
  tokenLimit: number | null;
  /** Dollars allowed in the period, checked only against prices the provider reported; null = no dollar limit. */
  costLimitUsd: number | null;
  /** Refuse new paid turns when a limit is reached. false: only warn. */
  hardStop: boolean;
  /** The warning starts from this share of a limit. */
  warnPercent: number;
  /** Q7: prefer a cheaper model for simple work. */
  cheapFirst: CheapFirstPolicy;
}

export interface CheapFirstPolicy {
  enabled: boolean;
  /** The cheaper model; it is used only when it is already one of the agent's allowed models. */
  model: string | null;
  /** Also prefer it once the budget is in the warning state, whatever the work is. */
  onWarning: boolean;
}

export interface BudgetUsage {
  periodStart: string;
  periodEnd: string;
  tokens: number;
  turns: number;
  /** Dollars the providers reported; 0 when none did. */
  costUsd: number;
  /** Turns whose provider reported a price. */
  pricedTurns: number;
  /** false as soon as one turn of the period had no price: the dollar figure is then a lower bound, not the cost. */
  costComplete: boolean;
}

export interface BudgetStatus {
  scope: BudgetScope;
  /** null: no budget set (the counter still runs). */
  budget: Budget | null;
  usage: BudgetUsage;
  state: BudgetState;
  /** Whole percent of the token limit, capped at 100; null without a token limit. */
  tokenPercent: number | null;
  /** Whole percent of the dollar limit from reported prices; null without a dollar limit or without any price. */
  costPercent: number | null;
  /** A new paid turn would be refused now. */
  blocked: boolean;
  /** One plain sentence: why it is blocked or in warning, or why a limit cannot be checked; null when there is nothing to say. */
  reason: string | null;
  /** false: a dollar limit is set but no price has been reported, so only a token limit can stop anything. */
  enforceable: boolean;
}

export interface BudgetOverview {
  /** The budget and counter of the space the program runs on. */
  space: BudgetStatus;
  /** Every agent that has a budget or has used anything in its period, by name of id. */
  agents: BudgetStatus[];
}

export interface SetBudgetInput {
  scope: BudgetScope;
  period: BudgetPeriod;
  tokenLimit: number | null;
  costLimitUsd: number | null;
  hardStop: boolean;
  warnPercent?: number;
  cheapFirst?: Partial<CheapFirstPolicy>;
}

export interface ClearBudgetInput {
  scope: BudgetScope;
}

export interface ExportBudgetCsvInput {
  /** Inclusive days, `YYYY-MM-DD` (UTC). */
  from: string;
  to: string;
}

export interface BudgetCsv {
  fileName: string;
  /** The text of the file; the window saves it. No paths, no names of people, no message text. */
  csv: string;
  rows: number;
}

export interface BudgetsDesktopApi {
  list: () => Promise<BudgetOverview>;
  set: (input: SetBudgetInput) => Promise<BudgetOverview>;
  clear: (input: ClearBudgetInput) => Promise<BudgetOverview>;
  exportCsv: (input: ExportBudgetCsvInput) => Promise<BudgetCsv>;
}

/** Event `budgets-changed`: the whole overview (a limit was set or cleared, usage was counted, a state changed). */
export interface BudgetsChanged extends BudgetOverview {}

// --- rules shared by the engine and the mock ---

export function defaultCheapFirst(): CheapFirstPolicy {
  return { enabled: false, model: null, onWarning: false };
}

export function scopeKey(scope: BudgetScope): string {
  return scope.kind === "space" ? "space" : `agent:${scope.botId}`;
}

/** The day of a moment, `YYYY-MM-DD` in UTC. */
export function budgetDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** First and last day (inclusive) of the period that holds `at`. */
export function budgetPeriodDays(period: BudgetPeriod, at: Date): { start: string; end: string } {
  if (period === "day") return { start: budgetDay(at), end: budgetDay(at) };
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0));
  return { start: budgetDay(start), end: budgetDay(end) };
}

function percentOf(used: number, limit: number): number {
  return Math.min(100, Math.floor((used / limit) * 100));
}

/** The state, the blocking and the sentence for a budget and what was used. Pure: the engine and the mock share it. */
export function evaluateBudget(
  scope: BudgetScope,
  budget: Budget | null,
  usage: BudgetUsage,
): Pick<BudgetStatus, "state" | "tokenPercent" | "costPercent" | "blocked" | "reason" | "enforceable"> {
  if (!budget)
    return { state: "ok", tokenPercent: null, costPercent: null, blocked: false, reason: null, enforceable: true };
  const tokenPercent = budget.tokenLimit === null ? null : percentOf(usage.tokens, budget.tokenLimit);
  const costPercent =
    budget.costLimitUsd === null || usage.pricedTurns === 0
      ? null
      : budget.costLimitUsd === 0
        ? 100
        : percentOf(usage.costUsd, budget.costLimitUsd);
  const enforceable = budget.costLimitUsd === null || usage.pricedTurns > 0 || budget.tokenLimit !== null;
  const reached = (tokenPercent ?? 0) >= 100 || (costPercent ?? 0) >= 100;
  const warn = Math.max(tokenPercent ?? 0, costPercent ?? 0) >= budget.warnPercent;
  const state: BudgetState = reached ? "exhausted" : warn ? "warning" : "ok";
  const what = scope.kind === "space" ? "This space" : "This agent";
  const which =
    (tokenPercent ?? 0) >= 100 || (state !== "exhausted" && (tokenPercent ?? 0) >= (costPercent ?? 0))
      ? "token"
      : "dollar";
  let reason: string | null = null;
  if (state === "exhausted") {
    reason = `${what} has used its ${which} budget for the ${budget.period}.${budget.hardStop ? " New turns are not started until the period ends or the limit is raised." : ""}`;
  } else if (state === "warning") {
    reason = `${what} has used ${Math.max(tokenPercent ?? 0, costPercent ?? 0)} % of its ${which} budget for the ${budget.period}.`;
  } else if (budget.costLimitUsd !== null && usage.pricedTurns === 0 && budget.tokenLimit === null) {
    reason = "The provider reports no price, so a dollar limit cannot be checked. Set a token limit to stop spending.";
  }
  if (state === "ok" && budget.costLimitUsd !== null && !usage.costComplete && usage.pricedTurns > 0) {
    reason = "Some turns had no price from the provider, so the dollar figure is only a lower bound.";
  }
  return { state, tokenPercent, costPercent, blocked: state === "exhausted" && budget.hardStop, reason, enforceable };
}

/**
 * Q7: the PREFERRED model. Only among `allowed` (the agent's own model and its fallback list, in that order); the policy
 * never adds a model. The cheaper model is used for simple work, or in the warning state when `onWarning` is set;
 * otherwise the first allowed model is kept. The account pool and the fallback lists work after this, unchanged.
 */
export function preferredModel(input: {
  allowed: readonly string[];
  policy: CheapFirstPolicy;
  state: BudgetState;
  simpleWork: boolean;
}): string | null {
  const first = input.allowed[0] ?? null;
  const cheap = input.policy.model;
  if (!input.policy.enabled || cheap === null || !input.allowed.includes(cheap)) return first;
  const useCheap = input.simpleWork || (input.policy.onWarning && input.state !== "ok");
  return useCheap ? cheap : first;
}

/** A cell that starts like a formula is made harmless (spreadsheets run `=`, `+`, `-`, `@`, tab and CR cells). */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const BUDGET_CSV_HEADER = "day,scope,agent_id,tokens,turns,cost_usd,cost_complete";

// --- guards and parsers ---

function isScope(value: unknown): value is BudgetScope {
  if (!isDynamicRecord(value)) return false;
  if (value.kind === "space") return true;
  return value.kind === "agent" && isString(value.botId) && value.botId.length > 0 && value.botId.length <= 200;
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (isNumber(value) && Number.isFinite(value));
}

export function isBudgetUsage(value: unknown): value is BudgetUsage {
  if (!isDynamicRecord(value)) return false;
  return (
    isString(value.periodStart) &&
    isString(value.periodEnd) &&
    isNumber(value.tokens) &&
    value.tokens >= 0 &&
    isNumber(value.turns) &&
    value.turns >= 0 &&
    isNumber(value.costUsd) &&
    value.costUsd >= 0 &&
    isNumber(value.pricedTurns) &&
    value.pricedTurns >= 0 &&
    isBoolean(value.costComplete)
  );
}

function isCheapFirst(value: unknown): value is CheapFirstPolicy {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.enabled) &&
    (value.model === null || isString(value.model)) &&
    isBoolean(value.onWarning)
  );
}

export function isBudget(value: unknown): value is Budget {
  if (!isDynamicRecord(value)) return false;
  return (
    isScope(value.scope) &&
    BUDGET_PERIODS.some((period) => period === value.period) &&
    isNullableNumber(value.tokenLimit) &&
    isNullableNumber(value.costLimitUsd) &&
    isBoolean(value.hardStop) &&
    isNumber(value.warnPercent) &&
    isCheapFirst(value.cheapFirst)
  );
}

export function isBudgetStatus(value: unknown): value is BudgetStatus {
  if (!isDynamicRecord(value)) return false;
  const record: DynamicRecord = value;
  if (
    !(
      isScope(record.scope) &&
      (record.budget === null || isBudget(record.budget)) &&
      isBudgetUsage(record.usage) &&
      BUDGET_STATES.some((state) => state === record.state) &&
      isNullableNumber(record.tokenPercent) &&
      isNullableNumber(record.costPercent) &&
      isBoolean(record.blocked) &&
      (record.reason === null || isString(record.reason)) &&
      isBoolean(record.enforceable)
    )
  )
    return false;
  // A block needs a budget with a hard stop; an exhausted state needs a budget at all.
  if (record.blocked === true && !(isBudget(record.budget) && record.budget.hardStop && record.state === "exhausted"))
    return false;
  return record.budget !== null || record.state === "ok";
}

export function isBudgetOverview(value: unknown): value is BudgetOverview {
  return (
    isDynamicRecord(value) &&
    isBudgetStatus(value.space) &&
    Array.isArray(value.agents) &&
    value.agents.every(isBudgetStatus)
  );
}

export function isBudgetsChanged(value: unknown): value is BudgetsChanged & { type: "budgets-changed" } {
  return isDynamicRecord(value) && value.type === "budgets-changed" && isBudgetOverview(value);
}

export function isBudgetCsv(value: unknown): value is BudgetCsv {
  return (
    isDynamicRecord(value) && isString(value.fileName) && isString(value.csv) && isNumber(value.rows) && value.rows >= 0
  );
}

function parseScope(value: unknown): BudgetScope {
  if (!isScope(value)) throw new Error("A budget needs a scope: the space or one agent.");
  return value.kind === "space" ? { kind: "space" } : { kind: "agent", botId: value.botId };
}

function parseLimit(value: unknown, what: string, max: number, whole: boolean): number | null {
  if (value === null) return null;
  if (!isNumber(value) || !Number.isFinite(value) || value < 0 || value > max || (whole && !Number.isInteger(value))) {
    throw new Error(
      `The ${what} must be ${whole ? "a whole number" : "a number"} from 0 to ${max}, or empty for no limit.`,
    );
  }
  return value;
}

export function parseSetBudgetInput(input: unknown): SetBudgetInput {
  if (!isDynamicRecord(input)) throw new Error("The budget request is malformed.");
  const scope = parseScope(input.scope);
  const period = BUDGET_PERIODS.find((candidate) => candidate === input.period);
  if (!period) throw new Error("The period is a day or a month.");
  const tokenLimit = parseLimit(input.tokenLimit, "token limit", BUDGET_LIMITS.maxTokens, true);
  const costLimitUsd = parseLimit(input.costLimitUsd, "dollar limit", BUDGET_LIMITS.maxCostUsd, false);
  if (!isBoolean(input.hardStop)) throw new Error("Say whether new turns stop at the limit (true or false).");
  const parsed: SetBudgetInput = { scope, period, tokenLimit, costLimitUsd, hardStop: input.hardStop };
  if (input.warnPercent !== undefined) {
    const warn = input.warnPercent;
    if (
      !isNumber(warn) ||
      !Number.isInteger(warn) ||
      warn < BUDGET_LIMITS.minWarnPercent ||
      warn > BUDGET_LIMITS.maxWarnPercent
    ) {
      throw new Error(
        `The warning share is a whole number from ${BUDGET_LIMITS.minWarnPercent} to ${BUDGET_LIMITS.maxWarnPercent} percent.`,
      );
    }
    parsed.warnPercent = warn;
  }
  if (input.cheapFirst !== undefined) {
    if (!isDynamicRecord(input.cheapFirst)) throw new Error("The cheaper-model policy is malformed.");
    const policy: Partial<CheapFirstPolicy> = {};
    if (input.cheapFirst.enabled !== undefined) {
      if (!isBoolean(input.cheapFirst.enabled)) throw new Error("The cheaper-model switch is true or false.");
      policy.enabled = input.cheapFirst.enabled;
    }
    if (input.cheapFirst.onWarning !== undefined) {
      if (!isBoolean(input.cheapFirst.onWarning)) throw new Error("The cheaper-model switch is true or false.");
      policy.onWarning = input.cheapFirst.onWarning;
    }
    if (input.cheapFirst.model !== undefined) {
      const model = input.cheapFirst.model;
      if (model !== null && !(isString(model) && model.length > 0 && model.length <= 120))
        throw new Error("The cheaper model is a model name.");
      policy.model = model;
    }
    parsed.cheapFirst = policy;
  }
  return parsed;
}

export function parseClearBudgetInput(input: unknown): ClearBudgetInput {
  if (!isDynamicRecord(input)) throw new Error("The budget request is malformed.");
  return { scope: parseScope(input.scope) };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseExportBudgetCsvInput(input: unknown): ExportBudgetCsvInput {
  if (!isDynamicRecord(input) || !isString(input.from) || !isString(input.to))
    throw new Error("The export needs two days (YYYY-MM-DD).");
  const valid = (day: string) => DAY.test(day) && budgetDay(new Date(`${day}T00:00:00.000Z`)) === day;
  if (!valid(input.from) || !valid(input.to)) throw new Error("The export needs two real days (YYYY-MM-DD).");
  if (input.from > input.to) throw new Error("The first day of the export must not be after the last.");
  return { from: input.from, to: input.to };
}
