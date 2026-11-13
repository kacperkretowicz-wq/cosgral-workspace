// COSGRAL W1: channels with a lead agent, and channel tasks.
//
// A channel has a name, a title, instructions, member agents and a lead; its history is shared.
// A person's message in a channel becomes a task with an owner, a state and a result.
// W1-BE1 fixed the read side agreed by Backend and UI (PLAN.md, leader decision 4).
// W1-BE2 adds what the Tester's description W1-T1 (docs/cosgral/spec-w1-kanaly.md) needs:
// a paused state, archive as its own field (Stop is not Archive), sub-tasks, dependencies,
// tasks on the same resource one after another, isolated channels, limits and the write side.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const CHANNEL_LIMITS = {
  /** Short name: lowercase letters, digits and dashes, unique on this computer. */
  name: 40,
  title: 120,
  instructions: 2_000,
  memoryEntry: 500,
  automaticAssignments: 8,
  message: 32_000,
  historyPage: 200,
  members: 20,
  taskTitle: 120,
  /** Answers a member may give to one short question from another member. */
  repliesPerRequest: 2,
} as const;

/**
 * "paused": stopped for now (by a person or the automatic assignment limit); a person resumes it.
 * "cancelled": stopped by a person or the lead; a person may still resume it.
 * Archive is not a state: see `ChannelTask.archivedAt`.
 */
export const CHANNEL_TASK_STATES = ["queued", "running", "waiting", "paused", "done", "failed", "cancelled"] as const;
export type ChannelTaskState = (typeof CHANNEL_TASK_STATES)[number];

/** Actions a person takes on a task in the Tasks view. */
export const CHANNEL_TASK_ACTIONS = ["stop", "pause", "resume", "archive", "restore"] as const;
export type ChannelTaskAction = (typeof CHANNEL_TASK_ACTIONS)[number];

export interface ChannelTask {
  id: string;
  channelId: string;
  /** The agent that owns the task (`BotSummary.id`); the UI reads its name from the bot list. */
  ownerBotId: string;
  state: ChannelTaskState;
  title: string;
  /** The person's message that started the task (for a sub-task: the message that asked for it). */
  requestMessageId: string;
  /** The message with the result, once there is one. A task has one result. */
  resultMessageId: string | null;
  /** The task this one helps with, or null for a task started by a person. */
  parentTaskId: string | null;
  /** Tasks that must be done before this one starts. */
  dependencyTaskIds: string[];
  /** Tasks with the same key run one after another, e.g. the same working folder. */
  resourceKey: string | null;
  /** How often the task was assigned, reassignments included. */
  assignmentCount: number;
  /** Set while the task is archived (hidden from the active list); Restore clears it. Independent of `state`. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Dispatch budget since the last human resume/reassignment. Total stays in assignmentCount. */
  automaticAssignmentCount?: number;
  waitingForTaskIds?: string[];
  pauseReason?: string | null;
  kind?: "work" | "question";
  /** Shared budget across the answers of one short question. */
  questionRootId?: string | null;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  taskId: string | null;
  authorBotId: string | null;
  kind: "human" | "assignment" | "question" | "reply" | "result" | "note" | "system";
  text: string;
  replyToMessageId: string | null;
  resultVersion: number | null;
  superseded: boolean;
  createdAt: string;
}

export interface ChannelMemory {
  id: string;
  channelId: string;
  /** The member agent that saved it; null when a person added it (COSGRAL W2). */
  authorBotId: string | null;
  text: string;
  createdAt: string;
  /** Set when the entry was edited (COSGRAL W2). */
  updatedAt?: string;
}

export interface ChannelAssignment {
  id: string;
  taskId: string;
  ownerBotId: string;
  count: number;
  reason: string;
  createdAt: string;
}

