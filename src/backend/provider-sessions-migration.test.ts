// @vitest-environment node
// COSGRAL W3: provider sessions accept "acp"; an existing database keeps its sessions and turn links.
import { DatabaseSync } from "node:sqlite";
import { isString } from "@openbot/contracts/runtime-values";
import { describe, expect, it } from "vitest";
import { migrateOpenBotDatabase } from "./openbot-database-schema";

function tableSql(db: DatabaseSync): string {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projection_provider_sessions'")
    .get();
  return row && isString(row.sql) ? row.sql : "";
}

describe("provider sessions migration", () => {
  it("lets a new database store ACP sessions", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrateOpenBotDatabase(db);
    expect(tableSql(db)).toContain("'acp'");
  });

  it("widens an old table without losing sessions, turn links or foreign keys, and only once", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrateOpenBotDatabase(db);
    // Make the table look like a database from before W3.
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec(`DROP TABLE projection_provider_sessions;
      CREATE TABLE projection_provider_sessions (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK(provider IN ('codex', 'claude')),
        external_session_id TEXT NOT NULL,
        model TEXT NOT NULL,
        effort TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('active', 'inactive', 'failed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resume_cursor TEXT,
        last_event_sequence INTEGER NOT NULL,
        UNIQUE(provider, external_session_id)
      );`);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      INSERT INTO projection_threads (thread_id, agent_id, title, active_turn_id, created_at, updated_at, last_event_sequence)
        VALUES ('t', 'chief', 'Chief', NULL, 'a', 'a', 0);
      INSERT INTO projection_provider_sessions (id, thread_id, provider, external_session_id, model, effort, state, created_at, updated_at, last_event_sequence)
        VALUES ('s1', 't', 'codex', 'codex-1', 'gpt-5.6-luna', 'medium', 'active', 'a', 'a', 0);
      INSERT INTO projection_turns (turn_id, thread_id, provider_session_id, status, started_at, completed_at, last_event_sequence)
        VALUES ('turn-1', 't', 's1', 'completed', 'a', 'a', 0);
    `);
    expect(() =>
      db
        .prepare(
          "INSERT INTO projection_provider_sessions (id, thread_id, provider, external_session_id, model, effort, state, created_at, updated_at, last_event_sequence) VALUES ('x', 't', 'acp', 'e', 'acp:stub', 'medium', 'active', 'a', 'a', 0)",
        )
        .run(),
    ).toThrow();

    migrateOpenBotDatabase(db);
    expect(tableSql(db)).toContain("'acp'");
    expect(db.prepare("SELECT id, provider, external_session_id FROM projection_provider_sessions").all()).toEqual([
      { id: "s1", provider: "codex", external_session_id: "codex-1" },
    ]);
    expect(db.prepare("SELECT provider_session_id FROM projection_turns").all()).toEqual([
      { provider_session_id: "s1" },
    ]);
    db.prepare(
      "INSERT INTO projection_provider_sessions (id, thread_id, provider, external_session_id, model, effort, state, created_at, updated_at, last_event_sequence) VALUES ('s2', 't', 'acp', 'e', 'acp:stub', 'medium', 'active', 'a', 'a', 0)",
    ).run();
    migrateOpenBotDatabase(db);
    expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'provider_sessions_thread'").get()).toBeTruthy();
  });
});
