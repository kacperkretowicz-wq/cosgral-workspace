import { describe, expect, it } from "vitest";
import {
  buildTaskDetail,
  buildTasksViewPage,
  isTaskDetail,
  isTasksViewPage,
  parseTaskDetailInput,
  parseTasksViewQuery,
  TASKS_VIEW_LIMITS,
  type TasksViewSource,
  taskActionStates,
} from "./ipc-tasks-view";
import type {
  ChannelAssignment,
  ChannelMessage,
  ChannelTask,
  ChannelTaskState,
  WorkspaceChannel,
} from "./ipc-workspace-channels";

const channel = (id: string, name: string): WorkspaceChannel => ({
  id,
  name,
  title: name.toUpperCase(),
  instructions: "",
  leadBotId: "chief",
  memberBotIds: ["chief", "writer"],
  isolated: false,
  archived: false,
  createdAt: "2026-11-16T08:00:00.000Z",
  updatedAt: "2026-11-16T08:00:00.000Z",
});

let counter = 0;
function task(patch: Partial<ChannelTask> & { channelId: string }): ChannelTask {
  counter += 1;
  return {
    id: `task-${counter}`,
    ownerBotId: "chief",
    state: "done",
    title: `Task ${counter}`,
    requestMessageId: `req-${counter}`,
    resultMessageId: null,
    parentTaskId: null,
    dependencyTaskIds: [],
    resourceKey: null,
    assignmentCount: 1,
    archivedAt: null,
    createdAt: "2026-11-16T09:00:00.000Z",
    updatedAt: "2026-11-16T09:00:00.000Z",
    ...patch,
  };
}

function message(patch: Partial<ChannelMessage> & { id: string; channelId: string }): ChannelMessage {
  return {
    taskId: null,
    authorBotId: null,
    kind: "human",
    text: "",
    replyToMessageId: null,
    resultVersion: null,
    superseded: false,
    createdAt: "2026-11-16T09:00:00.000Z",
    ...patch,
  };
}

function source(
  tasks: ChannelTask[],
  messages: ChannelMessage[],
  assignments: ChannelAssignment[] = [],
): TasksViewSource {
  return {
    channels: [channel("c1", "launch"), channel("c2", "ideas")],
    tasks: (channelId) => tasks.filter((item) => item.channelId === channelId),
    message: (channelId, id) => messages.find((item) => item.channelId === channelId && item.id === id) ?? null,
    taskMessages: (item) => ({
      messages: messages.filter((entry) => entry.channelId === item.channelId && entry.taskId === item.id),
      truncated: false,
    }),
    assignments: (taskId) => assignments.filter((item) => item.taskId === taskId),
    agentName: (botId) => ({ chief: "Chief", writer: "Writer" })[botId] ?? null,
  };
}

describe("tasks view query (W12 BE-J)", () => {
  it("fills in the defaults and trims the text", () => {
    expect(parseTasksViewQuery(undefined)).toEqual({
      scope: "active",
      states: [],
      limit: TASKS_VIEW_LIMITS.defaultPage,
      offset: 0,
    });
    expect(
      parseTasksViewQuery({ scope: "all", states: ["done", "done", "failed"], query: "  Plan ", limit: 5, offset: 10 }),
    ).toEqual({
      scope: "all",
      states: ["done", "failed"],
      query: "plan",
      limit: 5,
      offset: 10,
    });
  });

  it("refuses what the view cannot answer", () => {
    expect(() => parseTasksViewQuery({ scope: "old" })).toThrow("scope");
    expect(() => parseTasksViewQuery({ states: ["sleeping"] })).toThrow("state");
    expect(() => parseTasksViewQuery({ limit: TASKS_VIEW_LIMITS.maxPage + 1 })).toThrow("whole number");
    expect(() => parseTasksViewQuery({ offset: -1 })).toThrow("whole number");
    expect(() => parseTasksViewQuery({ query: "x".repeat(TASKS_VIEW_LIMITS.queryLength + 1) })).toThrow("at most");
    expect(() => parseTasksViewQuery("x")).toThrow("fields");
    expect(() => parseTaskDetailInput({})).toThrow("task");
    expect(parseTaskDetailInput({ taskId: "t" })).toEqual({ taskId: "t" });
  });
});

describe("what a task lets the person do (W12 BE-J)", () => {
  const states = (state: ChannelTaskState, archivedAt: string | null = null) =>
    Object.fromEntries(
      taskActionStates(task({ channelId: "c1", state, archivedAt })).map((item) => [item.action, item.enabled]),
    );

  it("follows the rules of the channel store", () => {
    expect(states("running")).toEqual({
      stop: true,
      pause: true,
      resume: false,
      archive: true,
      restore: false,
      reassign: true,
    });
    expect(states("paused")).toMatchObject({ stop: true, pause: false, resume: true, reassign: true });
    expect(states("cancelled")).toMatchObject({ stop: false, resume: true, reassign: false });
    expect(states("done", "2026-11-16T10:00:00.000Z")).toMatchObject({ archive: false, restore: true });
  });

  it("gives a reason for each action that is off", () => {
    const off = taskActionStates(task({ channelId: "c1", state: "done" })).filter((item) => !item.enabled);
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((item) => item.reason !== null && item.reason.length > 0)).toBe(true);
    expect(
      taskActionStates(task({ channelId: "c1", state: "running" })).find((item) => item.action === "stop")?.reason,
    ).toBeNull();
  });
});

