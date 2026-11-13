// COSGRAL W2: routines, their run history and webhook delivery ids in the local database.
// The webhook signing secret is encrypted with a SecretBox (Electron safeStorage in the app) and kept
// only in projection_routines.secret_encrypted; the event log never carries it.
import { randomUUID } from "node:crypto";
import { isRoutine, isRoutineRun, ROUTINE_LIMITS, type Routine, type RoutineRun } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { SecretBox } from "./mcp-store";
import type { OpenBotDatabase } from "./openbot-database";

const DAY = 24 * 60 * 60 * 1000;

export class RoutineStore {
  readonly #database: OpenBotDatabase;
  readonly #box: SecretBox;

  constructor(database: OpenBotDatabase, box: SecretBox) {
    this.#database = database;
    this.#box = box;
  }

  /** Oldest first; one agent's routines when botId is given. */
  list(botId?: string): Routine[] {
    const db = this.#database.connection;
    const found = botId
      ? db.prepare("SELECT data_json FROM projection_routines WHERE bot_id = ? ORDER BY created_at, rowid").all(botId)
      : db.prepare("SELECT data_json FROM projection_routines ORDER BY created_at, rowid").all();
    return rows(found).map((row) => parse(row, isRoutine));
  }

  get(routineId: string): Routine {
    const row = this.#database.connection
      .prepare("SELECT data_json FROM projection_routines WHERE routine_id = ?")
      .get(routineId);
    if (!row) throw new Error("This routine no longer exists.");
    return parse(asRow(row), isRoutine);
  }

  /** Insert or replace one routine (the secret is untouched). */
  save(routine: Routine): Routine {
    this.#database.dispatch(
      `routine:save:${randomUUID()}`,
      [
        {
          aggregateType: "routine",
          aggregateId: routine.id,
          eventType: "routine.saved",
          payload: { routine },
        },
      ],
      (db, sequences) => {
        db.prepare(
          `INSERT INTO projection_routines (routine_id, bot_id, data_json, created_at, updated_at, last_event_sequence)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(routine_id) DO UPDATE SET bot_id = excluded.bot_id, data_json = excluded.data_json,
             updated_at = excluded.updated_at, last_event_sequence = excluded.last_event_sequence`,
        ).run(
          routine.id,
          routine.botId,
          JSON.stringify(routine),
          routine.createdAt,
          routine.updatedAt,
          sequences.at(-1) ?? 0,
        );
        return null;
      },
    );
    return routine;
  }

  remove(routineId: string): void {
    this.get(routineId);
    this.#database.dispatch(
      `routine:remove:${randomUUID()}`,
      [{ aggregateType: "routine", aggregateId: routineId, eventType: "routine.removed", payload: { routineId } }],
      (db) => {
        db.prepare("DELETE FROM projection_routines WHERE routine_id = ?").run(routineId);
        db.prepare("DELETE FROM projection_routine_runs WHERE routine_id = ?").run(routineId);
        db.prepare("DELETE FROM projection_webhook_deliveries WHERE routine_id = ?").run(routineId);
        return null;
      },
    );
  }

  /** Encrypted at rest; null clears it (a webhook without a secret accepts nothing). */
  setSecret(routineId: string, secret: string | null): void {
    if (secret !== null && !this.#box.canEncrypt()) {
      throw new Error(
        "The webhook secret cannot be stored safely on this computer: system encryption is not available.",
      );
    }
    const encrypted = secret === null ? null : this.#box.encrypt(secret);
    this.#database.connection
      .prepare("UPDATE projection_routines SET secret_encrypted = ? WHERE routine_id = ?")
      .run(encrypted, routineId);
  }

  getSecret(routineId: string): string | null {
    const row = this.#database.connection
      .prepare("SELECT secret_encrypted FROM projection_routines WHERE routine_id = ?")
      .get(routineId);
    if (!row) throw new Error("This routine no longer exists.");
    const cipher = asRow(row).secret_encrypted;
    return isString(cipher) && cipher ? this.#box.decrypt(cipher) : null;
  }

  /** Newest first, at most ROUTINE_LIMITS.runsKept. */
  listRuns(routineId: string): RoutineRun[] {
    return rows(
      this.#database.connection
        .prepare(
          "SELECT data_json FROM projection_routine_runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC",
        )
        .all(routineId),
    ).map((row) => parse(row, isRoutineRun));
  }

  saveRun(run: RoutineRun): RoutineRun {
    const db = this.#database.connection;
    db.prepare(
      `INSERT INTO projection_routine_runs (run_id, routine_id, started_at, data_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET data_json = excluded.data_json`,
    ).run(run.id, run.routineId, run.startedAt, JSON.stringify(run));
    db.prepare(
      `DELETE FROM projection_routine_runs WHERE routine_id = ? AND run_id NOT IN (
         SELECT run_id FROM projection_routine_runs WHERE routine_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?
       )`,
    ).run(run.routineId, run.routineId, ROUTINE_LIMITS.runsKept);
    return run;
  }

  /** True the first time a delivery id is seen for a routine within the dedupe window. */
  rememberDelivery(routineId: string, deliveryId: string, nowMs: number): boolean {
    const db = this.#database.connection;
    const cutoff = new Date(nowMs - ROUTINE_LIMITS.dedupeDays * DAY).toISOString();
    db.prepare("DELETE FROM projection_webhook_deliveries WHERE received_at < ?").run(cutoff);
    const seen = db
      .prepare("SELECT 1 FROM projection_webhook_deliveries WHERE routine_id = ? AND delivery_id = ?")
      .get(routineId, deliveryId);
    if (seen) return false;
    db.prepare("INSERT INTO projection_webhook_deliveries (routine_id, delivery_id, received_at) VALUES (?, ?, ?)").run(
      routineId,
      deliveryId,
      new Date(nowMs).toISOString(),
    );
    return true;
  }

  setting(key: string): string | null {
    const row = this.#database.connection
      .prepare("SELECT value FROM projection_routine_settings WHERE key = ?")
      .get(key);
    const value = row ? asRow(row).value : null;
    return isString(value) ? value : null;
  }

  setSetting(key: string, value: string): void {
    this.#database.connection
      .prepare(
        "INSERT INTO projection_routine_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }
}

function asRow(value: unknown): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error("Invalid routine row.");
  return value;
}

function rows(value: unknown): DynamicRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid SQLite result set.");
  return value.map(asRow);
}

function parse<T>(row: DynamicRecord, guard: (value: unknown) => value is T): T {
  const text = row.data_json;
  if (!isString(text)) throw new Error("Invalid routine data.");
  const value = JSON.parse(text);
  if (!guard(value)) throw new Error("Invalid routine data.");
  return value;
}
