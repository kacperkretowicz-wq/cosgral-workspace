// COSGRAL W8-BE2: the running total of tokens each CLI thread reported, kept in the local database, so that a thread resumed
// after a restart is not counted again from zero (the budget counter itself is `BudgetMeter`; this only remembers where each
// thread stood). Wraps `UsageDeltaTracker`: the same rules (a new thread counts whole, a total that goes down is a new start).

import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { UsageDeltaTracker } from "./budget-meter";
import type { OpenBotDatabase } from "./openbot-database";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_budget_thread_totals (
    thread_id TEXT PRIMARY KEY,
    total INTEGER NOT NULL
  );
`;

export class PersistentUsageTracker {
  readonly #database: OpenBotDatabase;
  readonly #tracker = new UsageDeltaTracker();
  readonly #known = new Set<string>();
  #ready = false;

  constructor(database: OpenBotDatabase) {
    this.#database = database;
  }

  /** Tokens used since the last report of this thread (0 for a total that is not a number). */
  observe(threadId: string, total: number): number {
    const db = this.#db();
    if (!this.#known.has(threadId)) {
      this.#known.add(threadId);
      const row = db.prepare("SELECT total FROM projection_budget_thread_totals WHERE thread_id = ?").get(threadId);
      if (isDynamicRecord(row) && isNumber(row.total)) this.#tracker.baseline(threadId, row.total);
    }
    const delta = this.#tracker.observeTotal(threadId, total);
    if (Number.isFinite(total) && total >= 0) {
      db.prepare(
        `INSERT INTO projection_budget_thread_totals (thread_id, total) VALUES (?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET total = excluded.total`,
      ).run(threadId, Math.round(total));
    }
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
