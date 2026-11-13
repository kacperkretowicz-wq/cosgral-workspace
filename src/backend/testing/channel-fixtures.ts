import type { BotSummary, ChannelTask, WorkspaceChannel } from "@openbot/contracts/ipc";
export function channelTaskFixture(overrides: Partial<ChannelTask> = {}): ChannelTask {
  return {
    id: "task",
    channelId: "channel",
    ownerBotId: "a",
    state: "running",
    title: "Task",
    requestMessageId: "request",
    resultMessageId: null,
    parentTaskId: null,
    dependencyTaskIds: [],
    resourceKey: null,
    assignmentCount: 1,
    archivedAt: null,
    createdAt: "2026-11-12T12:00:00Z",
    updatedAt: "2026-11-12T12:00:00Z",
    ...overrides,
  };
}
export function channelFixture(overrides: Partial<WorkspaceChannel> = {}): WorkspaceChannel {
  return {
    id: "channel",
    name: "team",
    title: "Team",
    instructions: "Channel rules",
    memberBotIds: ["a"],
    leadBotId: "a",
    isolated: true,
    archived: false,
    createdAt: "2026-11-12T12:00:00Z",
    updatedAt: "2026-11-12T12:00:00Z",
    ...overrides,
  };
}
export function channelBotFixture(): BotSummary {
  return {
    id: "a",
    name: "A",
    role: "Writer",
    description: "",
    notifications: true,
    workspacePath: "C:\\work",
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    threadId: null,
    preview: "",
    updatedAt: null,
    avatarSeed: "a",
    avatarHue: null,
    avatarUrl: null,
  };
}