export function isChannelMemory(value: unknown): value is ChannelMemory {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.channelId) &&
    (isString(value.authorBotId) || value.authorBotId === null) &&
    isString(value.text) &&
    isString(value.createdAt) &&
    (value.updatedAt === undefined || isString(value.updatedAt))
  );
}
export function isChannelAssignment(value: unknown): value is ChannelAssignment {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.taskId) &&
    isString(value.ownerBotId) &&
    isNumber(value.count) &&
    isString(value.reason) &&
    isString(value.createdAt)
  );
}

export interface SendChannelMessageInput {
  channelId: string;
  text: string;
  resourceKey?: string | null;
}
export interface ListChannelMessagesInput {
  channelId: string;
  beforeMessageId?: string;
  limit?: number;
}

export function isChannelMessage(value: unknown): value is ChannelMessage {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.channelId) &&
    (value.taskId === null || isString(value.taskId)) &&
    (value.authorBotId === null || isString(value.authorBotId)) &&
    isOneOf(["human", "assignment", "question", "reply", "result", "note", "system"] as const, value.kind) &&
    isString(value.text) &&
    (value.replyToMessageId === null || isString(value.replyToMessageId)) &&
    (value.resultVersion === null ||
      (isNumber(value.resultVersion) && Number.isInteger(value.resultVersion) && value.resultVersion > 0)) &&
    isBoolean(value.superseded) &&
    isString(value.createdAt)
  );
}

export interface WorkspaceChannel {
  id: string;
  /** Short name, e.g. "launch-plan" (see `CHANNEL_LIMITS.name`). */
  name: string;
  /** Display title, e.g. "Launch plan"; may be empty. */
  title: string;
  instructions: string;
  /** The lead agent (`BotSummary.id`), always one of the members. */
  leadBotId: string | null;
  /** Member agents, the lead included. */
  memberBotIds: string[];
  /** Tools, memory and context stay inside the channel. */
  isolated: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceChannelInput {
  name: string;
  title: string;
  instructions: string;
  memberBotIds: string[];
  /** Must be one of `memberBotIds`. */
  leadBotId: string;
  isolated: boolean;
}

export interface UpdateWorkspaceChannelInput {
  channelId: string;
  title?: string;
  instructions?: string;
  isolated?: boolean;
  archived?: boolean;
}

/** Add or remove a member, or make a member the lead. */
export interface ChannelMemberInput {
  channelId: string;
  botId: string;
}

export interface ChannelTaskActionInput {
  taskId: string;
  action: ChannelTaskAction;
}

/** Give the task to another member; it starts again for the new owner. */
export interface ReassignChannelTaskInput {
  taskId: string;
  ownerBotId: string;
}

export function isChannelName(value: unknown): value is string {
  return isString(value) && value.length <= CHANNEL_LIMITS.name && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

export function isChannelTaskState(value: unknown): value is ChannelTaskState {
  return isOneOf(CHANNEL_TASK_STATES, value);
}

export function isChannelTaskAction(value: unknown): value is ChannelTaskAction {
  return isOneOf(CHANNEL_TASK_ACTIONS, value);
}

export function isChannelTask(value: unknown): value is ChannelTask {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.channelId) &&
    isString(value.ownerBotId) &&
    isChannelTaskState(value.state) &&
    isString(value.title) &&
    isString(value.requestMessageId) &&
    (value.resultMessageId === null || isString(value.resultMessageId)) &&
    (value.parentTaskId === null || isString(value.parentTaskId)) &&
    Array.isArray(value.dependencyTaskIds) &&
    value.dependencyTaskIds.every(isString) &&
    (value.resourceKey === null || isString(value.resourceKey)) &&
    isNumber(value.assignmentCount) &&
    (value.archivedAt === null || isString(value.archivedAt)) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isWorkspaceChannel(value: unknown): value is WorkspaceChannel {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.title) &&
    isString(value.instructions) &&
    (value.leadBotId === null || isString(value.leadBotId)) &&
    Array.isArray(value.memberBotIds) &&
    value.memberBotIds.every(isString) &&
    isBoolean(value.isolated) &&
    isBoolean(value.archived) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}
