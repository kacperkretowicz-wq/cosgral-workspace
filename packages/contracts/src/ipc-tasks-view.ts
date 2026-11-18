// COSGRAL W12 (BE-J): the Tasks screen (screens 078-087) in two reads: ONE list of the tasks of ALL channels (with filters, counts and
// pages) and ONE task with its request, its result, its steps and a log of what happened. `window.openbot.channels` already has the
// writes (stop, pause, resume, archive, restore, reassign: `actOnTask`, `reassignTask`); this adds what a screen cannot get from
// `listTasks(channelId)` alone: all channels at once, the text of the result, the log, and a menu of what each task allows now.
//
// "Open as chat" needs no call of its own: `TaskDetail.openAsChat` names the channel and the message to scroll to (the request).
// "Steps" are the sub-tasks (`parentTaskId`); the log is made of the channel messages of the task and its assignments.
//
// The list and the detail are built by the pure functions below from plain data (`TasksViewSource`), so the program and the mock
// answer the same way. This computer only. Reading changes nothing.

import {
  CHANNEL_TASK_ACTIONS,
  CHANNEL_TASK_STATES,
  type ChannelAssignment,
  type ChannelMessage,
  type ChannelTask,
  type ChannelTaskAction,
  type ChannelTaskState,
  isChannelTask,
  isChannelTaskState,
  type WorkspaceChannel,
} from "./ipc-workspace-channels";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const TASKS_VIEW_LIMITS = {
  defaultPage: 50,
  maxPage: 200,
  maxOffset: 100_000,
  queryLength: 200,
  /** Characters of the result shown in the list. */
  preview: 240,
  /** Entries of the log of one task (the latest are kept). */
  logEntries: 200,
  /** Characters of one log entry (the full text of the result is in `TaskDetail.result`). */
  logText: 2_000,
} as const;

export const TASKS_VIEW_SCOPES = ["active", "archived", "all"] as const;
export type TasksViewScope = (typeof TASKS_VIEW_SCOPES)[number];

