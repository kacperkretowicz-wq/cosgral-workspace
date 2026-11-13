// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHANNEL_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, expect, it } from "vitest";
import { ChannelStore, channelResourceKey } from "./channel-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "channel-history-"));
  roots.push(root);
  const database = testDatabase(root);
  await database.initialize();
  const store = new ChannelStore(database);
  const channel = store.create({
    name: "work",
    title: "",
    instructions: "",
    isolated: true,
    memberBotIds: ["a", "b"],
    leadBotId: "a",
  });
  return { root, database, store, channel };
}

it("enforces the lead's limits and canonical absolute resource keys", async () => {
  const { store, channel } = await setup();
  expect(CHANNEL_LIMITS.instructions).toBe(2000);
  expect(CHANNEL_LIMITS.memoryEntry).toBe(500);
  expect(CHANNEL_LIMITS.automaticAssignments).toBe(8);
  expect(channelResourceKey("workspace:C:\\Work\\a\\..\\Repo\\")).toBe("workspace:c:\\work\\repo");
  expect(channelResourceKey("browser")).toBe("browser");
  expect(() => channelResourceKey("workspace:relative")).toThrow(/absolute/);
  expect(() => channelResourceKey("arbitrary")).toThrow(/resource/);
  expect(() =>
    store.createTask({ channelId: channel.id, title: "bad", requestMessageId: "m", resourceKey: "workspace:relative" }),
  ).toThrow();
});

it("persists messages, superseded result versions and channel-only memory across restart", async () => {
  const { root, database, store, channel } = await setup();
  const request = store.addMessage({ channelId: channel.id, authorBotId: null, kind: "human", text: "Prepare" });
  const task = store.createTask({ channelId: channel.id, requestMessageId: request.id, title: request.text });
  const first = store.recordResult(task.id, "a", "Draft");
  const second = store.recordResult(task.id, "a", "Corrected");
  store.remember(channel.id, "a", "Use short sentences.");
  expect(() => store.remember(channel.id, "a", "x".repeat(501))).toThrow(/500/);
  expect(store.getTask(task.id)).toMatchObject({ state: "done", resultMessageId: second.id });
  database.close();
  const db = testDatabase(root);
  await db.initialize();
  const reopened = new ChannelStore(db);
  expect(reopened.listMessages(channel.id)).toMatchObject([
    { id: request.id, kind: "human" },
    { id: first.id, resultVersion: 1, superseded: true },
    { id: second.id, resultVersion: 2, superseded: false },
  ]);
  expect(reopened.listMemory(channel.id).map((m) => m.text)).toEqual(["Use short sentences."]);
  const other = reopened.create({
    name: "other",
    title: "",
    instructions: "",
    isolated: true,
    memberBotIds: ["a"],
    leadBotId: "a",
  });
  expect(reopened.listMemory(other.id)).toEqual([]);
});

it("pauses at eight automatic continuations and only a human can reset the budget", async () => {
  const { store, channel } = await setup();
  const task = store.createTask({ channelId: channel.id, requestMessageId: "m", title: "work" });
  for (let n = 1; n < 8; n++) {
    store.markRunning(task.id);
    store.markWaiting(task.id);
    store.continueTask(task.id);
  }
  store.markRunning(task.id);
  store.markWaiting(task.id);
  expect(store.continueTask(task.id)).toMatchObject({ state: "paused", assignmentCount: 8 });
  expect(store.reassign({ taskId: task.id, ownerBotId: "b" }, "agent").state).toBe("paused");
  expect(() => store.act({ taskId: task.id, action: "resume" }, "agent")).toThrow(/human/);
  expect(store.act({ taskId: task.id, action: "resume" }).state).toBe("queued");
  store.markRunning(task.id);
  store.markWaiting(task.id);
  expect(store.continueTask(task.id).state).toBe("queued");
  expect(store.listAssignments(task.id).length).toBeGreaterThanOrEqual(9);
});

it("does not deadlock a dependency behind the same resource, or run queued work in an archived channel", async () => {
  const { store, channel } = await setup();
  const parent = store.createTask({
    channelId: channel.id,
    requestMessageId: "m",
    title: "parent",
    resourceKey: "browser",
  });
  store.markRunning(parent.id);
  store.markWaiting(parent.id);
  const child = store.createTask({
    channelId: channel.id,
    requestMessageId: "m",
    title: "child",
    parentTaskId: parent.id,
    resourceKey: "browser",
  });
  store.waitForTasks(parent.id, [child.id]);
  expect(store.startable().map((t) => t.id)).toEqual([child.id]);
  store.update({ channelId: channel.id, archived: true });
  expect(store.startable()).toEqual([]);
});

it("pauses uncertain running work after restart instead of repeating side effects", async () => {
  const { store, channel } = await setup();
  const task = store.createTask({ channelId: channel.id, requestMessageId: "m", title: "work" });
  store.markRunning(task.id);
  expect(store.recoverInterrupted().map((t) => t.state)).toEqual(["paused"]);
  expect(store.startable()).toEqual([]);
});

it("does not automatically resume a paused task when its owner is removed", async () => {
  const { store, channel } = await setup();
  const task = store.createTask({ channelId: channel.id, requestMessageId: "m", title: "work" });
  store.act({ taskId: task.id, action: "pause" });
  store.pruneBots(["b"]);
  expect(store.getTask(task.id).state).toBe("paused");
});

it("does not start queued children of a paused parent", async () => {
  const { store, channel } = await setup();
  const parent = store.createTask({ channelId: channel.id, requestMessageId: "m", title: "Parent" });
  store.createTask({ channelId: channel.id, requestMessageId: "m", title: "Child", parentTaskId: parent.id });
  store.act({ taskId: parent.id, action: "pause" });
  expect(store.startable()).toEqual([]);
});

it("marks progress notes as superseded when the final result is saved", async () => {
  const { store, channel } = await setup();
  const task = store.createTask({ channelId: channel.id, requestMessageId: "m", title: "Work" });
  store.addMessage({ channelId: channel.id, taskId: task.id, authorBotId: "a", kind: "note", text: "- [x] Step one" });
  store.recordResult(task.id, "a", "Done");
  expect(store.listMessages(channel.id)[0]).toMatchObject({ kind: "note", superseded: true });
});
