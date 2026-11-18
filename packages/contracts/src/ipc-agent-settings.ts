// COSGRAL W3: full agent settings, agent templates and the agent creator, app settings with the notification matrix,
// and onboarding (parity rows 39–40). The person and the API see the same settings; the engine enforces them:
// a tool group switched off disappears from the agent's tools and its calls are refused, also in channel turns.

import type {
  AgentModelId,
  AgentModelOption,
  AgentProviderId,
  AgentReasoningEffort,
  BotAvatarHue,
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
  /** COSGRAL W11 (U1): the avatar the creator shows, written together with the profile (no state with a name and no colour). */
  avatarSeed?: string;
  /** null = the automatic colour; left out = the template's colour. */
  avatarHue?: BotAvatarHue | null;
}

export interface CreateAgentResult {
  bot: BotSummary;
  /** What the creator could not do (a missing skill, a provider that is not ready); the agent exists anyway. */
  warnings: string[];
}

/**
 * COSGRAL W4-K3: a copy of an agent. Copied: profile (role, instructions = description, reasoning effort, avatar colour,
 * notification flag), model, tool switches, installed skills (clean library copies), the MCP servers switched off for
 * the source, and the fallback models. Not copied: memories, conversation history and threads, the workspace folder
 * (the copy gets its own), routines, channel membership, Vault, "always allow" rules, secrets and CLI sessions.
 */
