// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHANNEL_LIMITS, isTaskDetail, isTasksViewPage } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { ChannelStore } from "./channel-store";
import { TasksViewService } from "./tasks-view";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "tasks-view-"));
  roots.push(root);
  const database = testDatabase(root);
  await database.initialize();
  const store = new ChannelStore(database);
  const names: Record<string, string> = { a: "Alice", b: "Bob" };
  const view = new TasksViewService({ channels: store, agentName: (botId) => names[botId] ?? null });
  const make = (name: string) =>
    store.create({
      name,
      title: name.toUpperCase(),
      instructions: "",
      isolated: false,
      memberBotIds: ["a", "b"],
      leadBotId: "a",
    });
  return { store, view, make };
}

describe("tasks view over the channel store (W12 BE-J)", () => {
  it("lists the tasks of all channels, with the text of the result, and counts archived ones apart", async () => {
    const { store, view, make } = await setup();
    const one = make("alpha");
    const two = make("beta");
    const request = store.addMessage({ channelId: one.id, authorBotId: null, kind: "human", text: "Write the post" });
    const task = store.createTask({ channelId: one.id, requestMessageId: request.id, title: "Write the post" });
    store.recordResult(task.id, "a", "The post\n\nis ready.");
    const other = store.addMessage({ channelId: two.id, authorBotId: null, kind: "human", text: "Name it" });
    const second = store.createTask({
      channelId: two.id,
      requestMessageId: other.id,
      title: "Name it",
      ownerBotId: "b",
    });
    store.act({ taskId: second.id, action: "archive" });

    const active = view.list();
    expect(isTasksViewPage(active)).toBe(true);
    expect(active.items).toHaveLength(1);
    expect(active.items[0]).toMatchObject({
      channelName: "alpha",
      ownerName: "Alice",
      resultPreview: "The post is ready.",
    });
    expect(active.counts).toMatchObject({ active: 1, archived: 1 });
    expect(view.list({ scope: "archived" }).items[0]).toMatchObject({ channelName: "beta", ownerName: "Bob" });
    expect(view.list({ scope: "all", query: "bob" }).total).toBe(1);
  });

  it("shows one task with its request, its latest and replaced results, its steps and a log in time order", async () => {
    const { store, view, make } = await setup();
    const channel = make("work");
    const request = store.addMessage({
      channelId: channel.id,
      authorBotId: null,
      kind: "human",
      text: "Prepare the plan",
    });
    const task = store.createTask({ channelId: channel.id, requestMessageId: request.id, title: "Prepare the plan" });
    const step = store.createTask({
      channelId: channel.id,
      requestMessageId: request.id,
      title: "Collect facts",
      parentTaskId: task.id,
      ownerBotId: "b",
    });
    store.addMessage({ channelId: channel.id, authorBotId: "a", kind: "note", text: "Looking at it", taskId: task.id });
    store.recordResult(task.id, "a", "Draft");
    const final = store.recordResult(task.id, "a", "Final plan");

    const detail = view.detail({ taskId: task.id });
    expect(isTaskDetail(detail)).toBe(true);
    expect(detail.request?.text).toBe("Prepare the plan");
    expect(detail.result).toMatchObject({ messageId: final.id, text: "Final plan", version: 2, authorName: "Alice" });
    expect(detail.steps).toMatchObject([{ taskId: step.id, title: "Collect facts", ownerName: "Bob" }]);
    expect(
      detail.log.filter((entry) => entry.messageId !== null).map((entry) => [entry.kind, entry.text, entry.superseded]),
    ).toEqual([
      // A progress note is marked as replaced once the result is in (the store does it).
      ["note", "Looking at it", true],
      ["result", "Draft", true],
      ["result", "Final plan", false],
    ]);
    expect(detail.openAsChat).toEqual({ channelId: channel.id, anchorMessageId: request.id });
    expect(detail.logTruncated).toBe(false);
    expect(view.detail({ taskId: step.id }).log.map((entry) => entry.text)).toEqual(["Task created."]);
  });

  it("finds the messages of a task that lie before the last page, and says so when it had to stop looking", async () => {
    const { store, view, make } = await setup();
    const channel = make("busy");
    const request = store.addMessage({ channelId: channel.id, authorBotId: null, kind: "human", text: "Go" });
    const task = store.createTask({ channelId: channel.id, requestMessageId: request.id, title: "Go" });
    store.addMessage({ channelId: channel.id, authorBotId: "a", kind: "note", text: "First note", taskId: task.id });
    for (let index = 0; index < CHANNEL_LIMITS.historyPage + 20; index += 1) {
      store.addMessage({ channelId: channel.id, authorBotId: null, kind: "system", text: `noise ${index}` });
    }
    expect(view.detail({ taskId: task.id }).log.map((entry) => entry.text)).toEqual(["Task created.", "First note"]);
    const short = new TasksViewService({
      channels: store,
      agentName: () => null,
      scanMessages: CHANNEL_LIMITS.historyPage,
    });
    const cut = short.detail({ taskId: task.id });
    expect(cut.logTruncated).toBe(true);
    expect(cut.log.map((entry) => entry.kind)).toEqual(["assigned"]);
  });

  it("refuses a task that is gone and a bad query before it reads anything", async () => {
    const { view } = await setup();
    expect(() => view.detail({ taskId: "missing" })).toThrow("no longer exists");
    expect(() => view.detail({})).toThrow("Name the task");
    expect(() => view.list({ scope: "old" })).toThrow("scope");
  });
});
