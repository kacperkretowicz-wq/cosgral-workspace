import { describe, expect, it } from "vitest";
import {
  CHANNEL_HISTORY_WINDOWS,
  DEFAULT_CHANNEL_HISTORY_WINDOW,
  isAgentEvent,
  isChannelHistoryWindow,
  isChannelName,
  isChannelTask,
  isWorkspaceChannel,
} from "./ipc";

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

  it("describes the history window of a channel: four values, 200 is the default, the channel guard accepts a missing or valid one (BE-Z)", () => {
    expect(CHANNEL_HISTORY_WINDOWS).toEqual([20, 50, 100, 200]);
    expect(DEFAULT_CHANNEL_HISTORY_WINDOW).toBe(200);
    expect(isChannelHistoryWindow(50)).toBe(true);
    expect(isChannelHistoryWindow(30)).toBe(false);
    expect(isChannelHistoryWindow("50")).toBe(false);
    const channel = {
      id: "c1",
      name: "team",
      title: "Team",
      instructions: "",
      leadBotId: null,
      memberBotIds: [],
      isolated: false,
      archived: false,
      createdAt: "2026-11-18T00:00:00.000Z",
      updatedAt: "2026-11-18T00:00:00.000Z",
    };
    expect(isWorkspaceChannel(channel)).toBe(true);
    expect(isWorkspaceChannel({ ...channel, historyWindow: 100 })).toBe(true);
    expect(isWorkspaceChannel({ ...channel, historyWindow: 7 })).toBe(false);
  });
});
