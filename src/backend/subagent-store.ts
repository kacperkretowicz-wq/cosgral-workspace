// COSGRAL W6-BE4: the subagents of the threads, kept in the local database (spec-w6.md 1D). A subagent is saved when it
// starts and on every change, so its answer is still in the panel after a restart. One that was working at a restart is
// closed then (`recover` in the runner): nothing runs without a program.

import { isSubagent, SUBAGENT_LIMITS, type Subagent, subagentIsActive } from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

/** What the subagent runner needs from the storage. */
export interface SubagentStore {
  save(subagent: Subagent): void;
  get(id: string): Subagent | null;
  /** The subagents of one thread, newest first (at most `SUBAGENT_LIMITS.listed`). */
  list(botId: string, threadId: string): Subagent[];
  /** Subagents that still work (starting, working or waiting), whatever the thread. */
  listActive(): Subagent[];
  deleteThread(botId: string, threadId: string): void;
  /** Forgets the subagents of agents that no longer exist. True when something was removed. */
  pruneBots(botIds: string[]): boolean;
}

export class SqliteSubagentStore implements SubagentStore {
  readonly #database: OpenBotDatabase;

  constructor(database: OpenBotDatabase) {
    this.#database = database;
  }

  save(subagent: Subagent): void {
    if (!isSubagent(subagent)) throw new Error("This subagent is not valid.");
    this.#database.connection
      .prepare(
        `INSERT INTO projection_subagents (subagent_id, agent_id, thread_id, state, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(subagent_id) DO UPDATE SET state = excluded.state, data_json = excluded.data_json`,
      )
      .run(
        subagent.id,
        subagent.botId,
        subagent.threadId,
        subagent.state,
        subagent.createdAt,
        JSON.stringify(subagent),
      );
  }

  get(id: string): Subagent | null {
    return parse(
      this.#database.connection.prepare("SELECT data_json FROM projection_subagents WHERE subagent_id = ?").get(id),
    );
  }

  list(botId: string, threadId: string): Subagent[] {
    const rows = this.#database.connection
      .prepare(
        `SELECT data_json FROM projection_subagents WHERE agent_id = ? AND thread_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(botId, threadId, SUBAGENT_LIMITS.listed);
    return rows.flatMap((row) => {
      const subagent = parse(row);
      return subagent ? [subagent] : [];
    });
  }

  listActive(): Subagent[] {
    const rows = this.#database.connection
      .prepare(
        "SELECT data_json FROM projection_subagents WHERE state IN ('starting', 'working', 'waiting') ORDER BY created_at",
      )
      .all();
    return rows.flatMap((row) => {
      const subagent = parse(row);
      return subagent && subagentIsActive(subagent) ? [subagent] : [];
    });
  }

  deleteThread(botId: string, threadId: string): void {
    this.#database.connection
      .prepare("DELETE FROM projection_subagents WHERE agent_id = ? AND thread_id = ?")
      .run(botId, threadId);
  }

  pruneBots(botIds: string[]): boolean {
    const keep = new Set(botIds);
    const rows = this.#database.connection.prepare("SELECT DISTINCT agent_id FROM projection_subagents").all();
    let removed = false;
    for (const row of rows) {
      if (!isDynamicRecord(row) || !isString(row.agent_id) || keep.has(row.agent_id)) continue;
      this.#database.connection.prepare("DELETE FROM projection_subagents WHERE agent_id = ?").run(row.agent_id);
      removed = true;
    }
    return removed;
  }
}

function parse(row: unknown): Subagent | null {
  if (!isDynamicRecord(row) || !isString(row.data_json)) return null;
  try {
    const value = JSON.parse(row.data_json);
    return isSubagent(value) ? value : null;
  } catch {
    return null;
  }
}
