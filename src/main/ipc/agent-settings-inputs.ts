// COSGRAL W3: what a window may send for agent settings, templates, the creator, app settings and onboarding.
// Shapes and types are checked here; the services check meaning (lengths of texts, existing templates and skills).

import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import {
  AGENT_TEMPLATE_LIMITS,
  AGENT_TOOL_GROUPS,
  type AgentTemplateIdInput,
  type AgentToolSwitches,
  APP_LANGUAGES,
  type CompleteOnboardingInput,
  type CreateAgentInput,
  isAgentModel,
  isReasoningEffort,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  type SaveAgentTemplateInput,
  type UpdateAgentSettingsInput,
  type UpdateAppSettingsInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseSettingsBotId(value: unknown): string {
  return requireString(value, "botId");
}

export function parseUpdateAgentSettings(value: unknown): UpdateAgentSettingsInput {
  const input = record(value, "agent settings", [
    "botId",
    "name",
    "role",
    "description",
    "notifications",
    "model",
    "reasoningEffort",
    "tools",
  ]);
  const result: UpdateAgentSettingsInput = { botId: requireString(input.botId, "botId") };
  if (input.name !== undefined) result.name = text(input.name, "name", INPUT_LIMITS.agentName);
  if (input.role !== undefined) result.role = text(input.role, "role", INPUT_LIMITS.agentTitle);
  if (input.description !== undefined) {
    result.description = text(input.description, "description", INPUT_LIMITS.agentDescription);
  }
  if (input.notifications !== undefined) result.notifications = flag(input.notifications, "notifications");
  if (input.model !== undefined) result.model = model(input.model);
  if (input.reasoningEffort !== undefined) result.reasoningEffort = effort(input.reasoningEffort);
  if (input.tools !== undefined) result.tools = tools(input.tools);
  return result;
}

export function parseCreateAgent(value: unknown): CreateAgentInput {
  const input = record(value, "agent", [
    "templateId",
    "name",
    "role",
    "description",
    "model",
    "reasoningEffort",
    "tools",
    "skills",
    "memories",
  ]);
  const result: CreateAgentInput = {};
  if (input.templateId !== undefined) result.templateId = requireString(input.templateId, "templateId");
  if (input.name !== undefined) result.name = text(input.name, "name", AGENT_TEMPLATE_LIMITS.name);
  if (input.role !== undefined) result.role = text(input.role, "role", AGENT_TEMPLATE_LIMITS.role);
  if (input.description !== undefined) {
    result.description = text(input.description, "description", AGENT_TEMPLATE_LIMITS.description);
  }
  if (input.model !== undefined) result.model = model(input.model);
  if (input.reasoningEffort !== undefined) result.reasoningEffort = effort(input.reasoningEffort);
  if (input.tools !== undefined) result.tools = tools(input.tools);
  if (input.skills !== undefined) result.skills = list(input.skills, "skills", AGENT_TEMPLATE_LIMITS.skills, 64);
  if (input.memories !== undefined) {
    result.memories = list(
      input.memories,
      "memories",
      AGENT_TEMPLATE_LIMITS.memories,
      AGENT_TEMPLATE_LIMITS.memoryText,
    );
  }
  return result;
}

export function parseSaveAgentTemplate(value: unknown): SaveAgentTemplateInput {
  const input = record(value, "template", ["botId", "name", "summary", "includeMemories"]);
  const result: SaveAgentTemplateInput = { botId: requireString(input.botId, "botId") };
  if (input.name !== undefined) result.name = text(input.name, "name", AGENT_TEMPLATE_LIMITS.name);
  if (input.summary !== undefined) result.summary = text(input.summary, "summary", AGENT_TEMPLATE_LIMITS.summary);
  if (input.includeMemories !== undefined) result.includeMemories = flag(input.includeMemories, "includeMemories");
  return result;
}

export function parseAgentTemplateId(value: unknown): AgentTemplateIdInput {
  const input = record(value, "template", ["templateId"]);
  return { templateId: requireString(input.templateId, "templateId") };
}

export function parseUpdateAppSettings(value: unknown): UpdateAppSettingsInput {
  const input = record(value, "app settings", ["language", "notifications"]);
  const result: UpdateAppSettingsInput = {};
  if (input.language !== undefined) {
    if (!isOneOf(APP_LANGUAGES, input.language)) throw new Error("language must be en or pl.");
    result.language = input.language;
  }
  if (input.notifications !== undefined) {
    const notifications = record(input.notifications, "notifications", ["matrix", "onlyWhenUnfocused"]);
    const parsed: NonNullable<UpdateAppSettingsInput["notifications"]> = {};
    if (notifications.matrix !== undefined) {
      const matrix = record(notifications.matrix, "notification matrix", NOTIFICATION_EVENTS);
      const rows: NonNullable<typeof parsed.matrix> = {};
      for (const event of NOTIFICATION_EVENTS) {
        if (matrix[event] === undefined) continue;
        const row = record(matrix[event], "notification row", NOTIFICATION_CHANNELS, "channel");
        const parsedRow: Partial<Record<(typeof NOTIFICATION_CHANNELS)[number], boolean>> = {};
        for (const channel of NOTIFICATION_CHANNELS) {
          if (row[channel] !== undefined) parsedRow[channel] = flag(row[channel], `${event}.${channel}`);
        }
        rows[event] = parsedRow;
      }
      parsed.matrix = rows;
    }
    if (notifications.onlyWhenUnfocused !== undefined) {
      parsed.onlyWhenUnfocused = flag(notifications.onlyWhenUnfocused, "onlyWhenUnfocused");
    }
    result.notifications = parsed;
  }
  return result;
}

export function parseCompleteOnboarding(value: unknown): CompleteOnboardingInput {
  const input = record(value, "onboarding", ["language", "preferredProvider", "firstAgent"]);
  if (!isOneOf(APP_LANGUAGES, input.language)) throw new Error("language must be en or pl.");
  if (!isOneOf(["codex", "claude"], input.preferredProvider))
    throw new Error("preferredProvider must be codex or claude.");
  let firstAgent: CompleteOnboardingInput["firstAgent"] = null;
  if (input.firstAgent !== null && input.firstAgent !== undefined) {
    const agent = record(input.firstAgent, "first agent", ["templateId", "name"]);
    firstAgent = {
      templateId: requireString(agent.templateId, "templateId"),
      ...(agent.name === undefined ? {} : { name: text(agent.name, "name", AGENT_TEMPLATE_LIMITS.name) }),
    };
  }
  return { language: input.language, preferredProvider: input.preferredProvider, firstAgent };
}

function record(value: unknown, label: string, allowed: readonly string[], kind = "field"): DynamicRecord {
  if (!isObject(value)) throw new Error(`Invalid ${label}.`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unknown ${kind} "${key}" in the ${label}.`);
  }
  return value;
}

function text(value: unknown, field: string, limit: number): string {
  if (!isString(value)) throw new Error(`${field} must be text.`);
  if (value.length > limit) throw new Error(`${field} is too long.`);
  return value;
}

function flag(value: unknown, field: string): boolean {
  if (!isBoolean(value)) throw new Error(`${field} must be true or false.`);
  return value;
}

function model(value: unknown) {
  if (!isAgentModel(value)) throw new Error("Unknown model.");
  return value;
}

function effort(value: unknown) {
  if (!isReasoningEffort(value)) throw new Error("Unknown reasoning effort.");
  return value;
}

function tools(value: unknown): AgentToolSwitches {
  if (!isObject(value)) throw new Error("tools must be an object of tool groups and true or false.");
  const result: AgentToolSwitches = {};
  for (const [group, enabled] of Object.entries(value)) {
    if (!isOneOf(AGENT_TOOL_GROUPS, group)) throw new Error(`Unknown tool group "${group}".`);
    result[group] = flag(enabled, `tools.${group}`);
  }
  return result;
}

function list(value: unknown, field: string, max: number, itemLength: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${field} must be a list of at most ${max} texts.`);
  return value.map((item) => {
    if (!isString(item) || item.length > itemLength)
      throw new Error(`Each of ${field} must be text up to ${itemLength}.`);
    return item;
  });
}
