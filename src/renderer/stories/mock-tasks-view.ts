// COSGRAL W12 (BE-J): the Tasks view for Storybook and the preview (`window.openbot.tasksView`). Demo data only. It answers with the
// same rules as the program (`buildTasksViewPage`, `buildTaskDetail`), so the screen sees the same shapes. `createMockTasksView()` with no
// options has its own small sample; the mock window passes its channels, tasks and messages so the two views agree.

import {
  buildTaskDetail,
  buildTasksViewPage,
  type ChannelAssignment,
  type ChannelMessage,
  type ChannelTask,
  parseTaskDetailInput,
  parseTasksViewQuery,
  type TasksViewDesktopApi,
  type TasksViewSource,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";

export interface MockTasksViewOptions {
  channels: () => WorkspaceChannel[];
  tasks: () => ChannelTask[];
  messages: () => ChannelMessage[];
  assignments?: () => ChannelAssignment[];
  agentName?: (botId: string) => string | null;
}

const T0 = "2026-11-16T09:00:00.000Z";

function sample(): MockTasksViewOptions {
  const channel: WorkspaceChannel = {
    id: "sample-channel",
    name: "launch",
    title: "Launch",
    instructions: "",
    leadBotId: "chief",
    memberBotIds: ["chief", "research"],
    isolated: false,
    archived: false,
    createdAt: T0,
    updatedAt: T0,
  };
  const base = {
    channelId: channel.id,
    dependencyTaskIds: [],
    resourceKey: null,
    assignmentCount: 1,
    archivedAt: null,
    createdAt: T0,
  };
  const tasks: ChannelTask[] = [
    {
      ...base,
      id: "sample-task-1",
      ownerBotId: "chief",
      state: "done",
      title: "Write the launch post",
      requestMessageId: "sample-request",
      resultMessageId: "sample-result",
      parentTaskId: null,
      updatedAt: "2026-11-16T09:10:00.000Z",
    },
    {
      ...base,
      id: "sample-task-2",
      ownerBotId: "research",
      state: "done",
      title: "Collect the facts",
      requestMessageId: "sample-request",
      resultMessageId: null,
      parentTaskId: "sample-task-1",
      updatedAt: "2026-11-16T09:05:00.000Z",
    },
    {
      ...base,
      id: "sample-task-3",
      ownerBotId: "research",
      state: "running",
      title: "Compare the competitors",
      requestMessageId: "sample-request-2",
      resultMessageId: null,
      parentTaskId: null,
      updatedAt: "2026-11-16T09:20:00.000Z",
    },
    {
      ...base,
      id: "sample-task-4",
      ownerBotId: "chief",
      state: "cancelled",
      title: "Plan the old campaign",
      requestMessageId: "sample-request-2",
      resultMessageId: null,
      parentTaskId: null,
      archivedAt: "2026-11-16T09:30:00.000Z",
      updatedAt: "2026-11-16T09:30:00.000Z",
    },
  ];
  const message = (patch: Partial<ChannelMessage> & { id: string }): ChannelMessage => ({
    channelId: channel.id,
    taskId: null,
    authorBotId: null,
    kind: "human",
    text: "",
    replyToMessageId: null,
    resultVersion: null,
    superseded: false,
    createdAt: T0,
    ...patch,
  });
  const messages: ChannelMessage[] = [
    message({ id: "sample-request", taskId: "sample-task-1", text: "Write the launch post." }),
    message({
      id: "sample-request-2",
      taskId: "sample-task-3",
      text: "Compare us with the competitors.",
      createdAt: "2026-11-16T09:15:00.000Z",
    }),
    message({
      id: "sample-result",
      taskId: "sample-task-1",
      authorBotId: "chief",
      kind: "result",
      text: "Here is the post.\n\nIt is short and clear.",
      resultVersion: 1,
      createdAt: "2026-11-16T09:10:00.000Z",
    }),
  ];
  const assignments: ChannelAssignment[] = [
    {
      id: "sample-a1",
      taskId: "sample-task-1",
      ownerBotId: "chief",
      count: 1,
      reason: "Started by a person",
      createdAt: T0,
    },
  ];
  return {
    channels: () => [channel],
    tasks: () => tasks,
    messages: () => messages,
    assignments: () => assignments,
  };
}

export function createMockTasksView(options: MockTasksViewOptions = sample()): Required<TasksViewDesktopApi> {
  const source = (): TasksViewSource => {
    const messages = options.messages();
    return {
      channels: options.channels(),
      tasks: (channelId) => options.tasks().filter((task) => task.channelId === channelId),
      message: (channelId, id) => messages.find((item) => item.channelId === channelId && item.id === id) ?? null,
      taskMessages: (task) => ({
        messages: messages.filter((item) => item.channelId === task.channelId && item.taskId === task.id),
        truncated: false,
      }),
      assignments: (taskId) => (options.assignments?.() ?? []).filter((item) => item.taskId === taskId),
      agentName: options.agentName ?? ((botId) => botId),
    };
  };
  return {
    list: async (query) => structuredClone(buildTasksViewPage(parseTasksViewQuery(query), source())),
    detail: async (input) => structuredClone(buildTaskDetail(parseTaskDetailInput(input).taskId, source())),
  };
}
