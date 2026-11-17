// COSGRAL W12 (BE-I): what a thread used by KIND of token (input, cached input, output, reasoning), for the usage screen. A provider
// reports running totals per thread; this turns them into the use since the last report, like the total of the budgets does
// (`PersistentUsageTracker`): a restart counts a thread once (the last totals are kept), and a total that goes down (a compaction) starts
// over. A provider that reports no parts gives null and the turn is counted by its total only.

import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { UsageDeltaTracker } from "./budget-meter";
import type { OpenBotDatabase } from "./openbot-database";

export interface TokenSplit {
  input: number;
  /** Part of the input that came from the provider's cache. */
  cached: number;
  output: number;
  reasoning: number;
}

const KINDS = ["input", "cached", "output", "reasoning"] as const;

function part(value: unknown): number | null {
  return isNumber(value) && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** The parts in a running-total record of a provider (`inputTokens`, `cachedInputTokens`, `outputTokens`, `reasoningOutputTokens`). */
export function splitFromTokenUsage(total: unknown): TokenSplit | null {
  if (!isDynamicRecord(total)) return null;
  const parts = {
    input: part(total.inputTokens),
    cached: part(total.cachedInputTokens),
    output: part(total.outputTokens),
    reasoning: part(total.reasoningOutputTokens),
  };
  if (Object.values(parts).every((value) => value === null)) return null;
  return {
    input: parts.input ?? 0,
    cached: parts.cached ?? 0,
    output: parts.output ?? 0,
    reasoning: parts.reasoning ?? 0,
  };
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_budget_thread_split (
    thread_id TEXT PRIMARY KEY,
    input INTEGER NOT NULL DEFAULT 0,
    cached INTEGER NOT NULL DEFAULT 0,
    output INTEGER NOT NULL DEFAULT 0,
    reasoning INTEGER NOT NULL DEFAULT 0
  );
`;

export class PersistentSplitTracker {
  readonly #database: OpenBotDatabase;
  readonly #trackers = {
    input: new UsageDeltaTracker(),
    cached: new UsageDeltaTracker(),
    output: new UsageDeltaTracker(),
    reasoning: new UsageDeltaTracker(),
  };
  readonly #known = new Set<string>();
  #ready = false;

  constructor(database: OpenBotDatabase) {
    this.#database = database;
  }

  /** The use of each part since the last report of this thread. */
  observe(threadId: string, total: TokenSplit): TokenSplit {
    const db = this.#db();
    if (!this.#known.has(threadId)) {
      this.#known.add(threadId);
      const row = db
        .prepare("SELECT input, cached, output, reasoning FROM projection_budget_thread_split WHERE thread_id = ?")
        .get(threadId);
      if (isDynamicRecord(row))
        for (const kind of KINDS) if (isNumber(row[kind])) this.#trackers[kind].baseline(threadId, row[kind]);
    }
    const delta: TokenSplit = {
      input: this.#trackers.input.observeTotal(threadId, total.input),
      cached: this.#trackers.cached.observeTotal(threadId, total.cached),
      output: this.#trackers.output.observeTotal(threadId, total.output),
      reasoning: this.#trackers.reasoning.observeTotal(threadId, total.reasoning),
    };
    db.prepare(
      `INSERT INTO projection_budget_thread_split (thread_id, input, cached, output, reasoning) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET input = excluded.input, cached = excluded.cached,
         output = excluded.output, reasoning = excluded.reasoning`,
    ).run(threadId, total.input, total.cached, total.output, total.reasoning);
    return delta;
  }

  #db() {
    const connection = this.#database.connection;
    if (!this.#ready) {
      connection.exec(SCHEMA);
      this.#ready = true;
    }
    return connection;
  }
}

/** Adds the parts of two splits (the pending use of a thread grows between two turns). */
export function addSplits(a: TokenSplit, b: TokenSplit): TokenSplit {
  return {
    input: a.input + b.input,
    cached: a.cached + b.cached,
    output: a.output + b.output,
    reasoning: a.reasoning + b.reasoning,
  };
}
