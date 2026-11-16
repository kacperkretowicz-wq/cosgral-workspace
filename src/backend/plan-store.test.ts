// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentPlan, PLAN_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, expect, it } from "vitest";
import { SqlitePlanStore } from "./plan-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function open(root?: string) {
  const path = root ?? (await mkdtemp(join(tmpdir(), "plan-store-")));
  if (!root) roots.push(path);
  const database = testDatabase(path);
  await database.initialize();
  return { path, store: new SqlitePlanStore(database) };
}

function plan(id: string, createdAt: string, patch: Partial<AgentPlan> = {}): AgentPlan {
  return {
    requestId: id,
    botId: "chief",
    threadId: "thread-1",
    turnId: "turn",
    title: `Plan ${id}`,
    summary: null,
    steps: [{ id: "s1", title: "Do it", detail: null, status: "pending" }],
    phase: "proposed",
    createdAt,
    decidedAt: null,
    updatedAt: createdAt,
    ...patch,
  };
}

it("keeps plans across a restart, newest first, and updates one in place", async () => {
  const first = await open();
  first.store.save(plan("a", "2026-11-16T10:00:01.000Z"));
  first.store.save(plan("b", "2026-11-16T10:00:02.000Z"));
  first.store.save(plan("a", "2026-11-16T10:00:01.000Z", { phase: "approved", decidedAt: "2026-11-16T10:00:09.000Z" }));
  closeTestDatabases();

  const second = await open(first.path);
  expect(second.store.list("chief", "thread-1").map((item) => [item.requestId, item.phase])).toEqual([
    ["b", "proposed"],
    ["a", "approved"],
  ]);
  expect(second.store.get("a")?.decidedAt).toBe("2026-11-16T10:00:09.000Z");
  expect(second.store.get("missing")).toBeNull();
});

it("lists only the plans of the asked agent and thread, and at most the limit", async () => {
  const { store } = await open();
  store.save(plan("a", "2026-11-16T10:00:01.000Z"));
  store.save(plan("b", "2026-11-16T10:00:02.000Z", { threadId: "thread-2" }));
  store.save(plan("c", "2026-11-16T10:00:03.000Z", { botId: "other" }));
  expect(store.list("chief", "thread-1").map((item) => item.requestId)).toEqual(["a"]);
  expect(store.list("chief", "thread-2").map((item) => item.requestId)).toEqual(["b"]);
  for (let index = 0; index < PLAN_LIMITS.listed + 5; index += 1) {
    store.save(plan(`m${index}`, `2026-11-17T10:00:${String(index % 60).padStart(2, "0")}.000Z`, { threadId: "many" }));
  }
  expect(store.list("chief", "many")).toHaveLength(PLAN_LIMITS.listed);
});

it("finds the open plans, deletes a thread's plans and forgets the plans of removed agents", async () => {
  const { store } = await open();
  store.save(plan("a", "2026-11-16T10:00:01.000Z"));
  store.save(plan("b", "2026-11-16T10:00:02.000Z", { phase: "approved" }));
  store.save(plan("c", "2026-11-16T10:00:03.000Z", { phase: "completed" }));
  store.save(plan("d", "2026-11-16T10:00:04.000Z", { botId: "gone", threadId: "t9" }));
  expect(store.listOpen().map((item) => item.requestId)).toEqual(["a", "b", "d"]);
  expect(store.pruneBots(["chief"])).toBe(true);
  expect(store.get("d")).toBeNull();
  expect(store.pruneBots(["chief"])).toBe(false);
  store.deleteThread("chief", "thread-1");
  expect(store.list("chief", "thread-1")).toEqual([]);
});

it("refuses a plan that is not valid", async () => {
  const { store } = await open();
  const broken = JSON.parse(JSON.stringify({ ...plan("a", "2026-11-16T10:00:01.000Z"), phase: "maybe" }));
  expect(() => store.save(broken)).toThrow(/not valid/);
});
