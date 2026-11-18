import { describe, expect, it } from "vitest";
import {
  assignmentReasonText,
  buildTaskDetail,
  buildTasksBoard,
  buildTasksViewPage,
  isTaskDetail,
  isTasksBoard,
  isTasksViewPage,
  parseTaskDetailInput,
  parseTasksBoardQuery,
  parseTasksViewQuery,
  TASKS_BOARD_LIMITS,
  TASKS_VIEW_LIMITS,
  type TasksBoard,
  type TasksBoardColumn,
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

describe("assignment reasons in plain words (W12 BE-J)", () => {
  it("says what the store's event names mean and leaves other text as it is", () => {
    expect(assignmentReasonText("channel-task.created")).toBe("Task created.");
    expect(assignmentReasonText("channel-task.reassigned")).toBe("Given to another agent.");
    expect(assignmentReasonText("Started by a person")).toBe("Started by a person");
  });
});

describe("the board of the Tasks view (W12 BE-AA)", () => {
  const t = (patch: Partial<ChannelTask> & { channelId: string }) => task(patch);
  const needs = t({ channelId: "c1", title: "Answer waits", state: "done", updatedAt: "2026-11-16T12:00:00.000Z" });
  const askHelp = t({
    channelId: "c1",
    title: "Waits for a helper",
    state: "waiting",
    updatedAt: "2026-11-16T11:00:00.000Z",
  });
  const work = t({ channelId: "c1", title: "Running", state: "running", updatedAt: "2026-11-16T10:00:00.000Z" });
  const queued = t({
    channelId: "c2",
    title: "Queued",
    state: "queued",
    ownerBotId: "writer",
    updatedAt: "2026-11-16T09:50:00.000Z",
  });
  const paused = t({ channelId: "c1", title: "Paused", state: "paused", updatedAt: "2026-11-16T09:40:00.000Z" });
  const broke = t({ channelId: "c2", title: "Broke", state: "failed", updatedAt: "2026-11-16T09:30:00.000Z" });
  const broke2 = t({ channelId: "c2", title: "Broke again", state: "failed", updatedAt: "2026-11-16T09:20:00.000Z" });
  const broke3 = t({
    channelId: "c1",
    title: "Broke a third time",
    state: "failed",
    updatedAt: "2026-11-16T09:10:00.000Z",
  });
  const stopped = t({ channelId: "c1", title: "Stopped", state: "cancelled", updatedAt: "2026-11-16T09:05:00.000Z" });
  const step = t({
    channelId: "c1",
    title: "A step of the running one",
    parentTaskId: work.id,
    state: "failed",
    updatedAt: "2026-11-16T12:30:00.000Z",
  });
  const archived = t({
    channelId: "c1",
    title: "Old",
    state: "failed",
    archivedAt: "2026-11-16T08:00:00.000Z",
    updatedAt: "2026-11-16T08:00:00.000Z",
  });
  const all = [needs, askHelp, work, queued, paused, broke, broke2, broke3, stopped, step, archived];
  const view = source(all, []);
  const ids = (entry: { items: { task: ChannelTask }[] }) => entry.items.map((item) => item.task.id);
  const column = (board: TasksBoard, index: number): TasksBoardColumn => {
    const found = board.columns[index];
    if (!found) throw new Error(`The board has no column ${index}.`);
    return found;
  };

  it("has five fixed columns, each task of a top-level kind in its own, newest change first, with the real totals", () => {
    const board = buildTasksBoard(parseTasksBoardQuery({}), view);
    expect(board.columns.map((column) => column.id)).toEqual(["needs-you", "working", "paused", "failed", "cancelled"]);
    expect(board.columns.map((column) => column.states)).toEqual([
      ["waiting", "done"],
      ["running", "queued"],
      ["paused"],
      ["failed"],
      ["cancelled"],
    ]);
    expect(ids(column(board, 0))).toEqual([needs.id, askHelp.id]);
    expect(ids(column(board, 1))).toEqual([work.id, queued.id]);
    expect(ids(column(board, 2))).toEqual([paused.id]);
    // The failed column: the three failed tasks, NOT the failed step (it is counted in its parent) and NOT the archived one.
    expect(ids(column(board, 3))).toEqual([broke.id, broke2.id, broke3.id]);
    expect(ids(column(board, 4))).toEqual([stopped.id]);
    expect(board.columns.map((column) => column.total)).toEqual([2, 2, 1, 3, 1]);
    expect(board.columns.every((column) => !column.hasMore)).toBe(true);
    // The parent shows its steps.
    const running = board.columns[1]?.items.find((item) => item.task.id === work.id);
    expect(running).toMatchObject({ stepCount: 1, stepsDone: 0, channelName: "launch", ownerName: "Chief" });
  });

  it("cuts a column at the size asked for and says how many are left, without losing the total", () => {
    const board = buildTasksBoard(parseTasksBoardQuery({ perColumn: 2 }), view);
    const failed = board.columns[3];
    expect(failed?.items.map((item) => item.task.id)).toEqual([broke.id, broke2.id]);
    expect(failed).toMatchObject({ total: 3, hasMore: true });
    expect(board.columns[0]).toMatchObject({ total: 2, hasMore: false });
  });

  it("applies scope, channel, agent and text to every column, and the counts stay those of the whole view", () => {
    const archivedBoard = buildTasksBoard(parseTasksBoardQuery({ scope: "archived" }), view);
    expect(archivedBoard.columns.map((column) => column.total)).toEqual([0, 0, 0, 1, 0]);
    const channelBoard = buildTasksBoard(parseTasksBoardQuery({ channelId: "c2" }), view);
    expect(channelBoard.columns.map((column) => column.total)).toEqual([0, 1, 0, 2, 0]);
    const agentBoard = buildTasksBoard(parseTasksBoardQuery({ ownerBotId: "writer" }), view);
    expect(agentBoard.columns.map((column) => column.total)).toEqual([0, 1, 0, 0, 0]);
    const textBoard = buildTasksBoard(parseTasksBoardQuery({ query: "  BROKE " }), view);
    expect(textBoard.columns.map((column) => column.total)).toEqual([0, 0, 0, 3, 0]);
    // The counts of the page (top-level tasks, by state) come with the board.
    expect(board_counts(view).byState.failed).toBe(3);
    expect(board_counts(view).active).toBe(9);
    expect(board_counts(view).archived).toBe(1);
  });

  it("reads only what a board can answer: a column size, no states, no paging", () => {
    expect(parseTasksBoardQuery(undefined)).toMatchObject({
      scope: "active",
      perColumn: TASKS_BOARD_LIMITS.defaultPerColumn,
    });
    expect(parseTasksBoardQuery({ perColumn: 50 }).perColumn).toBe(50);
    expect(() => parseTasksBoardQuery({ perColumn: 0 })).toThrow("The column size is a whole number from 1 to 50.");
    expect(() => parseTasksBoardQuery({ perColumn: 51 })).toThrow("The column size is a whole number from 1 to 50.");
    expect(() => parseTasksBoardQuery({ perColumn: 2.5 })).toThrow("The column size is a whole number from 1 to 50.");
    expect(() => parseTasksBoardQuery({ states: ["done"] })).toThrow("The board has fixed columns");
    expect(() => parseTasksBoardQuery({ limit: 10 })).toThrow("The board has fixed columns");
    expect(() => parseTasksBoardQuery({ offset: 10 })).toThrow("The board has fixed columns");
    expect(() => parseTasksBoardQuery("x")).toThrow("The task query is a set of fields.");
    expect(() => parseTasksBoardQuery({ scope: "nope" })).toThrow("The scope is");
  });

  it("checks a board before the window uses it", () => {
    const board = buildTasksBoard(parseTasksBoardQuery({}), view);
    expect(isTasksBoard(board)).toBe(true);
    expect(isTasksBoard({ ...board, columns: board.columns.slice(1) })).toBe(false);
    expect(
      isTasksBoard({ ...board, columns: [{ ...board.columns[0], hasMore: "no" }, ...board.columns.slice(1)] }),
    ).toBe(false);
    expect(isTasksBoard({ ...board, counts: undefined })).toBe(false);
    expect(isTasksBoard(null)).toBe(false);
  });

  function board_counts(source_: TasksViewSource) {
    return buildTasksBoard(parseTasksBoardQuery({}), source_).counts;
  }
});
