// COSGRAL W1: channels with a lead agent, and channel tasks.
//
// A channel has a name, a title, instructions, member agents and a lead; its history is shared.
// A person's message in a channel becomes a task with an owner, a state and a result.
// W1-BE1 fixes the read side agreed by Backend and UI (PLAN.md, leader decision 4).
// The engine and the write side (create, send, assign, stop, resume, archive) come in W1-BE2,
// after the Tester's description W1-T1.

import { isBoolean, isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const CHANNEL_TASK_STATES = ["queued", "running", "waiting", "done", "failed", "cancelled"] as const;
export type ChannelTaskState = (typeof CHANNEL_TASK_STATES)[number];

export interface ChannelTask {
  id: string;
  channelId: string;
  /** The agent that owns the task (`BotSummary.id`); the UI reads its name from the bot list. */
  ownerBotId: string;
  state: ChannelTaskState;
  title: string;
  /** The person's message that started the task. */
  requestMessageId: string;
  /** The message with the result, once there is one. */
  resultMessageId: string | null;
  updatedAt: string;
}

export interface WorkspaceChannel {
  id: string;
  /** Short name, e.g. "launch-plan". */
  name: string;
  /** Display title, e.g. "Launch plan". */
  title: string;
  instructions: string;
  /** The lead agent (`BotSummary.id`), or null before one is chosen. */
  leadBotId: string | null;
  /** Member agents, the lead included. */
  memberBotIds: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export function isChannelTaskState(value: unknown): value is ChannelTaskState {
  return isOneOf(CHANNEL_TASK_STATES, value);
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
    isBoolean(value.archived) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}
