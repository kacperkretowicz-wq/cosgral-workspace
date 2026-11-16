// @vitest-environment node
// COSGRAL W5-K2: a database made before model endpoints only allows codex, claude and acp as the provider of a session.
// The table is rebuilt once at the next start; the sessions that exist stay.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { BotStore } from "./bot-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function folder(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "endpoint-sessions-"));
  roots.push(root);
  return root;
}

describe("provider sessions of model endpoints", () => {
  it("rebuilds the session table of an older database once and keeps its sessions", async () => {
    const root = await folder();
    const userData = join(root, "data");
    const first = testDatabase(userData);
    await first.initialize();
    const store = new BotStore(userData, join(root, "home"), first);
    await store.initialize();
    await store.getOrCreate("chief");
    await store.ensureThreadId("chief");
    store.bindProviderSession("chief", "session-before");
    closeTestDatabases();

    // Make it look like a database from before W5-K2: the CHECK without 'endpoint'.
    const raw = new DatabaseSync(join(userData, "openbot.db"));
    raw.exec("PRAGMA foreign_keys = OFF");
    raw.exec("PRAGMA legacy_alter_table = ON");
    const row = raw
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projection_provider_sessions'")
      .get();
    const sql = String(row?.sql);
    expect(sql).toContain("'endpoint'");
    raw.exec(
      `ALTER TABLE projection_provider_sessions RENAME TO sessions_old;
       ${sql.replace(", 'endpoint'", "")};
       INSERT INTO projection_provider_sessions SELECT * FROM sessions_old;
       DROP TABLE sessions_old;`,
    );
    expect(() =>
      raw
        .prepare(
          "INSERT INTO projection_provider_sessions (id, thread_id, provider, external_session_id, model, effort, state, created_at, updated_at, last_event_sequence) SELECT 'x', thread_id, 'endpoint', 'e', 'm', 'medium', 'active', 'now', 'now', 0 FROM projection_provider_sessions LIMIT 1",
        )
        .run(),
    ).toThrow(/CHECK/);
    raw.close();

    const second = testDatabase(userData);
    await second.initialize();
    const after = second.connection
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projection_provider_sessions'")
      .get();
    expect(String(after?.sql)).toContain("'endpoint'");
    const kept = second.connection.prepare("SELECT external_session_id FROM projection_provider_sessions").all();
    expect(kept.map((item) => item.external_session_id)).toEqual(["session-before"]);

    // An agent on an endpoint model now gets a session of its own.
    const again = new BotStore(userData, join(root, "home"), second);
    await again.initialize();
    await again.updateBot({ botId: "chief", model: "endpoint:local/llama3" });
    const session = again.bindProviderSession("chief", "session-endpoint");
    expect(session.provider).toBe("endpoint");
    expect(again.activeProviderSession("chief")?.externalSessionId).toBe("session-endpoint");
  });
});
