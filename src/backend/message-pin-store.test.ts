// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MESSAGE_ACTION_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, expect, it } from "vitest";
import { MessagePinStore } from "./message-pin-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function open(root?: string) {
  const path = root ?? (await mkdtemp(join(tmpdir(), "pin-store-")));
  if (!root) roots.push(path);
  const database = testDatabase(path);
  await database.initialize();
  return { path, store: new MessagePinStore(database) };
}

it("keeps pins across a restart, newest first, and pinning again changes nothing", async () => {
  const first = await open();
  first.store.set("chief", "t1", "m1", true, "2026-11-16T10:00:01.000Z");
  first.store.set("chief", "t1", "m2", true, "2026-11-16T10:00:02.000Z");
  first.store.set("chief", "t1", "m1", true, "2026-11-16T10:00:09.000Z");
  closeTestDatabases();
  const second = await open(first.path);
  expect(second.store.list("t1")).toEqual([
    { messageId: "m2", pinnedAt: "2026-11-16T10:00:02.000Z" },
    { messageId: "m1", pinnedAt: "2026-11-16T10:00:01.000Z" },
  ]);
  expect([...second.store.pinnedIds("t1")].sort()).toEqual(["m1", "m2"]);
});

it("unpins, keeps threads apart, and drops the pins of removed messages and threads", async () => {
  const { store } = await open();
  store.set("chief", "t1", "m1", true, "2026-11-16T10:00:01.000Z");
  store.set("chief", "t1", "m2", true, "2026-11-16T10:00:02.000Z");
  store.set("chief", "t2", "m1", true, "2026-11-16T10:00:03.000Z");
  expect(store.set("chief", "t1", "m1", false, "x").map((pin) => pin.messageId)).toEqual(["m2"]);
  expect(store.pinnedIds("t1").has("m1")).toBe(false);
  expect(store.pinnedIds("t2").has("m1")).toBe(true);
  store.removeMessages("t1", ["m2"]);
  expect(store.list("t1")).toEqual([]);
  store.deleteThread("t2");
  expect(store.list("t2")).toEqual([]);
});

it("refuses a pin over the limit of a thread, but another thread still has its own room", async () => {
  const { store } = await open();
  for (let index = 0; index < MESSAGE_ACTION_LIMITS.pinsPerThread; index += 1) {
    store.set("chief", "t1", `m${index}`, true, `2026-11-16T10:00:${String(index % 60).padStart(2, "0")}.000Z`);
  }
  expect(() => store.set("chief", "t1", "one-too-many", true, "2026-11-16T11:00:00.000Z")).toThrow(/At most/);
  expect(() => store.set("chief", "t1", "m0", true, "2026-11-16T11:00:00.000Z")).not.toThrow();
  expect(store.set("chief", "t2", "x", true, "2026-11-16T11:00:00.000Z")).toHaveLength(1);
});

it("forgets the pins of agents that no longer exist", async () => {
  const { store } = await open();
  store.set("chief", "t1", "m1", true, "2026-11-16T10:00:01.000Z");
  store.set("gone", "t9", "m1", true, "2026-11-16T10:00:02.000Z");
  store.pruneBots(["chief"]);
  expect(store.list("t9")).toEqual([]);
  expect(store.list("t1")).toHaveLength(1);
});
