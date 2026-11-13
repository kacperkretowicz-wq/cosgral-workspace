// COSGRAL W3: full agent settings, agent templates and the agent creator, app settings with the notification matrix,
// and onboarding (parity rows 39–40). The person and the API see the same settings; the engine enforces them:
// a tool group switched off disappears from the agent's tools and its calls are refused, also in channel turns.

import type {
  AgentModelId,
  AgentModelOption,
  AgentProviderId,
  AgentReasoningEffort,
  BotSummary,
} from "./ipc-conversation";
import type { AgentMcpServerSetting } from "./ipc-mcp";
import type { AgentMemorySettings } from "./ipc-memory";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

/**
 * Tool groups a person switches on or off for one agent (all on by default). Questions, cards and channel tools stay
 * on: they are how an agent asks the person. MCP servers have their own switch per agent (see ipc-mcp.ts).
 */
export const AGENT_TOOL_GROUPS = [
  "browser",
  "computer",
  "eyes",
  "vault",
  "skills",
  "tables",
  "library",
  "routines",
  "memory",
  "messaging",
] as const;
export type AgentToolGroup = (typeof AGENT_TOOL_GROUPS)[number];
export type AgentToolSwitches = Partial<Record<AgentToolGroup, boolean>>;

export interface AgentToolSetting {
  group: AgentToolGroup;
  /** The person's switch. */
  enabled: boolean;
  /** False when this computer or program lacks the feature (e.g. Computer Use outside Windows). */
  available: boolean;
}

export interface AgentSkillSummary {
  skillId: string;
  name: string;
  installedVersion: number;
  updateAvailable: boolean;
}

/** Everything the agent settings screen shows, in one read. */
export interface AgentSettings {
  bot: BotSummary;
  /** Follows from the model. */
  provider: AgentProviderId;
  models: AgentModelOption[];
  tools: AgentToolSetting[];
  memory: AgentMemorySettings;
  skills: AgentSkillSummary[];
  mcp: AgentMcpServerSetting[];
}

/** One save for the settings screen; fields left out stay as they are. */
export interface UpdateAgentSettingsInput {
  botId: string;
  name?: string;
  role?: string;
  description?: string;
  /** False mutes this agent's notifications. */
  notifications?: boolean;
  model?: AgentModelId;
  reasoningEffort?: AgentReasoningEffort;
  tools?: AgentToolSwitches;
}

export const AGENT_TEMPLATE_LIMITS = {
  saved: 100,
  name: 80,
  role: 120,
  summary: 200,
  description: 2_000,
  memories: 10,
  memoryText: 1_000,
  skills: 20,
} as const;

/** "built-in": comes with the program; "saved": a person saved it from an agent. */
export const AGENT_TEMPLATE_ORIGINS = ["built-in", "saved"] as const;
export type AgentTemplateOrigin = (typeof AGENT_TEMPLATE_ORIGINS)[number];

export interface AgentTemplate {
  id: string;
  origin: AgentTemplateOrigin;
  /** The new agent's name (the person can change it in the creator). */
  name: string;
  role: string;
  /** One line for the gallery. */
  summary: string;
  /** The agent's description: how it works and what it does. */
  description: string;
  /** Null: the default model of the chosen provider. */
  model: AgentModelId | null;
  reasoningEffort: AgentReasoningEffort | null;
  /** Tool groups the template switches off (the rest stay on). */
  tools: AgentToolSwitches;
  /** Library skills installed for the new agent when they exist (by name). */
  skills: string[];
  /** Essential memories the new agent starts with. */
  memories: string[];
  avatarHue: number | null;
  /** Shown as a proposal for the first agent in onboarding. */
  suggested: boolean;
  createdAt: string | null;
}

/** The agent creator: from a template, from fields, or both (fields win). */
export interface CreateAgentInput {
  templateId?: string;
  name?: string;
  role?: string;
  description?: string;
  model?: AgentModelId;
  reasoningEffort?: AgentReasoningEffort;
  tools?: AgentToolSwitches;
  skills?: string[];
  memories?: string[];
}

export interface CreateAgentResult {
  bot: BotSummary;
  /** What the creator could not do (a missing skill, a provider that is not ready); the agent exists anyway. */
  warnings: string[];
}

export interface SaveAgentTemplateInput {
  botId: string;
  /** Default: the agent's name. */
  name?: string;
  summary?: string;
  /** Also keep the agent's essential memories in the template. */
  includeMemories?: boolean;
}

export interface AgentTemplateIdInput {
  templateId: string;
}

