// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHANNEL_LIMITS, type CreateWorkspaceChannelInput } from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { ChannelStore } from "./channel-store";
import type { OpenBotDatabase } from "./openbot-database";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
const BOTS = new Set(["chief", "writer", "scout"]);

afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openStore(root?: string): Promise<{ root: string; database: OpenBotDatabase; channels: ChannelStore }> {
  const directory = root ?? (await mkdtemp(join(tmpdir(), "cosgral-channels-")));
  if (!root) roots.push(directory);
  const database = testDatabase(directory);
  await database.initialize();
  return { root: directory, database, channels: new ChannelStore(database, { botExists: (id) => BOTS.has(id) }) };
}

function launchPlan(overrides: Partial<CreateWorkspaceChannelInput> = {}): CreateWorkspaceChannelInput {
  return {
    name: "launch-plan",
    title: "Launch plan",
    instructions: "Short answers.",
    memberBotIds: ["chief", "writer"],
    leadBotId: "chief",
    isolated: true,
    ...overrides,
  };
}

describe("ChannelStore", () => {
  it("creates a channel with members and a lead and keeps it after a restart", async () => {
    const { root, database, channels } = await openStore();
    const created = channels.create(launchPlan({ title: "  Launch plan  " }));
    database.close();

    const reopened = await openStore(root);

    expect(reopened.channels.list()).toEqual([created]);
    expect(created).toMatchObject({
      name: "launch-plan",
      title: "Launch plan",
      leadBotId: "chief",
      memberBotIds: ["chief", "writer"],
      isolated: true,
      archived: false,
    });
  });

  it("rejects a taken or malformed name, a lead outside the members, unknown agents and long instructions", async () => {
    const { channels } = await openStore();
    channels.create(launchPlan());

    expect(() => channels.create(launchPlan())).toThrow("A channel named launch-plan already exists.");
    expect(() => channels.create(launchPlan({ name: "Launch Plan" }))).toThrow(
      "A channel name has 1–40 lowercase letters, digits or dashes.",
    );
    expect(() => channels.create(launchPlan({ name: "two", leadBotId: "scout" }))).toThrow(
      "The lead must be a member of the channel.",
    );
    expect(() => channels.create(launchPlan({ name: "two", memberBotIds: ["chief", "ghost"] }))).toThrow(
      "This agent no longer exists.",
    );
    expect(() =>
      channels.create(launchPlan({ name: "two", instructions: "x".repeat(CHANNEL_LIMITS.instructions + 1) })),
    ).toThrow("Channel instructions have at most 2000 characters.");
  });

  it("adds and removes members and moves the lead role", async () => {
    const { channels } = await openStore();
    const channel = channels.create(launchPlan());

    expect(channels.addMember({ channelId: channel.id, botId: "scout" }).memberBotIds).toEqual([
      "chief",
      "writer",
      "scout",
    ]);
    expect(() => channels.setLead({ channelId: channel.id, botId: "ghost" })).toThrow(
      "The lead must be a member of the channel.",
    );
    expect(() => channels.removeMember({ channelId: channel.id, botId: "chief" })).toThrow(
      "Choose another lead before removing this member.",
    );
    expect(channels.setLead({ channelId: channel.id, botId: "writer" }).leadBotId).toBe("writer");

    channels.createTask({ channelId: channel.id, title: "Draft", requestMessageId: "m1", ownerBotId: "scout" });
    expect(() => channels.removeMember({ channelId: channel.id, botId: "scout" })).toThrow(
      "Reassign this member's open tasks before removing it.",
    );
    expect(channels.removeMember({ channelId: channel.id, botId: "chief" }).memberBotIds).toEqual(["writer", "scout"]);
  });

  it("gives a request to the lead and runs dependent and same-resource tasks one after another", async () => {
    const { channels } = await openStore();
    const channel = channels.create(launchPlan());
    const first = channels.createTask({
      channelId: channel.id,
      title: `  ${"Prepare the launch report ".repeat(10)}`,
      requestMessageId: "m1",
      resourceKey: "workspace:c:\\work\\launch",
    });
    const second = channels.createTask({
      channelId: channel.id,
      title: "Publish it",
      requestMessageId: "m2",
      ownerBotId: "writer",
      dependencyTaskIds: [first.id],
    });
    const third = channels.createTask({
      channelId: channel.id,
      title: "Check the folder",
      requestMessageId: "m3",
      resourceKey: "workspace:c:\\work\\launch",
    });

    expect(first).toMatchObject({ ownerBotId: "chief", state: "queued", assignmentCount: 1, archivedAt: null });
    expect(first.title.length).toBeLessThanOrEqual(CHANNEL_LIMITS.taskTitle);
    expect(channels.startable().map((task) => task.id)).toEqual([first.id]);

    channels.markRunning(first.id);
    expect(channels.startable()).toEqual([]);

    const done = channels.complete({ taskId: first.id, outcome: "done", resultMessageId: "m4" });
    expect(done).toMatchObject({ state: "done", resultMessageId: "m4" });
    expect(channels.startable().map((task) => task.id)).toEqual([second.id, third.id]);
    expect(channels.complete({ taskId: first.id, outcome: "done", resultMessageId: "m5" }).resultMessageId).toBe("m5");
  });

  it("lets a person stop, pause, resume, archive and restore a task", async () => {
    const { channels } = await openStore();
    const channel = channels.create(launchPlan());
    const task = channels.createTask({ channelId: channel.id, title: "Draft", requestMessageId: "m1" });
    channels.markRunning(task.id);

    expect(channels.act({ taskId: task.id, action: "pause" }).state).toBe("paused");
    expect(channels.act({ taskId: task.id, action: "resume" }).state).toBe("queued");
    expect(() => channels.act({ taskId: task.id, action: "resume" })).toThrow(
      "Only a paused or stopped task can be resumed.",
    );
    expect(channels.act({ taskId: task.id, action: "stop" }).state).toBe("cancelled");
    expect(() => channels.act({ taskId: task.id, action: "pause" })).toThrow("This task is not running.");

    const archived = channels.act({ taskId: task.id, action: "archive" });
    expect(archived).toMatchObject({ state: "cancelled", archivedAt: expect.any(String) });
    expect(channels.startable()).toEqual([]);
    const restored = channels.act({ taskId: task.id, action: "restore" });
    expect(restored).toMatchObject({ state: "cancelled", archivedAt: null });
    expect(channels.act({ taskId: task.id, action: "resume" }).state).toBe("queued");
  });

  it("reassigns a task to another member and counts the assignment", async () => {
    const { channels } = await openStore();
    const channel = channels.create(launchPlan());
    const task = channels.createTask({ channelId: channel.id, title: "Draft", requestMessageId: "m1" });
    channels.markRunning(task.id);

    expect(() => channels.reassign({ taskId: task.id, ownerBotId: "scout" })).toThrow(
      "Only a member of the channel can own its tasks.",
    );
    expect(channels.reassign({ taskId: task.id, ownerBotId: "writer" })).toMatchObject({
      ownerBotId: "writer",
      state: "queued",
      assignmentCount: 2,
    });

    channels.complete({ taskId: task.id, outcome: "failed", resultMessageId: "m2" });
    expect(() => channels.reassign({ taskId: task.id, ownerBotId: "chief" })).toThrow("This task is finished.");
  });

  it("moves the lead role and open tasks of a deleted agent to the next member", async () => {
    const { channels } = await openStore();
    const channel = channels.create(launchPlan({ memberBotIds: ["chief", "writer", "scout"] }));
    const open = channels.createTask({ channelId: channel.id, title: "Draft", requestMessageId: "m1" });
    const finished = channels.createTask({ channelId: channel.id, title: "Old", requestMessageId: "m2" });
    channels.complete({ taskId: finished.id, outcome: "done", resultMessageId: "m3" });

    const changed = channels.pruneBots(["writer", "scout"]);

    expect(changed.channels.map((item) => item.leadBotId)).toEqual(["writer"]);
    expect(channels.list()[0]?.memberBotIds).toEqual(["writer", "scout"]);
    expect(channels.getTask(open.id)).toMatchObject({ ownerBotId: "writer", state: "queued", assignmentCount: 2 });
    expect(channels.getTask(finished.id).ownerBotId).toBe("chief");
    expect(channels.pruneBots(["writer", "scout"]).channels).toEqual([]);
  });
});

