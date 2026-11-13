// COSGRAL W2: input validation for memory IPC calls (agent memory and the person's side of channel memory).

import {
  type DeleteAgentMemoryInput,
  type DeleteChannelMemoryInput,
  isMemoryInclusion,
  type ListAgentMemoriesInput,
  MEMORY_LIMITS,
  type MemoryInclusion,
  type SaveAgentMemoryInput,
  type SaveChannelMemoryInput,
  type SearchAgentMemoriesInput,
  type SetAgentMemoryLimitInput,
} from "@openbot/contracts/ipc";
import { isNumber } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseListAgentMemories(value: unknown): ListAgentMemoriesInput {
  if (!isObject(value)) throw new Error("Agent memory request details are required.");
  const botId = requireString(value.botId, "botId");
  const inclusion = value.inclusion !== undefined ? parseMemoryInclusion(value.inclusion) : undefined;
  return { botId, inclusion };
}

export function parseSaveAgentMemory(value: unknown): SaveAgentMemoryInput {
  if (!isObject(value)) throw new Error("Agent memory details are required.");
  const botId = requireString(value.botId, "botId");
  const text = requireString(value.text, "text");
  const inclusion = value.inclusion !== undefined ? parseMemoryInclusion(value.inclusion) : undefined;
  const memoryId = optionalId(value.memoryId);
  return { botId, text, inclusion, memoryId };
}

export function parseDeleteAgentMemory(value: unknown): DeleteAgentMemoryInput {
  if (!isObject(value)) throw new Error("Agent memory details are required.");
  return { botId: requireString(value.botId, "botId"), memoryId: requireString(value.memoryId, "memoryId") };
}

export function parseSearchAgentMemories(value: unknown): SearchAgentMemoriesInput {
  if (!isObject(value)) throw new Error("Agent memory search details are required.");
  const botId = requireString(value.botId, "botId");
  const query = requireString(value.query, "query");
  const limit = isNumber(value.limit) ? value.limit : undefined;
  return { botId, query, limit };
}

export function parseAgentMemoryBotId(value: unknown): string {
  return requireString(value, "botId");
}

export function parseSetAgentMemoryLimit(value: unknown): SetAgentMemoryLimitInput {
  if (!isObject(value)) throw new Error("Memory limit details are required.");
  const botId = requireString(value.botId, "botId");
  const max = value.maxMemories;
  if (max === null) return { botId, maxMemories: null };
  if (!isNumber(max) || !Number.isInteger(max) || max < 1 || max > MEMORY_LIMITS.maxMemoriesPerBotCeiling) {
    throw new Error(`maxMemories must be a whole number from 1 to ${MEMORY_LIMITS.maxMemoriesPerBotCeiling}, or null.`);
  }
  return { botId, maxMemories: max };
}

export function parseSaveChannelMemory(value: unknown): SaveChannelMemoryInput {
  if (!isObject(value)) throw new Error("Channel memory details are required.");
  const channelId = requireString(value.channelId, "channelId");
  const text = requireString(value.text, "text");
  return { channelId, text, memoryId: optionalId(value.memoryId) };
}

export function parseDeleteChannelMemory(value: unknown): DeleteChannelMemoryInput {
  if (!isObject(value)) throw new Error("Channel memory details are required.");
  return {
    channelId: requireString(value.channelId, "channelId"),
    memoryId: requireString(value.memoryId, "memoryId"),
  };
}

function optionalId(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : requireString(value, "memoryId");
}

function parseMemoryInclusion(value: unknown): MemoryInclusion {
  if (!isMemoryInclusion(value)) throw new Error("inclusion must be essential or searchable.");
  return value;
}
