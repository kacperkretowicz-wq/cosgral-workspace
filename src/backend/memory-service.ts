import { EventEmitter } from "node:events";
import {
  CHANNEL_MEMORY_LIMITS,
  type MemoryInclusion,
  MEMORY_LIMITS,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { MemoryStore } from "./memory-store";

export const MEMORY_NAMESPACE = "openbot";

export const MEMORY_TOOL_DESCRIPTIONS = {
  remember:
    "Save a durable preference, fact, or decision. Set inclusion='essential' for facts needed across all tasks (8192-byte prompt budget), or 'searchable' for facts retrieved with search_memories. To update an existing memory instead of duplicating it, pass its memoryId.",
  search_memories:
    "Search your saved memories for past preferences, decisions, or facts that could help with the current task.",
  forget_memory:
    "Delete a saved memory by its memoryId when outdated, requested by the user, or to free up storage space.",
  channel_remember:
    "Save a durable fact or decision to the shared channel memory pool (up to 500 characters), visible to all channel members.",
  channel_forget_memory:
    "Delete a shared channel memory by its memoryId.",
} as const;

export const MEMORY_DYNAMIC_TOOLS = [
  {
    type: "function",
    name: "remember",
    description: MEMORY_TOOL_DESCRIPTIONS.remember,
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1, maxLength: MEMORY_LIMITS.maxTextLength },
        inclusion: { type: "string", enum: ["essential", "searchable"] },
        memoryId: { type: "string" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "search_memories",
    description: MEMORY_TOOL_DESCRIPTIONS.search_memories,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "forget_memory",
    description: MEMORY_TOOL_DESCRIPTIONS.forget_memory,
    inputSchema: {
      type: "object",
      properties: {
        memoryId: { type: "string", minLength: 1 },
      },
      required: ["memoryId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "channel_remember",
    description: MEMORY_TOOL_DESCRIPTIONS.channel_remember,
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1, maxLength: CHANNEL_MEMORY_LIMITS.maxTextLength },
        memoryId: { type: "string" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "channel_forget_memory",
    description: MEMORY_TOOL_DESCRIPTIONS.channel_forget_memory,
    inputSchema: {
      type: "object",
      properties: {
        memoryId: { type: "string", minLength: 1 },
      },
      required: ["memoryId"],
      additionalProperties: false,
    },
  },
] as const;

export interface ToolExecutionResult {
  success: boolean;
  text: string;
}

export class MemoryService extends EventEmitter {
  readonly #store: MemoryStore;

  constructor(store: MemoryStore) {
    super();
    this.#store = store;
  }

  get store(): MemoryStore {
    return this.#store;
  }

  async handleToolCall(
    botId: string,
    toolName: string,
    args: unknown,
    maxMemories: number = MEMORY_LIMITS.defaultMaxMemoriesPerBot,
  ): Promise<ToolExecutionResult> {
    try {
      if (!isDynamicRecord(args)) {
        return { success: false, text: "Tool arguments must be an object." };
      }

      switch (toolName) {
        case "remember": {
          const text = isString(args.text) ? args.text.trim() : "";
          if (!text) {
            return { success: false, text: "text is required." };
          }
          const inclusion: MemoryInclusion | undefined =
            args.inclusion === "essential" || args.inclusion === "searchable" ? args.inclusion : undefined;
          const memoryId = isString(args.memoryId) ? args.memoryId.trim() : undefined;

          const saved = this.#store.saveAgentMemory({ botId, text, inclusion, memoryId }, maxMemories);
          this.emit("agent-memory-changed", {
            type: "agent-memory-changed",
            botId,
            action: "saved",
            memory: saved,
          });

          const actionLabel = memoryId ? "Updated" : "Saved";
          return {
            success: true,
            text: `${actionLabel} memory "${saved.id}" (inclusion: ${saved.inclusion}): "${saved.text}"`,
          };
        }

        case "search_memories": {
          const query = isString(args.query) ? args.query.trim() : "";
          if (!query) {
            return { success: false, text: "query is required." };
          }
          const limit = isNumber(args.limit) ? args.limit : 10;
          const matches = this.#store.searchAgentMemories({ botId, query, limit });
          if (matches.length === 0) {
            return { success: true, text: "No memories matched your query." };
          }
          const summary = matches
            .map((m) => `[${m.id}] (${m.inclusion}) ${m.text}`)
            .join("\n");
          return { success: true, text: summary };
        }

        case "forget_memory": {
          const memoryId = isString(args.memoryId) ? args.memoryId.trim() : "";
          if (!memoryId) {
            return { success: false, text: "memoryId is required." };
          }
          const deleted = this.#store.deleteAgentMemory({ botId, memoryId });
          if (!deleted) {
            return { success: false, text: `Memory "${memoryId}" not found for this agent.` };
          }
          this.emit("agent-memory-changed", {
            type: "agent-memory-changed",
            botId,
            action: "deleted",
            memory: deleted,
          });
          return { success: true, text: `Forgotten memory "${memoryId}".` };
        }

        default:
          return { success: false, text: `Unknown memory tool: ${toolName}` };
      }
    } catch (error) {
      return { success: false, text: error instanceof Error ? error.message : String(error) };
    }
  }

  async handleChannelToolCall(
    channelId: string,
    toolName: string,
    args: unknown,
    maxMemories: number = CHANNEL_MEMORY_LIMITS.defaultMaxMemoriesPerChannel,
  ): Promise<ToolExecutionResult> {
    try {
      if (!isDynamicRecord(args)) {
        return { success: false, text: "Tool arguments must be an object." };
      }

      switch (toolName) {
        case "channel_remember": {
          const text = isString(args.text) ? args.text.trim() : "";
          if (!text) {
            return { success: false, text: "text is required." };
          }
          const memoryId = isString(args.memoryId) ? args.memoryId.trim() : undefined;
          const saved = this.#store.saveChannelMemory({ channelId, text, memoryId }, maxMemories);
          this.emit("channel-memory-changed", {
            type: "channel-memory-changed",
            channelId,
            action: "saved",
            memory: saved,
          });
          const actionLabel = memoryId ? "Updated" : "Saved";
          return {
            success: true,
            text: `${actionLabel} channel memory "${saved.id}": "${saved.text}"`,
          };
        }

        case "channel_forget_memory": {
          const memoryId = isString(args.memoryId) ? args.memoryId.trim() : "";
          if (!memoryId) {
            return { success: false, text: "memoryId is required." };
          }
          const deleted = this.#store.deleteChannelMemory({ channelId, memoryId });
          if (!deleted) {
            return { success: false, text: `Channel memory "${memoryId}" not found.` };
          }
          this.emit("channel-memory-changed", {
            type: "channel-memory-changed",
            channelId,
            action: "deleted",
            memory: deleted,
          });
          return { success: true, text: `Forgotten channel memory "${memoryId}".` };
        }

        default:
          return { success: false, text: `Unknown channel memory tool: ${toolName}` };
      }
    } catch (error) {
      return { success: false, text: error instanceof Error ? error.message : String(error) };
    }
  }
}
