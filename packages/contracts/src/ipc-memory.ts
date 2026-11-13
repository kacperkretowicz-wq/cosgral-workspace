// COSGRAL W2: agent memory, and the person's side of channel memory.
//
// An agent memory has text and an inclusion mode: "essential" ("zawsze": every conversation of the
// agent gets it in the prompt, inside a separate 8192-byte budget) or "searchable" ("w razie
// potrzeby": the agent finds it with a tool). Each agent has a storage limit a person can change
// (default 512). At the limit nothing new is saved and the agent gets a clear message.
// Memories are data, not instructions: the prompt shows them in a block marked as untrusted data.
//
// Channel memory is a separate pool per channel (entries up to 500 characters) owned by the channel
// engine; its record type is `ChannelMemory` in ipc-workspace-channels.ts. This file adds the inputs
// a person uses to list, add, edit and delete those entries.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const MEMORY_INCLUSIONS = ["essential", "searchable"] as const;
export type MemoryInclusion = (typeof MEMORY_INCLUSIONS)[number];

export const MEMORY_LIMITS = {
  /** Storage limit of one agent when a person did not set another one. */
  defaultMaxMemoriesPerBot: 512,
  /** The highest storage limit a person can set. */
  maxMemoriesPerBotCeiling: 10_000,
  /** Byte budget (UTF-8) of the essential-memory block in the prompt. */
  essentialPromptByteLimit: 8192,
  maxTextLength: 10_000,
  /** Results of one search. */
  maxSearchResults: 50,
} as const;

export interface AgentMemory {
  id: string;
  botId: string;
  text: string;
  inclusion: MemoryInclusion;
  createdAt: string;
  updatedAt: string;
}

/** What the settings page shows for one agent. */
export interface AgentMemorySettings {
  botId: string;
  /** The storage limit (the person's choice or the default). */
  maxMemories: number;
  /** True when a person set the limit. */
  customLimit: boolean;
  essentialCount: number;
  searchableCount: number;
  /** Essential memories that fit into the prompt budget now (oldest first). */
  essentialInPrompt: number;
  /** UTF-8 size of the essential-memory block the next conversation gets. */
  essentialPromptBytes: number;
}

export interface SaveAgentMemoryInput {
  botId: string;
  text: string;
  /** Default "searchable". On an update, missing keeps the current inclusion. */
  inclusion?: MemoryInclusion;
  /** Update this entry instead of adding a new one. */
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

export interface SetAgentMemoryLimitInput {
  botId: string;
  /** null restores the default. */
  maxMemories: number | null;
}

/** A person adds (no memoryId) or edits (memoryId) a channel memory entry. */
export interface SaveChannelMemoryInput {
  channelId: string;
  text: string;
  memoryId?: string;
}

export interface DeleteChannelMemoryInput {
  channelId: string;
  memoryId: string;
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

export function isAgentMemorySettings(value: unknown): value is AgentMemorySettings {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isNumber(value.maxMemories) &&
    isBoolean(value.customLimit) &&
    isNumber(value.essentialCount) &&
    isNumber(value.searchableCount) &&
    isNumber(value.essentialInPrompt) &&
    isNumber(value.essentialPromptBytes)
  );
}
