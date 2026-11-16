// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SUBAGENT_LIMITS, type Subagent } from "@openbot/contracts/ipc";
import { afterEach, expect, it } from "vitest";
import { SqliteSubagentStore } from "./subagent-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function open(root?: string) {
  const path = root ?? (await mkdtemp(join(tmpdir(), "subagent-store-")));
  if (!root) roots.push(path);
  const database = testDatabase(path);
  await database.initialize();
  return { path, store: new SqliteSubagentStore(database) };
}

function subagent(id: string, createdAt: string, patch: Partial<Subagent> = {}): Subagent {
  return {
    id,
    botId: "chief",
    threadId: "thread-1",
    parentTurnId: "turn",
    title: `Subagent ${id}`,
    task: "Do it",
    state: "working",
    createdAt,
    updatedAt: createdAt,
    finishedAt: null,
    preview: null,
    result: null,
    error: null,
    waitingRequestIds: [],
    ...patch,
  };
}

it("keeps subagents across a restart, newest first, and updates one in place", async () => {
  const first = await open();
  first.store.save(subagent("a", "2026-11-16T10:00:01.000Z"));
  first.store.save(subagent("b", "2026-11-16T10:00:02.000Z"));
  first.store.save(
    subagent("a", "2026-11-16T10:00:01.000Z", { state: "done", result: "ok", finishedAt: "2026-11-16T10:00:09.000Z" }),
  );
  closeTestDatabases();
  const second = await open(first.path);
  expect(second.store.list("chief", "thread-1").map((item) => [item.id, item.state])).toEqual([
    ["b", "working"],
    ["a", "done"],
  ]);
  expect(second.store.get("a")?.result).toBe("ok");
  expect(second.store.get("missing")).toBeNull();
});

it("lists only the asked agent and thread, and at most the limit", async () => {
  const { store } = await open();
  store.save(subagent("a", "2026-11-16T10:00:01.000Z"));
  store.save(subagent("b", "2026-11-16T10:00:02.000Z", { threadId: "thread-2" }));
  store.save(subagent("c", "2026-11-16T10:00:03.000Z", { botId: "other" }));
  expect(store.list("chief", "thread-1").map((item) => item.id)).toEqual(["a"]);
  for (let index = 0; index < SUBAGENT_LIMITS.listed + 5; index += 1) {
    store.save(
      subagent(`m${index}`, `2026-11-17T10:00:${String(index % 60).padStart(2, "0")}.000Z`, { threadId: "many" }),
    );
  }
  expect(store.list("chief", "many")).toHaveLength(SUBAGENT_LIMITS.listed);
});

it("finds the active ones, deletes a thread's subagents and forgets the ones of removed agents", async () => {
  const { store } = await open();
  store.save(subagent("a", "2026-11-16T10:00:01.000Z"));
  store.save(subagent("b", "2026-11-16T10:00:02.000Z", { state: "waiting", waitingRequestIds: ["c1"] }));
  store.save(subagent("c", "2026-11-16T10:00:03.000Z", { state: "done" }));
  store.save(subagent("d", "2026-11-16T10:00:04.000Z", { botId: "gone", threadId: "t9" }));
  expect(store.listActive().map((item) => item.id)).toEqual(["a", "b", "d"]);
  expect(store.pruneBots(["chief"])).toBe(true);
  expect(store.get("d")).toBeNull();
  expect(store.pruneBots(["chief"])).toBe(false);
  store.deleteThread("chief", "thread-1");
  expect(store.list("chief", "thread-1")).toEqual([]);
});

it("refuses a subagent that is not valid", async () => {
  const { store } = await open();
  const broken = JSON.parse(JSON.stringify({ ...subagent("a", "2026-11-16T10:00:01.000Z"), state: "dreaming" }));
  expect(() => store.save(broken)).toThrow(/not valid/);
});
