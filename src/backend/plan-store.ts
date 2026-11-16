// COSGRAL W6-BE3: the plan cards of the threads, kept in the local database with the conversation (spec-w6.md 1C).
// A plan is saved the moment it is proposed and on every change, so progress and the answer survive a restart.

import { type AgentPlan, isAgentPlan, PLAN_LIMITS } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

/** What the plan cards need from the plan storage. */
export interface PlanStore {
  save(plan: AgentPlan): void;
  get(requestId: string): AgentPlan | null;
  /** The plans of one thread, newest first (at most `PLAN_LIMITS.listed`). */
  list(botId: string, threadId: string): AgentPlan[];
  /** Plans that still wait for an answer or run (phase "proposed" or "approved"), whatever the thread. */
  listOpen(): AgentPlan[];
  deleteThread(botId: string, threadId: string): void;
  /** Forgets the plans of agents that no longer exist. True when something was removed. */
  pruneBots(botIds: string[]): boolean;
}

export class SqlitePlanStore implements PlanStore {
  readonly #database: OpenBotDatabase;

  constructor(database: OpenBotDatabase) {
    this.#database = database;
  }

  save(plan: AgentPlan): void {
    if (!isAgentPlan(plan)) throw new Error("This plan is not valid.");
    this.#database.connection
      .prepare(
        `INSERT INTO projection_plans (plan_id, agent_id, thread_id, phase, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(plan_id) DO UPDATE SET phase = excluded.phase, data_json = excluded.data_json`,
      )
      .run(plan.requestId, plan.botId, plan.threadId, plan.phase, plan.createdAt, JSON.stringify(plan));
  }

  get(requestId: string): AgentPlan | null {
    return parsePlan(
      this.#database.connection.prepare("SELECT data_json FROM projection_plans WHERE plan_id = ?").get(requestId),
    );
  }

  list(botId: string, threadId: string): AgentPlan[] {
    const rows = this.#database.connection
      .prepare(
        `SELECT data_json FROM projection_plans WHERE agent_id = ? AND thread_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(botId, threadId, PLAN_LIMITS.listed);
    return rows.flatMap((row) => {
      const plan = parsePlan(row);
      return plan ? [plan] : [];
    });
  }

  listOpen(): AgentPlan[] {
    const rows = this.#database.connection
      .prepare("SELECT data_json FROM projection_plans WHERE phase IN ('proposed', 'approved') ORDER BY created_at")
      .all();
    return rows.flatMap((row) => {
      const plan = parsePlan(row);
      return plan ? [plan] : [];
    });
  }

  deleteThread(botId: string, threadId: string): void {
    this.#database.connection
      .prepare("DELETE FROM projection_plans WHERE agent_id = ? AND thread_id = ?")
      .run(botId, threadId);
  }

  pruneBots(botIds: string[]): boolean {
    const keep = new Set(botIds);
    const rows = this.#database.connection.prepare("SELECT DISTINCT agent_id FROM projection_plans").all();
    let removed = false;
    for (const row of rows) {
      if (!isDynamicRecord(row) || !isString(row.agent_id) || keep.has(row.agent_id)) continue;
      this.#database.connection.prepare("DELETE FROM projection_plans WHERE agent_id = ?").run(row.agent_id);
      removed = true;
    }
    return removed;
  }
}

function parsePlan(row: unknown): AgentPlan | null {
  if (!isDynamicRecord(row) || !isString(row.data_json)) return null;
  try {
    const value = JSON.parse(row.data_json);
    return isAgentPlan(value) ? value : null;
  } catch {
    return null;
  }
}