export interface DuplicateAgentInput {
  sourceBotId: string;
  /** Default: "<name> kopia", then "<name> kopia 2", "<name> kopia 3" while that name is taken. */
  name?: string;
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

export const APP_THEMES = ["dark", "light", "system"] as const;
export type AppTheme = (typeof APP_THEMES)[number];
export function normalizeAppTheme(value: unknown): AppTheme {
  // Dark is the default look; "system" follows the OS only when the person chose it.
  return value === "light" || value === "system" ? value : "dark";
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

/** The pages of the page rail, in rail order (the renderer's PAGE_RAIL_ITEMS has the same ids). */
export const APP_PAGE_IDS = [
  "agents",
  "schedule",
  "tasks",
  "workflows",
  "usage",
  "library",
  "marketplace",
  "remote-desktop",
  "providers",
  "phone",
  "server-settings",
] as const;
export type AppPageId = (typeof APP_PAGE_IDS)[number];

export interface AppNavigationSettings {
  /** Pages the person pinned to the rail, in the order they chose; each id at most once. Default: empty. */
  pinnedPageIds: AppPageId[];
}

// COSGRAL W12 (BE-U): how the program looks and sends, kept with the other app settings (parity row 2). The person picks from
// short lists (no free colours or font names), so a saved value can never break contrast or load an unknown font. The window
// turns the values into its own style variables; the engine only keeps and checks them.

/** The size of the whole window in percent of the normal size. */
export const APP_UI_SCALES = [90, 100, 110, 125, 140] as const;
export type AppUiScale = (typeof APP_UI_SCALES)[number];

/** inter = the font of the program, system = the font of the computer, mono = a fixed-width font for everything. */
export const APP_FONTS = ["inter", "system", "mono"] as const;
export type AppFont = (typeof APP_FONTS)[number];

/** enter = Enter sends and Shift+Enter breaks the line; mod-enter = Ctrl+Enter sends and Enter breaks the line. */
export const APP_SEND_SHORTCUTS = ["enter", "mod-enter"] as const;
export type AppSendShortcut = (typeof APP_SEND_SHORTCUTS)[number];

/** Accent of the person's own chat bubbles; every one is a ready colour pair that keeps text contrast. */
export const APP_CHAT_ACCENTS = ["blue", "green", "violet", "orange", "pink", "gray"] as const;
export type AppChatAccent = (typeof APP_CHAT_ACCENTS)[number];

/** show = steps of the agent (tool calls) are open in the chat; collapse = they are folded to one line. */
export const APP_AGENT_STEPS = ["show", "collapse"] as const;
export type AppAgentSteps = (typeof APP_AGENT_STEPS)[number];

export interface AppAppearanceSettings {
  uiScale: AppUiScale;
  font: AppFont;
  sendShortcut: AppSendShortcut;
  chatAccent: AppChatAccent;
  agentSteps: AppAgentSteps;
  /** True = agents with unread messages go first in the list. */
  unreadFirst: boolean;
}

/** What a new installation has: the look and the keys of the program before this setting existed. */
export const DEFAULT_APP_APPEARANCE: AppAppearanceSettings = {
  uiScale: 100,
  font: "inter",
  sendShortcut: "enter",
  chatAccent: "blue",
  agentSteps: "show",
  unreadFirst: false,
};

const APPEARANCE_KEYS = ["uiScale", "font", "sendShortcut", "chatAccent", "agentSteps", "unreadFirst"] as const;

export function isAppAppearance(value: unknown): value is AppAppearanceSettings {
  return (
    isDynamicRecord(value) &&
    isOneOf(APP_UI_SCALES, value.uiScale) &&
    isOneOf(APP_FONTS, value.font) &&
    isOneOf(APP_SEND_SHORTCUTS, value.sendShortcut) &&
    isOneOf(APP_CHAT_ACCENTS, value.chatAccent) &&
    isOneOf(APP_AGENT_STEPS, value.agentSteps) &&
    isBoolean(value.unreadFirst)
  );
}

/** A saved value read back: every field that is not valid goes back to its default (older or edited data is not trusted). */
export function normalizeAppAppearance(value: unknown): AppAppearanceSettings {
  const stored = isDynamicRecord(value) ? value : {};
  const defaults = DEFAULT_APP_APPEARANCE;
  return {
    uiScale: isOneOf(APP_UI_SCALES, stored.uiScale) ? stored.uiScale : defaults.uiScale,
    font: isOneOf(APP_FONTS, stored.font) ? stored.font : defaults.font,
    sendShortcut: isOneOf(APP_SEND_SHORTCUTS, stored.sendShortcut) ? stored.sendShortcut : defaults.sendShortcut,
    chatAccent: isOneOf(APP_CHAT_ACCENTS, stored.chatAccent) ? stored.chatAccent : defaults.chatAccent,
    agentSteps: isOneOf(APP_AGENT_STEPS, stored.agentSteps) ? stored.agentSteps : defaults.agentSteps,
    unreadFirst: isBoolean(stored.unreadFirst) ? stored.unreadFirst : defaults.unreadFirst,
  };
}

/**
 * A change coming from the window: only the known fields, each with a known value. Throws a plain sentence for the first problem
 * (an unknown field, a value outside its list) so a typo is not saved as "no change".
 */
export function parseAppearancePatch(value: unknown): Partial<AppAppearanceSettings> {
  if (!isDynamicRecord(value)) throw new Error("appearance must be an object.");
  for (const key of Object.keys(value)) {
    if (!isOneOf(APPEARANCE_KEYS, key)) throw new Error(`Unknown appearance setting "${key}".`);
  }
  const patch: Partial<AppAppearanceSettings> = {};
  if (value.uiScale !== undefined) {
    if (!isOneOf(APP_UI_SCALES, value.uiScale)) throw new Error(`uiScale is one of ${APP_UI_SCALES.join(", ")}.`);
    patch.uiScale = value.uiScale;
  }
  if (value.font !== undefined) {
    if (!isOneOf(APP_FONTS, value.font)) throw new Error(`font is one of ${APP_FONTS.join(", ")}.`);
    patch.font = value.font;
  }
  if (value.sendShortcut !== undefined) {
    if (!isOneOf(APP_SEND_SHORTCUTS, value.sendShortcut)) {
      throw new Error(`sendShortcut is one of ${APP_SEND_SHORTCUTS.join(", ")}.`);
    }
    patch.sendShortcut = value.sendShortcut;
  }
  if (value.chatAccent !== undefined) {
    if (!isOneOf(APP_CHAT_ACCENTS, value.chatAccent)) {
      throw new Error(`chatAccent is one of ${APP_CHAT_ACCENTS.join(", ")}.`);
    }
    patch.chatAccent = value.chatAccent;
  }
  if (value.agentSteps !== undefined) {
    if (!isOneOf(APP_AGENT_STEPS, value.agentSteps)) {
      throw new Error(`agentSteps is one of ${APP_AGENT_STEPS.join(", ")}.`);
    }
    patch.agentSteps = value.agentSteps;
  }
  if (value.unreadFirst !== undefined) {
    if (!isBoolean(value.unreadFirst)) throw new Error("unreadFirst is on or off.");
    patch.unreadFirst = value.unreadFirst;
  }
  return patch;
}

/**
 * Tokens the window paints from `AppAppearanceSettings` (KAPI-N / parity row 2).
 * The renderer sets these on `<html>`; CSS reads the data attributes and custom properties.
 * sendShortcut / unreadFirst / agentSteps are carried so screens can read one place without a second store.
 */
export interface AppearanceDomTokens {
  uiScale: string;
  font: AppFont;
  chatAccent: AppChatAccent;
  sendShortcut: AppSendShortcut;
  agentSteps: AppAgentSteps;
  unreadFirst: "true" | "false";
  /** Root font-size multiplier, e.g. "1.1" for 110%. */
  scaleFactor: string;
  /** Accent color for `--openbot-accent` (hex). */
  accentHex: string;
  /** Soft accent for `--openbot-accent-soft`. */
  accentSoft: string;
}

const APPEARANCE_ACCENT_HEX: Record<AppChatAccent, { accent: string; soft: string }> = {
  blue: { accent: "#3b82f6", soft: "rgb(59 130 246 / 18%)" },
  green: { accent: "#22c55e", soft: "rgb(34 197 94 / 18%)" },
  violet: { accent: "#8b5cf6", soft: "rgb(139 92 246 / 18%)" },
  orange: { accent: "#f97316", soft: "rgb(249 115 22 / 18%)" },
  pink: { accent: "#ec4899", soft: "rgb(236 72 153 / 18%)" },
  gray: { accent: "#94a3b8", soft: "rgb(148 163 184 / 18%)" },
};

/** Pure map from a saved look to DOM tokens (no browser). Invalid input falls back via normalize. */
export function appearanceDomTokens(value: unknown): AppearanceDomTokens {
  const appearance = normalizeAppAppearance(value);
  const colors = APPEARANCE_ACCENT_HEX[appearance.chatAccent];
  return {
    uiScale: String(appearance.uiScale),
    font: appearance.font,
    chatAccent: appearance.chatAccent,
    sendShortcut: appearance.sendShortcut,
    agentSteps: appearance.agentSteps,
    unreadFirst: appearance.unreadFirst ? "true" : "false",
    scaleFactor: String(appearance.uiScale / 100),
    accentHex: colors.accent,
    accentSoft: colors.soft,
  };
}

/** Where a link from a conversation opens: browser = the default browser of the computer, app = the browser inside the program (BE-X). */
export const APP_EXTERNAL_LINKS = ["browser", "app"] as const;
export type AppExternalLinks = (typeof APP_EXTERNAL_LINKS)[number];

/** OS-level switches of the desktop app (Windows login item today). */
export interface AppBehaviorSettings {
  /** True = the program opens when the person signs in to Windows. */
  launchAtLogin: boolean;
  /**
   * True = closing the window hides the program to the tray instead of ending it, so active tasks go on (BE-W). It only takes effect while the
   * tray icon exists: without it there would be no way back to the window.
   */
  keepBackground: boolean;
  externalLinks: AppExternalLinks;
}

export const DEFAULT_APP_BEHAVIOR: AppBehaviorSettings = {
  launchAtLogin: false,
  keepBackground: false,
  externalLinks: "browser",
};

const BEHAVIOR_KEYS = ["launchAtLogin", "keepBackground", "externalLinks"] as const;

export function isAppBehavior(value: unknown): value is AppBehaviorSettings {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.launchAtLogin) &&
    isBoolean(value.keepBackground) &&
    isOneOf(APP_EXTERNAL_LINKS, value.externalLinks)
  );
}