describe("the list of tasks of all channels (W12 BE-J)", () => {
  const a = task({
    channelId: "c1",
    title: "Write the plan",
    state: "running",
    updatedAt: "2026-11-16T12:00:00.000Z",
    resultMessageId: null,
  });
  const b = task({
    channelId: "c2",
    title: "Name the product",
    ownerBotId: "writer",
    state: "done",
    updatedAt: "2026-11-16T11:00:00.000Z",
    resultMessageId: "res-b",
  });
  const c = task({
    channelId: "c1",
    title: "Old idea",
    state: "failed",
    archivedAt: "2026-11-16T10:30:00.000Z",
    updatedAt: "2026-11-16T10:00:00.000Z",
  });
  const step1 = task({
    channelId: "c1",
    title: "Outline",
    parentTaskId: a.id,
    state: "done",
    updatedAt: "2026-11-16T09:30:00.000Z",
  });
  const step2 = task({
    channelId: "c1",
    title: "Draft",
    parentTaskId: a.id,
    state: "running",
    updatedAt: "2026-11-16T09:40:00.000Z",
  });
  const messages = [
    message({
      id: "res-b",
      channelId: "c2",
      taskId: b.id,
      kind: "result",
      authorBotId: "writer",
      text: "The   name\n\nis   Nova.",
    }),
  ];
  const view = source([a, b, c, step1, step2], messages);

  it("lists active tasks, newest change first, with the channel, the owner, the steps and a preview of the result", () => {
    const page = buildTasksViewPage(parseTasksViewQuery({}), view);
    expect(page.items.map((item) => item.task.id)).toEqual([a.id, b.id, step2.id, step1.id]);
    expect(page.items[0]).toMatchObject({
      channelName: "launch",
      ownerName: "Chief",
      stepCount: 2,
      stepsDone: 1,
      resultPreview: null,
    });
    expect(page.items[1]).toMatchObject({
      channelName: "ideas",
      ownerName: "Writer",
      resultPreview: "The name is Nova.",
    });
    expect(page.counts.active).toBe(4);
    expect(page.counts.archived).toBe(1);
    expect(isTasksViewPage(page)).toBe(true);
  });

  it("filters by scope, state, channel, agent and text, and counts the states without the state filter", () => {
    expect(
      buildTasksViewPage(parseTasksViewQuery({ scope: "archived" }), view).items.map((item) => item.task.id),
    ).toEqual([c.id]);
    expect(buildTasksViewPage(parseTasksViewQuery({ scope: "all" }), view).total).toBe(5);
    const running = buildTasksViewPage(parseTasksViewQuery({ states: ["running"] }), view);
    expect(running.items.map((item) => item.task.id)).toEqual([a.id, step2.id]);
    expect(running.counts.byState).toMatchObject({ running: 2, done: 2, failed: 0 });
    expect(buildTasksViewPage(parseTasksViewQuery({ channelId: "c2" }), view).total).toBe(1);
    expect(buildTasksViewPage(parseTasksViewQuery({ ownerBotId: "writer" }), view).items[0]?.task.id).toBe(b.id);
    expect(buildTasksViewPage(parseTasksViewQuery({ query: "NOVA" }), view).total).toBe(0);
    expect(buildTasksViewPage(parseTasksViewQuery({ query: "ideas" }), view).items.map((item) => item.task.id)).toEqual(
      [b.id],
    );
    expect(buildTasksViewPage(parseTasksViewQuery({ query: "writer" }), view).total).toBe(1);
  });

  it("pages the list and says where the next page starts", () => {
    const first = buildTasksViewPage(parseTasksViewQuery({ limit: 3 }), view);
    expect(first.items).toHaveLength(3);
    expect(first.total).toBe(4);
    expect(first.nextOffset).toBe(3);
    const second = buildTasksViewPage(parseTasksViewQuery({ limit: 3, offset: 3 }), view);
    expect(second.items.map((item) => item.task.id)).toEqual([step1.id]);
    expect(second.nextOffset).toBeNull();
  });

  it("refuses a page that lacks its counts", () => {
    const page = buildTasksViewPage(parseTasksViewQuery({}), view);
    expect(isTasksViewPage({ ...page, counts: { active: 1 } })).toBe(false);
    expect(isTasksViewPage({ ...page, items: [{ ...page.items[0], stepCount: "2" }] })).toBe(false);
  });
});

