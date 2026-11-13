// COSGRAL W2: routine tools for agents (Codex dynamic tools and Claude MCP tools, one definition).
import { ROUTINE_LIMITS } from "@openbot/contracts/ipc";
import { z } from "zod";

export const ROUTINES_NAMESPACE = "cosgral_routines";

const schedule = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("interval"),
    everyMinutes: z.number().int().min(ROUTINE_LIMITS.minIntervalMinutes).max(ROUTINE_LIMITS.maxIntervalMinutes),
  }),
  z.object({
    type: z.literal("daily"),
    time: z.string().describe("HH:MM in the routine's time zone"),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .optional()
      .describe("0 = Sunday … 6 = Saturday; empty = every day"),
  }),
  z.object({
    type: z.literal("cron"),
    expression: z.string().describe("Five fields: minute hour day-of-month month day-of-week"),
  }),
]);

const name = z.string().min(1).max(ROUTINE_LIMITS.name);
const prompt = z.string().min(1).max(ROUTINE_LIMITS.prompt);
const timezone = z.string().max(64).optional().describe("IANA time zone; default: the person's time zone");

/** Arguments of each tool, parsed before use (typed for the handler). */
export const ROUTINE_TOOL_ARGS = {
  list_routines: z.object({}),
  create_routine: z.object({ name, prompt, schedule, timezone }),
  update_routine: z.object({
    routineId: z.string().min(1),
    name: name.optional(),
    prompt: prompt.optional(),
    schedule: schedule.optional(),
    timezone,
    paused: z.boolean().optional(),
  }),
  delete_routine: z.object({ routineId: z.string().min(1) }),
  create_webhook_routine: z.object({
    name,
    prompt,
    eventTypes: z.array(z.string().min(1).max(200)).max(ROUTINE_LIMITS.eventTypes).optional(),
  }),
};

export type RoutineToolName = keyof typeof ROUTINE_TOOL_ARGS;

const DESCRIPTIONS: Record<RoutineToolName, string> = {
  list_routines: "List your own routines with their schedule, next run and paused state.",
  create_routine:
    "Create a scheduled routine for yourself: on each run you get a new turn with the prompt. Times are in the person's time zone unless you give one. Runs happen only while COSGRAL Workspace is running; missed runs are not made up.",
  update_routine: "Change one of your routines (name, prompt, schedule, time zone) or pause / resume it.",
  delete_routine: "Delete one of your routines and its run history.",
  create_webhook_routine:
    "Create a routine that runs when a signed webhook arrives at COSGRAL Workspace's local receiver. You get its address but never its signing secret: the person creates the secret in Settings, and until then the webhook accepts nothing. Only allowed when a person asked for it, not during a routine run.",
};

const TOOL_NAMES: RoutineToolName[] = [
  "list_routines",
  "create_routine",
  "update_routine",
  "delete_routine",
  "create_webhook_routine",
];

export const ROUTINE_TOOL_SPECS: Array<{ name: RoutineToolName; description: string; schema: z.ZodRawShape }> =
  TOOL_NAMES.map((tool) => ({ name: tool, description: DESCRIPTIONS[tool], schema: ROUTINE_TOOL_ARGS[tool].shape }));

export function isRoutineToolName(value: string): value is RoutineToolName {
  return TOOL_NAMES.some((name) => name === value);
}
export const ROUTINES_DYNAMIC_TOOLS = {
  type: "namespace",
  name: ROUTINES_NAMESPACE,
  description: "Create and manage your scheduled and webhook routines.",
  tools: ROUTINE_TOOL_SPECS.map((spec) => ({
    type: "function",
    name: spec.name,
    description: spec.description,
    inputSchema: z.toJSONSchema(z.object(spec.schema)),
  })),
};