export function normalizeAppBehavior(value: unknown): AppBehaviorSettings {
  const stored = isDynamicRecord(value) ? value : {};
  return {
    launchAtLogin: isBoolean(stored.launchAtLogin) ? stored.launchAtLogin : DEFAULT_APP_BEHAVIOR.launchAtLogin,
    keepBackground: isBoolean(stored.keepBackground) ? stored.keepBackground : DEFAULT_APP_BEHAVIOR.keepBackground,
    externalLinks: isOneOf(APP_EXTERNAL_LINKS, stored.externalLinks)
      ? stored.externalLinks
      : DEFAULT_APP_BEHAVIOR.externalLinks,
  };
}

export function parseBehaviorPatch(value: unknown): Partial<AppBehaviorSettings> {
  if (!isDynamicRecord(value)) throw new Error("behavior must be an object.");
  for (const key of Object.keys(value)) {
    if (!isOneOf(BEHAVIOR_KEYS, key)) throw new Error(`Unknown behavior setting "${key}".`);
  }
  const patch: Partial<AppBehaviorSettings> = {};
  if (value.launchAtLogin !== undefined) {
    if (!isBoolean(value.launchAtLogin)) throw new Error("launchAtLogin is on or off.");
    patch.launchAtLogin = value.launchAtLogin;
  }
  if (value.keepBackground !== undefined) {
    if (!isBoolean(value.keepBackground)) throw new Error("keepBackground is on or off.");
    patch.keepBackground = value.keepBackground;
  }
  if (value.externalLinks !== undefined) {
    if (!isOneOf(APP_EXTERNAL_LINKS, value.externalLinks)) {
      throw new Error(`externalLinks is one of ${APP_EXTERNAL_LINKS.join(", ")}.`);
    }
    patch.externalLinks = value.externalLinks;
  }
  return patch;
}

