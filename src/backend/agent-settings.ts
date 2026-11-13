// COSGRAL W3: full agent settings (parity row 39) and the app settings around them.
// - Tool groups per agent: switched-off groups leave the agent's tools at the next thread start or resume, and their
//   calls are refused (Codex, Claude and channel turns go through the same dispatch). Questions, cards, channel
//   tools and MCP (its own switch per server) are never switched off here.
// - One read and one save for the settings screen, on top of the profile, model, memory, skills and MCP of W2.
// - App settings: language, the notification matrix and the settings tabs.
// The tables are created here with CREATE TABLE IF NOT EXISTS (the shared schema and its version stay untouched).

import type { DatabaseSync } from "node:sqlite";
import {
  AGENT_TOOL_GROUPS,
  type AgentEvent,
  type AgentMcpServerSetting,
  type AgentMemorySettings,
  type AgentModelOption,
  type AgentSettings,
  type AgentSkillSummary,
  type AgentToolGroup,
  type AgentToolSwitches,
  APP_LANGUAGES,
  type AppLanguage,
  type AppSettings,
  type BotSummary,
  defaultNotificationPreferences,
  isClaudeModel,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  type NotificationPreferences,
  SETTINGS_TABS,
  type SettingsTabId,
  type UpdateAgentSettingsInput,
  type UpdateAppSettingsInput,
  type UpdateBotInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { isMemoryToolName } from "./memory-service";
import type { OpenBotDatabase } from "./openbot-database";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_agent_tool_settings (
    agent_id TEXT PRIMARY KEY,
    tools_json TEXT NOT NULL CHECK(json_valid(tools_json)),
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_app_settings (
    setting_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL CHECK(json_valid(value_json)),
    updated_at TEXT NOT NULL
  );
`;

/** The namespace of each tool group that owns a whole namespace. */
const GROUP_NAMESPACES: Partial<Record<AgentToolGroup, string>> = {
  browser: "openbot_browser",
  computer: "cosgral_computer",
  eyes: "cosgral_eyes",
  vault: "cosgral_vault",
  skills: "cosgral_skills",
  tables: "cosgral_tables",
  library: "cosgral_library",
  routines: "cosgral_routines",
};

const GROUP_LABELS: Record<AgentToolGroup, string> = {
  browser: "browser",
  computer: "computer use",
  eyes: "eyes (screen and camera)",
  vault: "Vault",
  skills: "skills",
  tables: "shared tables",
  library: "file library",
  routines: "routines",
  memory: "memory",
  messaging: "messaging other agents",
};

const LANGUAGE_NAMES: Record<AppLanguage, string> = { en: "English", pl: "Polish" };

/** Tabs that need a feature this program does not have yet. */
const TAB_FEATURES: Partial<Record<SettingsTabId, "computer" | "missing">> = {
  "computer-use": "computer",
  voice: "missing",
  mobile: "missing",
  dock: "missing",
  island: "missing",
};

export interface AgentSettingsDeps {
  database: OpenBotDatabase;
  bot: (botId: string) => BotSummary | null;
  models: () => AgentModelOption[];
  /** The normal agent update (checks a provider change against running work). */
  updateBot: (input: UpdateBotInput) => Promise<BotSummary>;
  memory: (botId: string) => AgentMemorySettings;
  skills: (botId: string) => Promise<AgentSkillSummary[]>;
  mcp: (botId: string) => AgentMcpServerSetting[];
  /** Groups this computer or program cannot offer now (missing means available). */
  availability: () => Partial<Record<AgentToolGroup, boolean>>;
  /** Tabs of features that other parts of the program bring (e.g. the dock); missing keeps the default. */
  tabFeatures?: () => Partial<Record<SettingsTabId, boolean>>;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
}

interface NamedTool {
  name: string;
  tools?: ReadonlyArray<{ name: string }>;
}

export class AgentSettingsService {
  readonly #deps: AgentSettingsDeps;
  readonly #ready = new WeakSet<DatabaseSync>();

  constructor(deps: AgentSettingsDeps) {
    this.#deps = deps;
  }

  /** The groups a person switched off (missing groups are on). */
  toolSwitches(botId: string): AgentToolSwitches {
    const row = this.#db()
      .prepare("SELECT tools_json FROM projection_agent_tool_settings WHERE agent_id = ?")
      .get(botId);
    if (!isDynamicRecord(row) || !isString(row.tools_json)) return {};
    return parseSwitches(row.tools_json);
  }

  enabled(botId: string, group: AgentToolGroup): boolean {
    return this.toolSwitches(botId)[group] !== false;
  }

  /** Drops the namespaces and tools of switched-off groups from a dynamic tool list. */
  filterTools<T extends NamedTool>(botId: string, tools: T[]): T[] {
    return tools.flatMap((tool) => this.keepTool(botId, tool));
  }

  /** The same for an untyped tool list (channel turns). */
  filterDynamicTools(botId: string, tools: unknown[]): unknown[] {
    return tools.flatMap((tool) => {
      if (!isDynamicRecord(tool) || !isString(tool.name)) return [tool];
      const inner = Array.isArray(tool.tools) ? tool.tools.filter(isNamedEntry) : null;
      return this.keepTool(botId, inner ? { ...tool, name: tool.name, tools: inner } : { ...tool, name: tool.name });
    });
  }

  /** One entry of a dynamic tool list: [] when its group is off, the openbot namespace without switched-off tools. */
  keepTool<T extends NamedTool>(botId: string, item: T): T[] {
    const switches = this.toolSwitches(botId);
    const off = (group: AgentToolGroup) => switches[group] === false;
    const group = groupOfNamespace(item.name);
    if (group && off(group)) return [];
    if (item.name === "openbot" && item.tools && (off("messaging") || off("memory"))) {
      const inner = item.tools.filter((tool) => {
        const toolGroup = groupOfOpenBotTool(tool.name);
        return !toolGroup || !off(toolGroup);
      });
      return [Object.assign({}, item, { tools: inner })];
    }
    return [item];
  }

  /** A refusal text when the call belongs to a switched-off group, otherwise null. */
  blockedTool(botId: string | undefined, call: { namespace: string | null; tool: string }): string | null {
    if (!botId) return null;
    const group =
      call.namespace === "openbot"
        ? groupOfOpenBotTool(call.tool)
        : call.namespace
          ? groupOfNamespace(call.namespace)
          : null;
    if (!group || this.enabled(botId, group)) return null;
    return `The person switched off the ${GROUP_LABELS[group]} for you in your settings. Do not use it; ask them to switch it on if you need it.`;
  }

  /** Changes when the tool set changes, so the provider thread is resumed with the new tools. */
  signature(botId: string): string {
    return JSON.stringify(this.toolSwitches(botId));
  }

  /** Lines for the agent's developer instructions: switched-off tools and the person's language. */
  instructions(botId: string): string {
    const lines: string[] = [];
    const off = AGENT_TOOL_GROUPS.filter((group) => this.toolSwitches(botId)[group] === false);
    if (off.length) {
      lines.push(
        `The person switched off these tools for you: ${off.map((group) => GROUP_LABELS[group]).join(", ")}. Do not try them; ask the person to switch them on in your settings if you need them.`,
      );
    }
    const settings = this.appSettings();
    if (settings.languageChosen) {
      lines.push(
        `The person's language is ${LANGUAGE_NAMES[settings.language]}: reply in it unless they write in another language.`,
      );
    }
    return lines.join("\n");
  }

  async get(botId: string): Promise<AgentSettings> {
    const bot = this.#requireBot(botId);
    const switches = this.toolSwitches(botId);
    const availability = this.#deps.availability();
    return {
      bot,
      provider: isClaudeModel(bot.model) ? "claude" : "codex",
      models: this.#deps.models(),
      tools: AGENT_TOOL_GROUPS.map((group) => ({
        group,
        enabled: switches[group] !== false,
        available: availability[group] !== false,
      })),
      memory: this.#deps.memory(botId),
      skills: await this.#deps.skills(botId),
      mcp: this.#deps.mcp(botId),
    };
  }

  /** One save: profile and model through the normal agent update, then the tool switches. */
  async update(input: UpdateAgentSettingsInput): Promise<AgentSettings> {
    this.#requireBot(input.botId);
    const { tools, botId, ...profile } = input;
    if (Object.keys(profile).length > 0) await this.#deps.updateBot({ botId, ...profile });
    if (tools) this.setTools(botId, tools);
    return this.get(botId);
  }

  /** Switches given groups; a group switched back on is removed (on is the default). */
  setTools(botId: string, tools: AgentToolSwitches): void {
    const next = { ...this.toolSwitches(botId) };
    for (const [group, enabled] of Object.entries(tools)) {
      if (!isOneOf(AGENT_TOOL_GROUPS, group)) throw new Error(`Unknown tool group "${group}".`);
      if (!isBoolean(enabled)) throw new Error(`The switch of "${group}" must be true or false.`);
      if (enabled) delete next[group];
      else next[group] = false;
    }
    const at = this.#now();
    this.#db()
      .prepare(
        `INSERT INTO projection_agent_tool_settings (agent_id, tools_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET tools_json = excluded.tools_json, updated_at = excluded.updated_at`,
      )
      .run(botId, JSON.stringify(next), at);
    this.#deps.emit({ type: "agent-settings-changed", botId });
  }

  deleteAgent(botId: string): void {
    this.#db().prepare("DELETE FROM projection_agent_tool_settings WHERE agent_id = ?").run(botId);
  }

  appSettings(): AppSettings {
    const stored = this.#readAppSetting();
    const availability = this.#deps.availability();
    const extra = this.#deps.tabFeatures?.() ?? {};
    return {
      language: stored.language ?? "en",
      languageChosen: stored.language !== null,
      notifications: stored.notifications,
      tabs: SETTINGS_TABS.map((id) => {
        const feature = TAB_FEATURES[id];
        const base = feature === "computer" ? availability.computer !== false : feature !== "missing";
        return { id, available: extra[id] ?? base };
      }),
    };
  }

  async updateAppSettings(input: UpdateAppSettingsInput): Promise<AppSettings> {
    const stored = this.#readAppSetting();
    if (input.language !== undefined) {
      if (!isOneOf(APP_LANGUAGES, input.language)) throw new Error("language must be en or pl.");
      stored.language = input.language;
    }
    if (input.notifications) {
      const matrix = input.notifications.matrix ?? {};
      for (const [event, row] of Object.entries(matrix)) {
        if (!isOneOf(NOTIFICATION_EVENTS, event)) throw new Error(`Unknown notification event "${event}".`);
        for (const [channel, enabled] of Object.entries(row ?? {})) {
          if (!isOneOf(NOTIFICATION_CHANNELS, channel)) throw new Error(`Unknown notification channel "${channel}".`);
          if (!isBoolean(enabled)) throw new Error("A notification switch must be true or false.");
          stored.notifications.matrix[event][channel] = enabled;
        }
      }
      if (input.notifications.onlyWhenUnfocused !== undefined) {
        stored.notifications.onlyWhenUnfocused = input.notifications.onlyWhenUnfocused === true;
      }
    }
    this.#db()
      .prepare(
        `INSERT INTO projection_app_settings (setting_key, value_json, updated_at) VALUES ('app', ?, ?)
         ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify(stored), this.#now());
    const settings = this.appSettings();
    this.#deps.emit({ type: "app-settings-changed", settings });
    return settings;
  }

  #readAppSetting(): { language: AppLanguage | null; notifications: NotificationPreferences } {
    const defaults = { language: null, notifications: defaultNotificationPreferences() };
    const row = this.#db().prepare("SELECT value_json FROM projection_app_settings WHERE setting_key = 'app'").get();
    if (!isDynamicRecord(row) || !isString(row.value_json)) return defaults;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value_json);
    } catch {
      return defaults;
    }
    if (!isDynamicRecord(parsed)) return defaults;
    const notifications = defaultNotificationPreferences();
    const storedNotifications = isDynamicRecord(parsed.notifications) ? parsed.notifications : {};
    const storedMatrix = isDynamicRecord(storedNotifications.matrix) ? storedNotifications.matrix : {};
    for (const event of NOTIFICATION_EVENTS) {
      const storedRow = storedMatrix[event];
      if (!isDynamicRecord(storedRow)) continue;
      for (const channel of NOTIFICATION_CHANNELS) {
        const value = storedRow[channel];
        if (isBoolean(value)) notifications.matrix[event][channel] = value;
      }
    }
    if (isBoolean(storedNotifications.onlyWhenUnfocused)) {
      notifications.onlyWhenUnfocused = storedNotifications.onlyWhenUnfocused;
    }
    return { language: isOneOf(APP_LANGUAGES, parsed.language) ? parsed.language : null, notifications };
  }

  #requireBot(botId: string): BotSummary {
    const bot = this.#deps.bot(botId);
    if (!bot) throw new Error(`Agent "${botId}" no longer exists.`);
    return bot;
  }

  #db(): DatabaseSync {
    const db = this.#deps.database.connection;
    if (!this.#ready.has(db)) {
      db.exec(SCHEMA);
      this.#ready.add(db);
    }
    return db;
  }

  #now(): string {
    return (this.#deps.now?.() ?? new Date()).toISOString();
  }
}

function isNamedEntry(value: unknown): value is { name: string } {
  return isDynamicRecord(value) && isString(value.name);
}

function groupOfNamespace(namespace: string): AgentToolGroup | null {
  for (const group of AGENT_TOOL_GROUPS) {
    if (GROUP_NAMESPACES[group] === namespace) return group;
  }
  return null;
}

function groupOfOpenBotTool(tool: string): AgentToolGroup | null {
  if (tool === "send_message") return "messaging";
  if (isMemoryToolName(tool)) return "memory";
  return null;
}

function parseSwitches(json: string): AgentToolSwitches {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  const switches: AgentToolSwitches = {};
  if (!isDynamicRecord(parsed)) return switches;
  for (const group of AGENT_TOOL_GROUPS) {
    if (parsed[group] === false) switches[group] = false;
  }
  return switches;
}