describe("one task with its result, steps and log (W12 BE-J)", () => {
  const parent = task({
    channelId: "c1",
    title: "Launch post",
    state: "done",
    requestMessageId: "req",
    resultMessageId: "res-2",
    assignmentCount: 2,
  });
  const dependency = task({ channelId: "c1", title: "Collect facts", state: "done" });
  const root = { ...parent, dependencyTaskIds: [dependency.id] };
  const child = task({
    channelId: "c1",
    title: "Draft",
    parentTaskId: parent.id,
    state: "done",
    ownerBotId: "writer",
    resultMessageId: "res-1",
  });
  const messages = [
    message({
      id: "req",
      channelId: "c1",
      taskId: parent.id,
      text: "Write the launch post",
      createdAt: "2026-11-16T09:00:00.000Z",
    }),
    message({
      id: "a-1",
      channelId: "c1",
      taskId: parent.id,
      kind: "assignment",
      authorBotId: "chief",
      text: "Writer, please draft it",
      createdAt: "2026-11-16T09:01:00.000Z",
    }),
    message({
      id: "res-1",
      channelId: "c1",
      taskId: parent.id,
      kind: "result",
      authorBotId: "writer",
      text: "Draft v1",
      resultVersion: 1,
      superseded: true,
      createdAt: "2026-11-16T09:05:00.000Z",
    }),
    message({
      id: "res-2",
      channelId: "c1",
      taskId: parent.id,
      kind: "result",
      authorBotId: "chief",
      text: "Final post",
      resultVersion: 2,
      createdAt: "2026-11-16T09:10:00.000Z",
    }),
  ];
  const assignments: ChannelAssignment[] = [
    {
      id: "as-1",
      taskId: parent.id,
      ownerBotId: "chief",
      count: 1,
      reason: "Started by a person",
      createdAt: "2026-11-16T09:00:30.000Z",
    },
    {
      id: "as-2",
      taskId: parent.id,
      ownerBotId: "writer",
      count: 2,
      reason: "Handed over by the lead",
      createdAt: "2026-11-16T09:01:30.000Z",
    },
  ];
  const view = source([root, dependency, child], messages, assignments);

  it("gives the request, the result, the steps, the dependencies and the way to open the chat", () => {
    const detail = buildTaskDetail(root.id, view);
    expect(detail.request).toMatchObject({ messageId: "req", text: "Write the launch post" });
    expect(detail.result).toMatchObject({ messageId: "res-2", text: "Final post", version: 2, authorName: "Chief" });
    expect(detail.steps.map((step) => [step.title, step.state, step.ownerName])).toEqual([["Draft", "done", "Writer"]]);
    expect(detail.dependencies.map((step) => step.title)).toEqual(["Collect facts"]);
    expect(detail.openAsChat).toEqual({ channelId: "c1", anchorMessageId: "req" });
    expect(detail.channelName).toBe("launch");
    expect(detail.actions.find((item) => item.action === "archive")?.enabled).toBe(true);
    expect(isTaskDetail(detail)).toBe(true);
  });

  it("orders the log by time, without the request, and marks an answer that was replaced", () => {
    const detail = buildTaskDetail(root.id, view);
    expect(detail.log.map((entry) => entry.kind)).toEqual(["assigned", "assignment", "assigned", "result", "result"]);
    expect(detail.log.map((entry) => entry.at)).toEqual([...detail.log.map((entry) => entry.at)].sort());
    expect(detail.log[2]).toMatchObject({ kind: "assigned", botName: "Writer", text: "Handed over by the lead" });
    expect(detail.log[3]).toMatchObject({ kind: "result", superseded: true, version: 1 });
    expect(detail.log.find((entry) => entry.messageId === "req")).toBeUndefined();
    expect(detail.logTruncated).toBe(false);
  });

  it("keeps working when the result message is gone and says when the log was cut", () => {
    const lonely = { ...root, resultMessageId: "missing" };
    const cut: TasksViewSource = {
      ...source([lonely, dependency, child], messages, assignments),
      taskMessages: () => ({ messages: [], truncated: true }),
    };
    const detail = buildTaskDetail(lonely.id, cut);
    expect(detail.result).toBeNull();
    expect(detail.logTruncated).toBe(true);
    expect(isTaskDetail(detail)).toBe(true);
  });

  it("refuses a task that does not exist and an entry that is not a log entry", () => {
    expect(() => buildTaskDetail("nope", view)).toThrow("no longer exists");
    const detail = buildTaskDetail(root.id, view);
    expect(isTaskDetail({ ...detail, log: [{ ...detail.log[0], kind: "other" }] })).toBe(false);
    expect(isTaskDetail({ ...detail, openAsChat: { channelId: "c1" } })).toBe(false);
  });
});
