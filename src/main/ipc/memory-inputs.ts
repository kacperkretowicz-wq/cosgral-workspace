// COSGRAL W2: input validation for memory IPC calls

import {
  type DeleteAgentMemoryInput,
  type DeleteChannelMemoryInput,
  type ListAgentMemoriesInput,
  type ListChannelMemoriesInput,
  type MemoryInclusion,
  type SaveAgentMemoryInput,
  type SaveChannelMemoryInput,
  type SearchAgentMemoriesInput,
  isMemoryInclusion,
} from "@openbot/contracts/ipc";
import { isNumber, isString } from "@openbot/contracts/runtime-values";
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
  const memoryId =
    value.memoryId !== undefined && value.memoryId !== null ? requireString(value.memoryId, "memoryId") : undefined;
  return { botId, text, inclusion, memoryId };
}

export function parseDeleteAgentMemory(value: unknown): DeleteAgentMemoryInput {
  if (!isObject(value)) throw new Error("Agent memory details are required.");
  const botId = requireString(value.botId, "botId");
  const memoryId = requireString(value.memoryId, "memoryId");
  return { botId, memoryId };
}

export function parseSearchAgentMemories(value: unknown): SearchAgentMemoriesInput {
  if (!isObject(value)) throw new Error("Agent memory search details are required.");
  const botId = requireString(value.botId, "botId");
  const query = requireString(value.query, "query");
  const limit = isNumber(value.limit) ? value.limit : undefined;
  return { botId, query, limit };
}

export function parseListChannelMemories(value: unknown): ListChannelMemoriesInput {
  if (isString(value)) return { channelId: value };
  if (!isObject(value)) throw new Error("Channel memory request details are required.");
  const channelId = requireString(value.channelId, "channelId");
  return { channelId };
}

export function parseSaveChannelMemory(value: unknown): SaveChannelMemoryInput {
  if (!isObject(value)) throw new Error("Channel memory details are required.");
  const channelId = requireString(value.channelId, "channelId");
  const text = requireString(value.text, "text");
  const memoryId =
    value.memoryId !== undefined && value.memoryId !== null ? requireString(value.memoryId, "memoryId") : undefined;
  return { channelId, text, memoryId };
}

export function parseDeleteChannelMemory(value: unknown): DeleteChannelMemoryInput {
  if (!isObject(value)) throw new Error("Channel memory details are required.");
  const channelId = requireString(value.channelId, "channelId");
  const memoryId = requireString(value.memoryId, "memoryId");
  return { channelId, memoryId };
}

function parseMemoryInclusion(value: unknown): MemoryInclusion {
  if (!isMemoryInclusion(value)) {
    throw new Error("inclusion must be essential or searchable.");
  }
  return value;
}
