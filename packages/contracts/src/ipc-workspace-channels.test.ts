import { describe, expect, it } from "vitest";
import { isAgentEvent, isChannelName, isChannelTask, isWorkspaceChannel } from "./ipc";

const AT = "2026-11-12T21:00:00.000Z";

const task = {
  id: "t1",
  channelId: "c1",
  ownerBotId: "chief",
  state: "paused",
  title: "Prepare the report",
  requestMessageId: "m1",
  resultMessageId: null,
  parentTaskId: null,
  dependencyTaskIds: ["t0"],
  resourceKey: "c:\\work\\report",
  assignmentCount: 1,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
};

const channel = {
  id: "c1",
  name: "launch-plan",
  title: "Launch plan",
  instructions: "Short answers.",
  leadBotId: "chief",
  memberBotIds: ["chief", "writer"],
  isolated: true,
  archived: false,
  createdAt: AT,
  updatedAt: AT,
};

describe("W1-BE2 channel contract", () => {
  it("accepts a paused, archived or dependent task with its lifecycle fields", () => {
    expect(isChannelTask(task)).toBe(true);
    expect(isChannelTask({ ...task, state: "done", resultMessageId: "m2", archivedAt: AT })).toBe(true);
    expect(isChannelTask({ ...task, dependencyTaskIds: [7] })).toBe(false);
    expect(isChannelTask({ ...task, assignmentCount: "1" })).toBe(false);
    expect(isChannelTask({ ...task, state: "archived" })).toBe(false);
    expect(isAgentEvent({ type: "task-changed", task })).toBe(true);
  });

  it("accepts an isolated channel and checks short names", () => {
    expect(isWorkspaceChannel(channel)).toBe(true);
    expect(isWorkspaceChannel({ ...channel, isolated: "yes" })).toBe(false);
    expect(isAgentEvent({ type: "channels-changed", channels: [channel] })).toBe(true);

    expect(isChannelName("launch-plan")).toBe(true);
    expect(isChannelName("q4")).toBe(true);
    expect(isChannelName("Launch plan")).toBe(false);
    expect(isChannelName("-plan")).toBe(false);
    expect(isChannelName("x".repeat(41))).toBe(false);
  });
});
