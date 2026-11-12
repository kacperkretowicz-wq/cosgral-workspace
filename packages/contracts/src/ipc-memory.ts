// COSGRAL W2: agent and channel memory.
//
// An agent memory has text and an inclusion mode: "essential" ("zawsze", included in the prompt
// with an 8192-byte budget) or "searchable" ("w razie potrzeby", searched with tools).
// Storage limit per agent defaults to 512.
// Channel memory has a separate pool per channel with entries up to 500 characters,
// visible to all channel members.

import { isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const MEMORY_INCLUSIONS = ["essential", "searchable"] as const;
export type MemoryInclusion = (typeof MEMORY_INCLUSIONS)[number];

export const MEMORY_LIMITS = {
  defaultMaxMemoriesPerBot: 512,
  essentialPromptByteLimit: 8192,
  maxTextLength: 10_000,
} as const;

export const CHANNEL_MEMORY_LIMITS = {
  maxTextLength: 500,
  defaultMaxMemoriesPerChannel: 512,
} as const;

export interface AgentMemory {
  id: string;
  botId: string;
  text: string;
  inclusion: MemoryInclusion;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelMemory {
  id: string;
  channelId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveAgentMemoryInput {
  botId: string;
  text: string;
  inclusion?: MemoryInclusion;
  memoryId?: string;
}

export interface DeleteAgentMemoryInput {
  botId: string;
  memoryId: string;
}

export interface SearchAgentMemoriesInput {
  botId: string;
  query: string;
  limit?: number;
}

export interface ListAgentMemoriesInput {
  botId: string;
  inclusion?: MemoryInclusion;
}

export interface SaveChannelMemoryInput {
  channelId: string;
  text: string;
  memoryId?: string;
}

export interface DeleteChannelMemoryInput {
  channelId: string;
  memoryId: string;
}

export interface ListChannelMemoriesInput {
  channelId: string;
}

export function isMemoryInclusion(value: unknown): value is MemoryInclusion {
  return isOneOf(MEMORY_INCLUSIONS, value);
}

export function isAgentMemory(value: unknown): value is AgentMemory {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.botId) &&
    isString(value.text) &&
    isMemoryInclusion(value.inclusion) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isChannelMemory(value: unknown): value is ChannelMemory {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.channelId) &&
    isString(value.text) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}