// COSGRAL W12 (BE-X): "Restore the last workspace on launch". The window tells the engine where the person was (the page, the agent and
// the thread) and the engine keeps it with the other settings; on the next start the window reads it back and opens the same place. The
// engine only keeps and checks the ids: an agent that no longer exists is dropped when the settings are read, so the window is never sent to
// a place that is gone.

export interface AppWorkspaceMemory {
  page: AppPageId | null;
  botId: string | null;
  threadId: string | null;
}

export interface AppWorkspaceSettings {
  /** True = the window opens where the person left it. On by default. */
  restore: boolean;
  last: AppWorkspaceMemory | null;
}

export const DEFAULT_APP_WORKSPACE: AppWorkspaceSettings = { restore: true, last: null };

const WORKSPACE_ID_LIMIT = 200;

function isWorkspaceId(value: unknown): value is string | null {
  return (
    value === null ||
    (isString(value) && value.length > 0 && value.length <= WORKSPACE_ID_LIMIT && !/\p{Cc}/u.test(value))
  );
}

function isWorkspaceMemory(value: unknown): value is AppWorkspaceMemory {
  return (
    isDynamicRecord(value) &&
    (value.page === null || isOneOf(APP_PAGE_IDS, value.page)) &&
    isWorkspaceId(value.botId) &&
    isWorkspaceId(value.threadId) &&
    // A thread belongs to an agent: a thread without its agent cannot be opened.
    (value.threadId === null || value.botId !== null)
  );
}