describe("ChannelStore.clearHistory (BE-Y)", () => {
  function logged(database: OpenBotDatabase, needle: string): number {
    const row = database.connection
      .prepare("SELECT COUNT(*) AS n FROM orchestration_events WHERE payload_json LIKE ?")
      .get(`%${needle}%`);
    return Number(isDynamicRecord(row) ? row.n : 0);
  }

  it("removes the messages and tasks and keeps the channel, its members, memory and the other channels", async () => {
    const { database, channels } = await openStore();
    const channel = channels.create(launchPlan());
    const other = channels.create(launchPlan({ name: "other", title: "Other" }));
    channels.remember(channel.id, "chief", "Keep this memory");
    const first = channels.submit(channel.id, "Secret plan alpha");
    channels.submit(other.id, "Other channel request");
    channels.act({ taskId: first.task.id, action: "stop" });
    const seen: string[] = [];
    channels.on("event", (event) => seen.push(event.type));

    const cleared = channels.clearHistory(channel.id);

    expect(cleared).toEqual({ channelId: channel.id, removedMessages: 1, removedTasks: 1 });
    expect(channels.listMessages(channel.id)).toEqual([]);
    expect(channels.listTasks(channel.id)).toEqual([]);
    expect(channels.get(channel.id)).toMatchObject({
      name: "launch-plan",
      leadBotId: "chief",
      memberBotIds: ["chief", "writer"],
    });
    expect(channels.listMemory(channel.id).map((entry) => entry.text)).toEqual(["Keep this memory"]);
    // The other channel is untouched.
    expect(channels.listMessages(other.id)).toHaveLength(1);
    expect(channels.listTasks(other.id)).toHaveLength(1);
    expect(seen).toEqual(["channels-changed", "channel-history-cleared"]);
    // Nothing to clear a second time, and no error.
    expect(channels.clearHistory(channel.id)).toEqual({ channelId: channel.id, removedMessages: 0, removedTasks: 0 });
    database.close();
  });

  it("takes the text of the removed messages and tasks out of the event log, and keeps the memory and the other channel", async () => {
    const { database, channels } = await openStore();
    const channel = channels.create(launchPlan());
    const other = channels.create(launchPlan({ name: "other", title: "Other" }));
    channels.remember(channel.id, "chief", "Keep this memory");
    const sent = channels.submit(channel.id, "Secret plan alpha");
    channels.submit(other.id, "Other channel request");
    channels.act({ taskId: sent.task.id, action: "stop" });
    expect(logged(database, "Secret plan alpha")).toBeGreaterThan(0);

    channels.clearHistory(channel.id);

    expect(logged(database, "Secret plan alpha")).toBe(0);
    expect(logged(database, "Keep this memory")).toBeGreaterThan(0);
    expect(logged(database, "Other channel request")).toBeGreaterThan(0);
    // The channel itself and the clearing are in the log, with counts and no text.
    expect(logged(database, "channel.history-cleared")).toBe(0); // event_type is a column, not in the payload
    const row = database.connection
      .prepare("SELECT payload_json FROM orchestration_events WHERE event_type = 'channel.history-cleared'")
      .get();
    expect(isDynamicRecord(row) ? JSON.parse(String(row.payload_json)) : null).toEqual({
      channelId: channel.id,
      removedMessages: 1,
      removedTasks: 1,
    });
    database.close();
  });

  it("is refused while a task is queued, running, waiting or paused, and changes nothing", async () => {
    const { database, channels } = await openStore();
    const channel = channels.create(launchPlan());
    const queued = channels.submit(channel.id, "First");
    channels.submit(channel.id, "Second");
    expect(() => channels.clearHistory(channel.id)).toThrow(
      "This channel has 2 tasks in progress or paused. Stop or archive them first.",
    );
    channels.act({ taskId: queued.task.id, action: "stop" });
    expect(() => channels.clearHistory(channel.id)).toThrow(
      "This channel has 1 task in progress or paused. Stop or archive it first.",
    );
    expect(channels.listTasks(channel.id)).toHaveLength(2);
    expect(channels.listMessages(channel.id)).toHaveLength(2);
    // A paused task still counts: it can be resumed.
    const stopped = channels.listTasks(channel.id).find((task) => task.id !== queued.task.id);
    if (!stopped) throw new Error("the second task exists");
    channels.act({ taskId: stopped.id, action: "pause" });
    expect(() => channels.clearHistory(channel.id)).toThrow("in progress or paused");
    channels.act({ taskId: stopped.id, action: "stop" });
    expect(channels.clearHistory(channel.id)).toMatchObject({ removedTasks: 2, removedMessages: 2 });
    database.close();
  });

  it("refuses a channel that does not exist and survives a restart", async () => {
    const { root, database, channels } = await openStore();
    const channel = channels.create(launchPlan());
    const sent = channels.submit(channel.id, "Gone after restart");
    channels.act({ taskId: sent.task.id, action: "stop" });
    expect(() => channels.clearHistory("nope")).toThrow();
    channels.clearHistory(channel.id);
    database.close();
    const reopened = await openStore(root);
    expect(reopened.channels.listMessages(channel.id)).toEqual([]);
    expect(reopened.channels.listTasks(channel.id)).toEqual([]);
    expect(reopened.channels.get(channel.id).name).toBe("launch-plan");
  });
});
