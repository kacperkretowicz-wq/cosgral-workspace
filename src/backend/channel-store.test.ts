// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHANNEL_LIMITS, type CreateWorkspaceChannelInput } from "@openbot/contracts/ipc";
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