export interface TasksViewQuery {
  /** Default "active" (not archived). */
  scope?: TasksViewScope;
  /** Only these states; empty or missing = all. */
  states?: ChannelTaskState[];
  channelId?: string;
  ownerBotId?: string;
  /** Looks in the title, the channel (name and title) and the owner's name; not case-sensitive. */
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ParsedTasksViewQuery {
  scope: TasksViewScope;
  states: ChannelTaskState[];
  channelId?: string;
  ownerBotId?: string;
  /** Lowercase, trimmed. */
  query?: string;
  limit: number;
  offset: number;
}

export interface TasksViewItem {
  task: ChannelTask;
  channelName: string;
  channelTitle: string;
  /** The owner's name; null when that agent no longer exists. */
  ownerName: string | null;
  /** Sub-tasks and how many of them are done. */
  stepCount: number;
  stepsDone: number;
  /** The start of the result in one line; null while there is none. */
  resultPreview: string | null;
}

export interface TasksViewCounts {
  /** Tasks that are not archived / archived, after the channel, agent and text filters. */
  active: number;
  archived: number;
  /** By state, inside the scope, after the channel, agent and text filters but NOT the state filter (the filter chips show these). */
  byState: Record<ChannelTaskState, number>;
}

export interface TasksViewPage {
  items: TasksViewItem[];
  /** Tasks that match, all pages. */
  total: number;
  offset: number;
  /** Where the next page starts; null on the last page. */
  nextOffset: number | null;
  counts: TasksViewCounts;
}

export interface TaskDetailInput {
  taskId: string;
}

export const TASK_DETAIL_ACTIONS = [...CHANNEL_TASK_ACTIONS, "reassign"] as const;
export type TaskDetailAction = (typeof TASK_DETAIL_ACTIONS)[number];

export interface TaskActionState {
  action: TaskDetailAction;
  enabled: boolean;
  /** Why it is off, in plain words; null when it is on. */
  reason: string | null;
}

export interface TaskMessageView {
  messageId: string;
  text: string;
  createdAt: string;
  authorBotId: string | null;
  authorName: string | null;
  /** The version of a result (an answer that was redone has more than one). */
  version: number | null;
}

export interface TaskStep {
  taskId: string;
  title: string;
  state: ChannelTaskState;
  ownerBotId: string;
  ownerName: string | null;
  resultMessageId: string | null;
}

/** "assigned": a record of an assignment (who got the task and why); the others are channel messages of the task. */
export const TASK_LOG_KINDS = [
  "assigned",
  "assignment",
  "question",
  "reply",
  "result",
  "note",
  "system",
  "human",
] as const;
export type TaskLogKind = (typeof TASK_LOG_KINDS)[number];

export interface TaskLogEntry {
  id: string;
  at: string;
  kind: TaskLogKind;
  botId: string | null;
  botName: string | null;
  /** Cut to TASKS_VIEW_LIMITS.logText. */
  text: string;
  /** The channel message, or null for an assignment record. */
  messageId: string | null;
  /** Result entries: the version, and whether a newer answer replaced it. */
  version: number | null;
  superseded: boolean;
}

export interface TaskDetail {
  task: ChannelTask;
  channelName: string;
  channelTitle: string;
  ownerName: string | null;
  request: TaskMessageView | null;
  result: TaskMessageView | null;
  steps: TaskStep[];
  dependencies: TaskStep[];
  log: TaskLogEntry[];
  /** The log is not the whole story: older entries were cut. */
  logTruncated: boolean;
  /** "Open as chat": show this channel and scroll to this message. */
  openAsChat: { channelId: string; anchorMessageId: string };
  actions: TaskActionState[];
}

/** `window.openbot.tasksView` (this computer only). */
export interface TasksViewDesktopApi {
  list: (query?: TasksViewQuery) => Promise<TasksViewPage>;
  detail: (input: TaskDetailInput) => Promise<TaskDetail>;
}

/** What the lists and the detail are built from. The program reads it from the channel store, the mock from its sample data. */
export interface TasksViewSource {
  channels: WorkspaceChannel[];
  tasks: (channelId: string) => ChannelTask[];
  message: (channelId: string, messageId: string) => ChannelMessage | null;
  /** The channel messages that belong to the task, oldest first, and whether older ones were left out. */
  taskMessages: (task: ChannelTask) => { messages: ChannelMessage[]; truncated: boolean };
  assignments: (taskId: string) => ChannelAssignment[];
  agentName: (botId: string) => string | null;
}

// -- input ---------------------------------------------------------------------------------------------------------------------------

function whole(value: unknown, min: number, max: number, what: string): number {
  if (!isNumber(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${what} is a whole number from ${min} to ${max}.`);
  }
  return value;
}

function id(value: unknown, what: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isString(value) || value.length === 0) throw new Error(`${what} is not named.`);
  return value;
}

export function parseTasksViewQuery(input: unknown): ParsedTasksViewQuery {
  const raw = input === undefined ? {} : input;
  if (!isDynamicRecord(raw)) throw new Error("The task query is a set of fields.");
  const scope = raw.scope === undefined ? "active" : raw.scope;
  if (!isOneOf(TASKS_VIEW_SCOPES, scope)) throw new Error(`The scope is ${TASKS_VIEW_SCOPES.join(", ")}.`);
  let states: ChannelTaskState[] = [];
  if (raw.states !== undefined) {
    if (!Array.isArray(raw.states) || !raw.states.every(isChannelTaskState)) {
      throw new Error(`A state is one of ${CHANNEL_TASK_STATES.join(", ")}.`);
    }
    states = [...new Set(raw.states)];
  }
  const channelId = id(raw.channelId, "The channel");
  const ownerBotId = id(raw.ownerBotId, "The agent");
  let query: string | undefined;
  if (raw.query !== undefined) {
    if (!isString(raw.query) || raw.query.length > TASKS_VIEW_LIMITS.queryLength) {
      throw new Error(`The search text is at most ${TASKS_VIEW_LIMITS.queryLength} characters.`);
    }
    query = raw.query.trim().toLowerCase() || undefined;
  }
  return {
    scope,
    states,
    ...(channelId ? { channelId } : {}),
    ...(ownerBotId ? { ownerBotId } : {}),
    ...(query ? { query } : {}),
    limit:
      raw.limit === undefined
        ? TASKS_VIEW_LIMITS.defaultPage
        : whole(raw.limit, 1, TASKS_VIEW_LIMITS.maxPage, "The page size"),
    offset: raw.offset === undefined ? 0 : whole(raw.offset, 0, TASKS_VIEW_LIMITS.maxOffset, "The offset"),
  };
}

export function parseTaskDetailInput(input: unknown): TaskDetailInput {
  if (!isDynamicRecord(input) || !isString(input.taskId) || input.taskId.length === 0)
    throw new Error("Name the task.");
  return { taskId: input.taskId };
}

// -- rules shared by the engine and the mock -----------------------------------------------------------------------------------------

const OPEN: readonly ChannelTaskState[] = ["queued", "running", "waiting", "paused"];
const RUNNING: readonly ChannelTaskState[] = ["queued", "running", "waiting"];

/** What the person may do with the task now: the rules of the channel store, so the screen never offers what would be refused. */
export function taskActionStates(task: ChannelTask): TaskActionState[] {
  const make = (action: TaskDetailAction, reason: string | null): TaskActionState => ({
    action,
    enabled: reason === null,
    reason,
  });
  return [
    make("stop", OPEN.includes(task.state) ? null : "This task is already finished."),
    make("pause", RUNNING.includes(task.state) ? null : "This task is not running."),
    make(
      "resume",
      ["paused", "cancelled"].includes(task.state) ? null : "Only a paused or stopped task can be resumed.",
    ),
    make("archive", task.archivedAt === null ? null : "This task is already archived."),
    make("restore", task.archivedAt === null ? "This task is not archived." : null),
    make("reassign", ["done", "failed", "cancelled"].includes(task.state) ? "This task is finished." : null),
  ];
}

const ASSIGNMENT_REASON_TEXT: Readonly<Record<string, string>> = {
  "channel-task.created": "Task created.",
  "channel-task.reassigned": "Given to another agent.",
  "channel-task.continued": "Continued by the agent.",
  "channel-task.budget-reset": "Resumed by a person.",
  "channel-task.child-assigned": "Handed to a helper.",
};

/** An assignment is saved with the name of the event that made it; the log says it in plain words. Unknown text stays as it is. */
export function assignmentReasonText(reason: string): string {
  return ASSIGNMENT_REASON_TEXT[reason] ?? reason;
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function emptyCounts(): TasksViewCounts {
  return {
    active: 0,
    archived: 0,
    byState: { queued: 0, running: 0, waiting: 0, paused: 0, done: 0, failed: 0, cancelled: 0 },
  };
}

export function buildTasksViewPage(query: ParsedTasksViewQuery, source: TasksViewSource): TasksViewPage {
  const counts = emptyCounts();
  const matched: { task: ChannelTask; channel: WorkspaceChannel; all: ChannelTask[]; owner: string | null }[] = [];
  for (const channel of source.channels) {
    if (query.channelId !== undefined && channel.id !== query.channelId) continue;
    const all = source.tasks(channel.id);
    for (const task of all) {
      if (query.ownerBotId !== undefined && task.ownerBotId !== query.ownerBotId) continue;
      const owner = source.agentName(task.ownerBotId);
      if (query.query !== undefined) {
        const haystack = [task.title, channel.name, channel.title, owner ?? ""].join("\n").toLowerCase();
        if (!haystack.includes(query.query)) continue;
      }
      if (task.archivedAt === null) counts.active += 1;
      else counts.archived += 1;
      const inScope =
        query.scope === "all" || (query.scope === "archived" ? task.archivedAt !== null : task.archivedAt === null);
      if (!inScope) continue;
      counts.byState[task.state] += 1;
      if (query.states.length > 0 && !query.states.includes(task.state)) continue;
      matched.push({ task, channel, all, owner });
    }
  }
  matched.sort((a, b) => b.task.updatedAt.localeCompare(a.task.updatedAt) || a.task.id.localeCompare(b.task.id));
  const pageRows = matched.slice(query.offset, query.offset + query.limit);
  const items = pageRows.map(({ task, channel, all, owner }): TasksViewItem => {
    const steps = all.filter((entry) => entry.parentTaskId === task.id);
    const result = task.resultMessageId ? source.message(channel.id, task.resultMessageId) : null;
    return {
      task,
      channelName: channel.name,
      channelTitle: channel.title,
      ownerName: owner,
      stepCount: steps.length,
      stepsDone: steps.filter((step) => step.state === "done").length,
      resultPreview: result ? oneLine(result.text, TASKS_VIEW_LIMITS.preview) : null,
    };
  });
  const end = query.offset + items.length;
  return { items, total: matched.length, offset: query.offset, nextOffset: end < matched.length ? end : null, counts };
}

export function buildTaskDetail(taskId: string, source: TasksViewSource): TaskDetail {
  let found: { task: ChannelTask; channel: WorkspaceChannel; all: ChannelTask[] } | null = null;
  for (const channel of source.channels) {
    const all = source.tasks(channel.id);
    const task = all.find((entry) => entry.id === taskId);
    if (task) {
      found = { task, channel, all };
      break;
    }
  }
  if (!found) throw new Error("This task no longer exists.");
  const { task, channel, all } = found;
  const named = (botId: string | null): string | null => (botId === null ? null : source.agentName(botId));
  const viewOf = (message: ChannelMessage | null): TaskMessageView | null =>
    message
      ? {
          messageId: message.id,
          text: message.text,
          createdAt: message.createdAt,
          authorBotId: message.authorBotId,
          authorName: named(message.authorBotId),
          version: message.resultVersion,
        }
      : null;
  const stepOf = (entry: ChannelTask): TaskStep => ({
    taskId: entry.id,
    title: entry.title,
    state: entry.state,
    ownerBotId: entry.ownerBotId,
    ownerName: named(entry.ownerBotId),
    resultMessageId: entry.resultMessageId,
  });
  const scanned = source.taskMessages(task);
  const entries: TaskLogEntry[] = [
    ...source.assignments(task.id).map(
      (assignment): TaskLogEntry => ({
        id: `assignment:${assignment.id}`,
        at: assignment.createdAt,
        kind: "assigned",
        botId: assignment.ownerBotId,
        botName: named(assignment.ownerBotId),
        text: cut(assignmentReasonText(assignment.reason), TASKS_VIEW_LIMITS.logText),
        messageId: null,
        version: null,
        superseded: false,
      }),
    ),
    ...scanned.messages
      .filter((message) => message.id !== task.requestMessageId)
      .map(
        (message): TaskLogEntry => ({
          id: `message:${message.id}`,
          at: message.createdAt,
          kind: message.kind,
          botId: message.authorBotId,
          botName: named(message.authorBotId),
          text: cut(message.text, TASKS_VIEW_LIMITS.logText),
          messageId: message.id,
          version: message.resultVersion,
          superseded: message.superseded,
        }),
      ),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const tooMany = entries.length > TASKS_VIEW_LIMITS.logEntries;
  return {
    task,
    channelName: channel.name,
    channelTitle: channel.title,
    ownerName: named(task.ownerBotId),
    request: viewOf(source.message(channel.id, task.requestMessageId)),
    result: task.resultMessageId ? viewOf(source.message(channel.id, task.resultMessageId)) : null,
    steps: all.filter((entry) => entry.parentTaskId === task.id).map(stepOf),
    dependencies: task.dependencyTaskIds.flatMap((dependencyId) => {
      const dependency = all.find((entry) => entry.id === dependencyId);
      return dependency ? [stepOf(dependency)] : [];
    }),
    log: tooMany ? entries.slice(-TASKS_VIEW_LIMITS.logEntries) : entries,
    logTruncated: tooMany || scanned.truncated,
    openAsChat: { channelId: channel.id, anchorMessageId: task.requestMessageId },
    actions: taskActionStates(task),
  };
}

// -- guards ---------------------------------------------------------------------------------------------------------------------------

const optionalString = (value: unknown): boolean => value === null || isString(value);

function isCounts(value: unknown): value is TasksViewCounts {
  if (!isDynamicRecord(value) || !isNumber(value.active) || !isNumber(value.archived)) return false;
  const byState = value.byState;
  return isDynamicRecord(byState) && CHANNEL_TASK_STATES.every((state) => isNumber(byState[state]));
}

function isItem(value: unknown): value is TasksViewItem {
  return (
    isDynamicRecord(value) &&
    isChannelTask(value.task) &&
    isString(value.channelName) &&
    isString(value.channelTitle) &&
    optionalString(value.ownerName) &&
    isNumber(value.stepCount) &&
    isNumber(value.stepsDone) &&
    optionalString(value.resultPreview)
  );
}

export function isTasksViewPage(value: unknown): value is TasksViewPage {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    isNumber(value.total) &&
    isNumber(value.offset) &&
    (value.nextOffset === null || isNumber(value.nextOffset)) &&
    isCounts(value.counts)
  );
}

function isMessageView(value: unknown): value is TaskMessageView {
  return (
    isDynamicRecord(value) &&
    isString(value.messageId) &&
    isString(value.text) &&
    isString(value.createdAt) &&
    optionalString(value.authorBotId) &&
    optionalString(value.authorName) &&
    (value.version === null || isNumber(value.version))
  );
}

function isStep(value: unknown): value is TaskStep {
  return (
    isDynamicRecord(value) &&
    isString(value.taskId) &&
    isString(value.title) &&
    isChannelTaskState(value.state) &&
    isString(value.ownerBotId) &&
    optionalString(value.ownerName) &&
    optionalString(value.resultMessageId)
  );
}

function isLogEntry(value: unknown): value is TaskLogEntry {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.at) &&
    isOneOf(TASK_LOG_KINDS, value.kind) &&
    optionalString(value.botId) &&
    optionalString(value.botName) &&
    isString(value.text) &&
    optionalString(value.messageId) &&
    (value.version === null || isNumber(value.version)) &&
    isBoolean(value.superseded)
  );
}

function isActionState(value: unknown): value is TaskActionState {
  return (
    isDynamicRecord(value) &&
    isOneOf(TASK_DETAIL_ACTIONS, value.action) &&
    isBoolean(value.enabled) &&
    (value.enabled ? value.reason === null : isString(value.reason))
  );
}

export function isTaskDetail(value: unknown): value is TaskDetail {
  return (
    isDynamicRecord(value) &&
    isChannelTask(value.task) &&
    isString(value.channelName) &&
    isString(value.channelTitle) &&
    optionalString(value.ownerName) &&
    (value.request === null || isMessageView(value.request)) &&
    (value.result === null || isMessageView(value.result)) &&
    Array.isArray(value.steps) &&
    value.steps.every(isStep) &&
    Array.isArray(value.dependencies) &&
    value.dependencies.every(isStep) &&
    Array.isArray(value.log) &&
    value.log.every(isLogEntry) &&
    isBoolean(value.logTruncated) &&
    isDynamicRecord(value.openAsChat) &&
    isString(value.openAsChat.channelId) &&
    isString(value.openAsChat.anchorMessageId) &&
    Array.isArray(value.actions) &&
    value.actions.every(isActionState)
  );
}

/** For the screen: the action names that `actOnTask` takes (reassign has its own call). */
export function isChannelActionName(action: TaskDetailAction): action is ChannelTaskAction {
  return action !== "reassign";
}
