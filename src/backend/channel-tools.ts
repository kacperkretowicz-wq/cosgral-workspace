import { CHANNEL_LIMITS } from "@openbot/contracts/ipc";
import { z } from "zod";

export const CHANNEL_NAMESPACE = "cosgral_channels";
const text = z.string().min(1).max(CHANNEL_LIMITS.message);
const ownerBotId = z.string().min(1);
const resourceKey = z.string().nullable().optional();
/** One schema for Codex dynamic functions and the Claude in-process MCP server. */
export const CHANNEL_TOOL_SPECS: Array<{ name: string; description: string; schema: z.ZodRawShape }> = [
  {
    name: "note",
    description:
      "Show a short progress note or checklist in the channel. The final result marks these notes as superseded.",
    schema: { text },
  },
  {
    name: "assign",
    description:
      "Assign a child task to a member of this channel; results return here and wake you. End this turn after assigning your helpers.",
    schema: { ownerBotId, text, resourceKey, dependencyTaskIds: z.array(z.string()).optional() },
  },
  {
    name: "transfer",
    description: "Transfer your current task to another channel member and end your turn. Paused tasks need a human.",
    schema: { ownerBotId },
  },
  {
    name: "ask",
    description: `Ask one member a short question linked to your task. At most ${CHANNEL_LIMITS.repliesPerRequest} answers; end your turn to wait.`,
    schema: { ownerBotId, text },
  },
  {
    name: "reply",
    description:
      "Ask a follow-up to a reply message of your short question, sharing its two-answer budget. End your turn to wait.",
    schema: { messageId: z.string(), text },
  },
  {
    name: "result",
    description:
      "Return your task result to the channel. A correction in this turn creates a new version and supersedes the older result.",
    schema: { text },
  },
  {
    name: "remember",
    description: `Save channel-only memory (at most ${CHANNEL_LIMITS.memoryEntry} characters). It never enters a direct chat.`,
    schema: { text: z.string().min(1).max(CHANNEL_LIMITS.memoryEntry) },
  },
  { name: "memory", description: "Read only this channel's saved memory.", schema: {} },
  {
    name: "history",
    description: "Read recent shared history of this channel, without access to other channels or direct chats.",
    schema: {},
  },
  {
    name: "stop",
    description: "Stop a task. Only the lead can stop another owner's task. Only a human can resume it.",
    schema: { taskId: z.string() },
  },
];

export const CHANNEL_DYNAMIC_TOOLS = {
  type: "namespace",
  name: CHANNEL_NAMESPACE,
  description: "Coordinate tasks only within the assigned COSGRAL channel.",
  tools: CHANNEL_TOOL_SPECS.map((spec) => ({
    type: "function",
    name: spec.name,
    description: spec.description,
    inputSchema: z.toJSONSchema(z.object(spec.schema)),
  })),
};