export function isAppWorkspace(value: unknown): value is AppWorkspaceSettings {
  return isDynamicRecord(value) && isBoolean(value.restore) && (value.last === null || isWorkspaceMemory(value.last));
}

/** A saved value read back: what is not valid returns to the default (older or edited data is not trusted). */
export function normalizeAppWorkspace(value: unknown): AppWorkspaceSettings {
  const stored = isDynamicRecord(value) ? value : {};
  return {
    restore: isBoolean(stored.restore) ? stored.restore : DEFAULT_APP_WORKSPACE.restore,
    last: isWorkspaceMemory(stored.last)
      ? { page: stored.last.page, botId: stored.last.botId, threadId: stored.last.threadId }
      : null,
  };
}

/** A change from the window: `restore` and/or `last` (null forgets the place). Throws a plain sentence for the first problem. */
export function parseWorkspacePatch(value: unknown): Partial<AppWorkspaceSettings> {
  if (!isDynamicRecord(value)) throw new Error("workspace must be an object.");
  for (const key of Object.keys(value)) {
    if (key !== "restore" && key !== "last") throw new Error(`Unknown workspace setting "${key}".`);
  }
  const patch: Partial<AppWorkspaceSettings> = {};
  if (value.restore !== undefined) {
    if (!isBoolean(value.restore)) throw new Error("restore is on or off.");
    patch.restore = value.restore;
  }
  if (value.last !== undefined) {
    if (value.last !== null && !isWorkspaceMemory(value.last)) {
      throw new Error("last is a place: a page, an agent id and a thread id of that agent, or null.");
    }
    patch.last =
      value.last === null ? null : { page: value.last.page, botId: value.last.botId, threadId: value.last.threadId };
  }
  return patch;
}

export interface AppSettings {
  theme: AppTheme;
  language: AppLanguage;
  /** False until the person chose a language (onboarding or settings); agents then get no language note. */
  languageChosen: boolean;
  notifications: NotificationPreferences;
  tabs: SettingsTab[];
  navigation: AppNavigationSettings;
  appearance: AppAppearanceSettings;
  behavior: AppBehaviorSettings;
  workspace: AppWorkspaceSettings;
}

export interface UpdateAppSettingsInput {
  theme?: AppTheme;
  language?: AppLanguage;
  notifications?: {
    matrix?: Partial<Record<NotificationEvent, Partial<Record<NotificationChannel, boolean>>>>;
    onlyWhenUnfocused?: boolean;
  };
  /** Replaces the whole pinned list (unknown ids and duplicates are refused). An empty list unpins everything. */
  navigation?: { pinnedPageIds: AppPageId[] };
  /** Changes only the fields that are given; the others stay as they are. */
  appearance?: Partial<AppAppearanceSettings>;
  behavior?: Partial<AppBehaviorSettings>;
  workspace?: Partial<AppWorkspaceSettings>;
}

/** True for a list of known page ids without duplicates. */
export function isPinnedPageIdList(value: unknown): value is AppPageId[] {
  return (
    Array.isArray(value) &&
    value.length <= APP_PAGE_IDS.length &&
    value.every((id) => isOneOf(APP_PAGE_IDS, id)) &&
    new Set(value).size === value.length
  );
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
    isOneOf(APP_THEMES, value.theme) &&
    isOneOf(APP_LANGUAGES, value.language) &&
    isBoolean(value.languageChosen) &&
    isNotificationPreferences(value.notifications) &&
    Array.isArray(value.tabs) &&
    value.tabs.every((tab) => isDynamicRecord(tab) && isOneOf(SETTINGS_TABS, tab.id) && isBoolean(tab.available)) &&
    isDynamicRecord(value.navigation) &&
    isPinnedPageIdList(value.navigation.pinnedPageIds) &&
    isAppAppearance(value.appearance) &&
    isAppBehavior(value.behavior) &&
    isAppWorkspace(value.workspace)
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