export const NOTIFICATION_EVENTS = [
  "finished",
  "failed",
  "needs-input",
  "needs-approval",
  "takeover",
  "channel-result",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** "desktop": a system notification; "sound": with sound. */
export const NOTIFICATION_CHANNELS = ["desktop", "sound"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationMatrix = Record<NotificationEvent, Record<NotificationChannel, boolean>>;

export interface NotificationPreferences {
  matrix: NotificationMatrix;
  /** Skip system notifications while the program window is in front. */
  onlyWhenUnfocused: boolean;
}

export const APP_LANGUAGES = ["en", "pl"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

/** Settings tabs in order. Billing is not here: the program has no account. */
export const SETTINGS_TABS = [
  "general",
  "agents",
  "notifications",
  "voice",
  "computer-use",
  "profile",
  "mobile",
  "dock",
  "island",
  "updates",
  "hosts",
  "transfer",
] as const;
export type SettingsTabId = (typeof SETTINGS_TABS)[number];

export interface SettingsTab {
  id: SettingsTabId;
  /** False while the feature is not in this program yet: show it disabled or hide it. */
  available: boolean;
}

export interface AppSettings {
  language: AppLanguage;
  /** False until the person chose a language (onboarding or settings); agents then get no language note. */
  languageChosen: boolean;
  notifications: NotificationPreferences;
  tabs: SettingsTab[];
}

export interface UpdateAppSettingsInput {
  language?: AppLanguage;
  notifications?: {
    matrix?: Partial<Record<NotificationEvent, Partial<Record<NotificationChannel, boolean>>>>;
    onlyWhenUnfocused?: boolean;
  };
}

export const ONBOARDING_STEPS = ["language", "provider", "first-agent", "computer-use"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
  completed: boolean;
  language: AppLanguage | null;
  preferredProvider: AgentProviderId | null;
  /** The agent created at the end of onboarding, or null. */
  firstAgentId: string | null;
  /** Suggested templates for the first agent. */
  proposals: AgentTemplate[];
  /** The Computer Use step: what this computer allows. */
  computerUse: { available: boolean; reason: string | null };
}

export interface CompleteOnboardingInput {
  language: AppLanguage;
  preferredProvider: AgentProviderId;
  /** Null: no first agent now. */
  firstAgent: { templateId: string; name?: string } | null;
}

/** Defaults: a system notification for everything but channel results; sound when the person must answer. */
export function defaultNotificationPreferences(): NotificationPreferences {
  const row = (desktop: boolean, sound: boolean) => ({ desktop, sound });
  return {
    matrix: {
      finished: row(true, false),
      failed: row(true, false),
      "needs-input": row(true, true),
      "needs-approval": row(true, true),
      takeover: row(true, false),
      "channel-result": row(false, false),
    },
    onlyWhenUnfocused: true,
  };
}

function isToolSwitches(value: unknown): value is AgentToolSwitches {
  return (
    isDynamicRecord(value) &&
    Object.entries(value).every(([group, enabled]) => isOneOf(AGENT_TOOL_GROUPS, group) && isBoolean(enabled))
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isAgentTemplate(value: unknown): value is AgentTemplate {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isOneOf(AGENT_TEMPLATE_ORIGINS, value.origin) &&
    isString(value.name) &&
    isString(value.role) &&
    isString(value.summary) &&
    isString(value.description) &&
    isNullableString(value.model) &&
    isNullableString(value.reasoningEffort) &&
    isToolSwitches(value.tools) &&
    Array.isArray(value.skills) &&
    value.skills.every(isString) &&
    Array.isArray(value.memories) &&
    value.memories.every(isString) &&
    (value.avatarHue === null || isNumber(value.avatarHue)) &&
    isBoolean(value.suggested) &&
    isNullableString(value.createdAt)
  );
}

export function isAgentSettings(value: unknown): value is AgentSettings {
  return (
    isDynamicRecord(value) &&
    isDynamicRecord(value.bot) &&
    isString(value.bot.id) &&
    isOneOf(["codex", "claude"], value.provider) &&
    Array.isArray(value.models) &&
    Array.isArray(value.tools) &&
    value.tools.every(
      (tool) =>
        isDynamicRecord(tool) &&
        isOneOf(AGENT_TOOL_GROUPS, tool.group) &&
        isBoolean(tool.enabled) &&
        isBoolean(tool.available),
    ) &&
    isDynamicRecord(value.memory) &&
    isNumber(value.memory.maxMemories) &&
    Array.isArray(value.skills) &&
    value.skills.every((skill) => isDynamicRecord(skill) && isString(skill.skillId) && isString(skill.name)) &&
    Array.isArray(value.mcp) &&
    value.mcp.every((server) => isDynamicRecord(server) && isString(server.serverId) && isBoolean(server.enabled))
  );
}

function isNotificationPreferences(value: unknown): value is NotificationPreferences {
  if (!isDynamicRecord(value) || !isBoolean(value.onlyWhenUnfocused) || !isDynamicRecord(value.matrix)) return false;
  const matrix = value.matrix;
  return NOTIFICATION_EVENTS.every((event) => {
    const row = matrix[event];
    return isDynamicRecord(row) && NOTIFICATION_CHANNELS.every((channel) => isBoolean(row[channel]));
  });
}

export function isAppSettings(value: unknown): value is AppSettings {
  return (
    isDynamicRecord(value) &&
    isOneOf(APP_LANGUAGES, value.language) &&
    isBoolean(value.languageChosen) &&
    isNotificationPreferences(value.notifications) &&
    Array.isArray(value.tabs) &&
    value.tabs.every((tab) => isDynamicRecord(tab) && isOneOf(SETTINGS_TABS, tab.id) && isBoolean(tab.available))
  );
}

export function isOnboardingState(value: unknown): value is OnboardingState {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.completed) &&
    (value.language === null || isOneOf(APP_LANGUAGES, value.language)) &&
    (value.preferredProvider === null || isOneOf(["codex", "claude"], value.preferredProvider)) &&
    isNullableString(value.firstAgentId) &&
    Array.isArray(value.proposals) &&
    value.proposals.every(isAgentTemplate) &&
    isDynamicRecord(value.computerUse) &&
    isBoolean(value.computerUse.available) &&
    isNullableString(value.computerUse.reason)
  );
}
