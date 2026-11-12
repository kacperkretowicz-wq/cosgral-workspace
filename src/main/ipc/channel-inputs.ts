// COSGRAL W1-BE2: input checks for channel and channel task requests from the renderer.
// Lengths and rules are checked again by the channel store.

import {
  CHANNEL_LIMITS,
  type ChannelMemberInput,
  type ChannelTaskActionInput,
  type CreateWorkspaceChannelInput,
  isChannelTaskAction,
  type ListChannelMessagesInput,
  type ReassignChannelTaskInput,
  type SendChannelMessageInput,
  type UpdateWorkspaceChannelInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isNumber, isString } from "@openbot/contracts/runtime-values";
import { channelResourceKey } from "../../backend/channel-store";
import { isObject, requireString } from "./validation";

export function parseChannelId(value: unknown): string {
  return requireString(value, "channelId");
}

export function parseSendChannelMessage(value: unknown): SendChannelMessageInput {
  if (!isObject(value)) throw new Error("Message details are required.");
  const input: SendChannelMessageInput = {
    channelId: requireString(value.channelId, "channelId"),
    text: requireString(value.text, "text", CHANNEL_LIMITS.message),
  };
  if (value.resourceKey !== undefined) {
    if (value.resourceKey !== null && !isString(value.resourceKey))
      throw new Error("resourceKey must be text or null.");
    input.resourceKey = channelResourceKey(value.resourceKey);
  }
  return input;
}

export function parseListChannelMessages(value: unknown): ListChannelMessagesInput {
  if (!isObject(value)) throw new Error("History details are required.");
  const input: ListChannelMessagesInput = { channelId: requireString(value.channelId, "channelId") };
  if (value.beforeMessageId !== undefined)
    input.beforeMessageId = requireString(value.beforeMessageId, "beforeMessageId");
  if (value.limit !== undefined) {
    if (
      !isNumber(value.limit) ||
      !Number.isInteger(value.limit) ||
      value.limit < 1 ||
      value.limit > CHANNEL_LIMITS.historyPage
    )
      throw new Error("Invalid history page size.");
    input.limit = value.limit;
  }
  return input;
}

export function parseCreateChannel(value: unknown): CreateWorkspaceChannelInput {
  if (!isObject(value)) throw new Error("Channel details are required.");
  const memberBotIds = value.memberBotIds;
  if (!Array.isArray(memberBotIds) || memberBotIds.length > CHANNEL_LIMITS.members * 2) {
    throw new Error("memberBotIds must be a list of agent ids.");
  }
  return {
    name: requireString(value.name, "name", CHANNEL_LIMITS.name * 2),
    title: optionalText(value.title, "title", CHANNEL_LIMITS.title * 2) ?? "",
    instructions: optionalText(value.instructions, "instructions", CHANNEL_LIMITS.instructions * 2) ?? "",
    memberBotIds: memberBotIds.map((botId) => requireString(botId, "memberBotIds")),
    leadBotId: requireString(value.leadBotId, "leadBotId"),
    isolated: requiredFlag(value.isolated, "isolated"),
  };
}

export function parseUpdateChannel(value: unknown): UpdateWorkspaceChannelInput {
  if (!isObject(value)) throw new Error("Channel details are required.");
  const input: UpdateWorkspaceChannelInput = { channelId: requireString(value.channelId, "channelId") };
  const title = optionalText(value.title, "title", CHANNEL_LIMITS.title * 2);
  if (title !== undefined) input.title = title;
  const instructions = optionalText(value.instructions, "instructions", CHANNEL_LIMITS.instructions * 2);
  if (instructions !== undefined) input.instructions = instructions;
  if (value.isolated !== undefined) input.isolated = requiredFlag(value.isolated, "isolated");
  if (value.archived !== undefined) input.archived = requiredFlag(value.archived, "archived");
  return input;
}

export function parseChannelMember(value: unknown): ChannelMemberInput {
  if (!isObject(value)) throw new Error("Member details are required.");
  return { channelId: requireString(value.channelId, "channelId"), botId: requireString(value.botId, "botId") };
}

export function parseChannelTaskAction(value: unknown): ChannelTaskActionInput {
  if (!isObject(value)) throw new Error("Task details are required.");
  if (!isChannelTaskAction(value.action)) throw new Error("action must be stop, pause, resume, archive or restore.");
  return { taskId: requireString(value.taskId, "taskId"), action: value.action };
}

export function parseReassignChannelTask(value: unknown): ReassignChannelTaskInput {
  if (!isObject(value)) throw new Error("Task details are required.");
  return {
    taskId: requireString(value.taskId, "taskId"),
    ownerBotId: requireString(value.ownerBotId, "ownerBotId"),
  };
}

/** Text that may be empty; undefined when the field is not given. */
function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (!isString(value)) throw new Error(`${field} must be text.`);
  if (value.length > maxLength) throw new Error(`${field} is too long.`);
  return value;
}

function requiredFlag(value: unknown, field: string): boolean {
  if (!isBoolean(value)) throw new Error(`${field} must be true or false.`);
  return value;
}
