// COSGRAL W12 (BE-D, part c): the settings of the server, in one window with 14 sections (as in OpenBot 0.71):
// General, Personality, Agents, Vault, Members, Remote desktop, MCP, Storage, Sites, Providers, Import, Transfer, Routines, Browser profiles.
// Most sections already have their own API; this contract gives the window the list of sections (which API serves each one and whether
// it works on this computer) and holds only what had no home: the values of General, Personality and Agents, and the Storage numbers.
//
// This computer only. Members and Sites need an online service (invitations, hosting): they are listed as not available here.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const SERVER_SETTINGS_SECTIONS = [
  "general",
  "personality",
  "agents",
  "vault",
  "members",
  "remote-desktop",
  "mcp",
  "storage",
  "sites",
  "providers",
  "import",
  "transfer",
  "routines",
  "browser-profiles",
] as const;
export type ServerSettingsSectionId = (typeof SERVER_SETTINGS_SECTIONS)[number];

/** Where the data of a section comes from: `serverSettings` itself, or the named `window.openbot.<api>`. */
export type ServerSettingsSectionSource =
  | { kind: "settings" }
  | { kind: "api"; api: "vault" | "remoteDesktop" | "mcp" | "providers" | "routines" | "browserProfiles" | "transfer" }
  | { kind: "unavailable"; reason: string };

export interface ServerSettingsSection {
  id: ServerSettingsSectionId;
  source: ServerSettingsSectionSource;
}

/** The name a server has until the person renames it; the window shows it in the app's language (the stored text stays as it is). */
export const DEFAULT_SERVER_NAME = "This computer";

export const SERVER_SETTINGS_LIMITS = {
  nameMax: 60,
  /** Most threads of all agents that may run at the same time (null = no limit). */
  maxThreads: 64,
  maxThreadsPerAgent: 16,
  defaultThreadsPerAgent: 4,
  minMemories: 16,
  maxMemories: 4_096,
  defaultMemories: 256,
  logoBytes: 262_144,
} as const;

export const MEMORY_REVIEW_INTERVALS = [0, 5, 10, 20, 50] as const;
export type MemoryReviewInterval = (typeof MEMORY_REVIEW_INTERVALS)[number];

export const SKILL_LEARNING_MODES = ["auto", "ask", "off"] as const;
export type SkillLearningMode = (typeof SKILL_LEARNING_MODES)[number];

export const RESPONSE_STYLES = ["natural", "classic"] as const;
export type ResponseStyle = (typeof RESPONSE_STYLES)[number];

export const SERVER_BUSY_MESSAGE_MODES = ["queue", "steer"] as const;
export type ServerBusyMessageMode = (typeof SERVER_BUSY_MESSAGE_MODES)[number];

export interface ServerGeneralSettings {
  /** Shown in invitations and shared spaces. */
  name: string;
  /** A `data:image/…` URL of at most logoBytes, or null. */
  logo: string | null;
  /** An IANA zone ("Europe/Warsaw"); null = the zone of this computer. */
  timezone: string | null;
  /** All agents together; null = no limit. */
  maxThreads: number | null;
  /** For an agent without its own limit. */
  threadsPerAgent: number;
  memoriesPerAgent: number;
  /** Every n turns agents save lasting facts in the background; 0 = never. */
  memoryReviewEvery: MemoryReviewInterval;
  skillLearning: SkillLearningMode;
  /** While the person drives the agent's browser, the agent learns how the pages work (never the typed text). */
  learnFromBrowsing: boolean;
}

export interface ServerPersonalitySettings {
  responseStyle: ResponseStyle;
}

/** What agents do when an agent has not set it for itself. */
export interface ServerAgentDefaults {
  localScripts: boolean;
  agentStartsNewChats: boolean;
  showPlanBeforeLongTasks: boolean;
  busyMessage: ServerBusyMessageMode;
  /** Agents add the program as co-author of their commits (the person stays the author). */
  mentionInCommits: boolean;
}

export interface ServerSettings {
  general: ServerGeneralSettings;
  personality: ServerPersonalitySettings;
  agents: ServerAgentDefaults;
}

export interface UpdateServerSettingsInput {
  general?: Partial<ServerGeneralSettings>;
  personality?: Partial<ServerPersonalitySettings>;
  agents?: Partial<ServerAgentDefaults>;
}

export const STORAGE_ITEM_IDS = ["chat-history", "provider-environments", "app-data"] as const;
export type StorageItemId = (typeof STORAGE_ITEM_IDS)[number];

export interface StorageItem {
  id: StorageItemId;
  bytes: number;
}

export interface StorageReport {
  /** What the program keeps on the disk of this computer. */
  totalBytes: number;
  /** Free space of the disk; null when the system does not say. */
  freeBytes: number | null;
  items: StorageItem[];
  /** What cleaning would free now. */
  reclaimableBytes: number;
  measuredAt: string;
}

/** `window.openbot.serverSettings` (this computer only). */
export interface ServerSettingsDesktopApi {
  /** The 14 sections in the order of the window, each with its source. */
  sections: () => Promise<ServerSettingsSection[]>;
  get: () => Promise<ServerSettings>;
  /** Fields left out stay; one `server-settings-changed` event with the whole settings. */
  update: (input: UpdateServerSettingsInput) => Promise<ServerSettings>;
  /** Measures the disk use again (it can take a moment). */
  measureStorage: () => Promise<StorageReport>;
  /** Deletes the diagnostic logs (new ones start at once); returns the new measurement. */
  clearLogs: () => Promise<StorageReport>;
}

export interface ServerSettingsChanged {
  settings: ServerSettings;
}

// -- rules shared by the engine and the mock -------------------------------------------------------------------------------------

export function defaultServerSettings(): ServerSettings {
  return {
    general: {
      name: DEFAULT_SERVER_NAME,
      logo: null,
      timezone: null,
      maxThreads: null,
      threadsPerAgent: SERVER_SETTINGS_LIMITS.defaultThreadsPerAgent,
      memoriesPerAgent: SERVER_SETTINGS_LIMITS.defaultMemories,
      memoryReviewEvery: 20,
      skillLearning: "auto",
      learnFromBrowsing: false,
    },
    personality: { responseStyle: "natural" },
    agents: {
      localScripts: false,
      agentStartsNewChats: false,
      showPlanBeforeLongTasks: false,
      busyMessage: "queue",
      mentionInCommits: false,
    },
  };
}

/** The 14 sections in order, with the API that serves each one on this computer. */
export function serverSettingsSections(): ServerSettingsSection[] {
  const api = (id: ServerSettingsSectionId, name: Extract<ServerSettingsSectionSource, { kind: "api" }>["api"]) =>
    ({ id, source: { kind: "api", api: name } }) satisfies ServerSettingsSection;
  const own = (id: ServerSettingsSectionId) => ({ id, source: { kind: "settings" } }) satisfies ServerSettingsSection;
  return [
    own("general"),
    own("personality"),
    own("agents"),
    api("vault", "vault"),
    {
      id: "members",
      source: {
        kind: "unavailable",
        reason:
          "Invite people from the server bar on the left: right-click your server and choose Publish this COSGRAL Workspace. It works through Tailscale, a private network.",
      },
    },
    api("remote-desktop", "remoteDesktop"),
    api("mcp", "mcp"),
    own("storage"),
    {
      id: "sites",
      source: {
        kind: "unavailable",
        reason: "Hosting sites needs an online service. This program runs on this computer only.",
      },
    },
    api("providers", "providers"),
    api("import", "transfer"),
    api("transfer", "transfer"),
    api("routines", "routines"),
    api("browser-profiles", "browserProfiles"),
  ];
}

function plainInteger(value: unknown, min: number, max: number): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= min && value <= max;
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function parseGeneral(input: unknown): Partial<ServerGeneralSettings> {
  if (!isDynamicRecord(input)) throw new Error("General settings are a set of fields.");
  const out: Partial<ServerGeneralSettings> = {};
  const L = SERVER_SETTINGS_LIMITS;
  if (input.name !== undefined) {
    const name = isString(input.name) ? input.name.trim() : "";
    if (name.length === 0 || name.length > L.nameMax)
      throw new Error(`The server name has 1 to ${L.nameMax} characters.`);
    out.name = name;
  }
  if (input.logo !== undefined) {
    if (
      input.logo !== null &&
      !(isString(input.logo) && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(input.logo))
    ) {
      throw new Error("The logo is an image (png, jpeg, webp or svg) or null.");
    }
    if (isString(input.logo) && Math.floor((input.logo.length * 3) / 4) > L.logoBytes) {
      throw new Error(`The logo is at most ${L.logoBytes / 1024} KB.`);
    }
    out.logo = input.logo;
  }
  if (input.timezone !== undefined) {
    if (input.timezone !== null && !(isString(input.timezone) && isTimezone(input.timezone))) {
      throw new Error("This time zone is not known.");
    }
    out.timezone = input.timezone;
  }
  if (input.maxThreads !== undefined) {
    if (input.maxThreads !== null && !plainInteger(input.maxThreads, 1, L.maxThreads)) {
      throw new Error(`Threads at the same time: a whole number from 1 to ${L.maxThreads}, or no limit.`);
    }
    out.maxThreads = input.maxThreads;
  }
  if (input.threadsPerAgent !== undefined) {
    if (!plainInteger(input.threadsPerAgent, 1, L.maxThreadsPerAgent)) {
      throw new Error(`Threads per agent: a whole number from 1 to ${L.maxThreadsPerAgent}.`);
    }
    out.threadsPerAgent = input.threadsPerAgent;
  }
  if (input.memoriesPerAgent !== undefined) {
    if (!plainInteger(input.memoriesPerAgent, L.minMemories, L.maxMemories)) {
      throw new Error(`Memories per agent: a whole number from ${L.minMemories} to ${L.maxMemories}.`);
    }
    out.memoriesPerAgent = input.memoriesPerAgent;
  }
  if (input.memoryReviewEvery !== undefined) {
    if (!isOneOf(MEMORY_REVIEW_INTERVALS, input.memoryReviewEvery)) {
      throw new Error(`The memory review is every ${MEMORY_REVIEW_INTERVALS.slice(1).join(", ")} turns, or off (0).`);
    }
    out.memoryReviewEvery = input.memoryReviewEvery;
  }
  if (input.skillLearning !== undefined) {
    if (!isOneOf(SKILL_LEARNING_MODES, input.skillLearning)) throw new Error("Skill learning is auto, ask or off.");
    out.skillLearning = input.skillLearning;
  }
  if (input.learnFromBrowsing !== undefined) {
    if (!isBoolean(input.learnFromBrowsing)) throw new Error("Learning from browsing is on or off.");
    out.learnFromBrowsing = input.learnFromBrowsing;
  }
  return out;
}

function parseAgents(input: unknown): Partial<ServerAgentDefaults> {
  if (!isDynamicRecord(input)) throw new Error("Agent defaults are a set of fields.");
  const out: Partial<ServerAgentDefaults> = {};
  for (const key of ["localScripts", "agentStartsNewChats", "showPlanBeforeLongTasks", "mentionInCommits"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (!isBoolean(value)) throw new Error(`"${key}" is on or off.`);
    out[key] = value;
  }
  if (input.busyMessage !== undefined) {
    if (!isOneOf(SERVER_BUSY_MESSAGE_MODES, input.busyMessage)) throw new Error("Choose queue or steer.");
    out.busyMessage = input.busyMessage;
  }
  return out;
}

export function parseUpdateServerSettingsInput(input: unknown): UpdateServerSettingsInput {
  if (!isDynamicRecord(input)) throw new Error("Nothing to change.");
  const out: UpdateServerSettingsInput = {};
  if (input.general !== undefined) out.general = parseGeneral(input.general);
  if (input.personality !== undefined) {
    if (!isDynamicRecord(input.personality) || !isOneOf(RESPONSE_STYLES, input.personality.responseStyle)) {
      throw new Error("The response style is natural or classic.");
    }
    out.personality = { responseStyle: input.personality.responseStyle };
  }
  if (input.agents !== undefined) out.agents = parseAgents(input.agents);
  const changed = [out.general, out.personality, out.agents].some((part) => part && Object.keys(part).length > 0);
  if (!changed) throw new Error("Nothing to change.");
  return out;
}

export function applyServerSettingsChanges(
  current: ServerSettings,
  changes: UpdateServerSettingsInput,
): ServerSettings {
  return {
    general: { ...current.general, ...changes.general },
    personality: { ...current.personality, ...changes.personality },
    agents: { ...current.agents, ...changes.agents },
  };
}

export function isServerSettings(value: unknown): value is ServerSettings {
  if (!isDynamicRecord(value) || !isDynamicRecord(value.general)) return false;
  if (!isDynamicRecord(value.personality) || !isDynamicRecord(value.agents)) return false;
  try {
    const general = parseGeneral(value.general);
    const agents = parseAgents(value.agents);
    return (
      Object.keys(general).length === 9 &&
      isOneOf(RESPONSE_STYLES, value.personality.responseStyle) &&
      Object.keys(agents).length === 5
    );
  } catch {
    return false;
  }
}

export function isServerSettingsSection(value: unknown): value is ServerSettingsSection {
  if (!isDynamicRecord(value) || !isOneOf(SERVER_SETTINGS_SECTIONS, value.id) || !isDynamicRecord(value.source))
    return false;
  const { source } = value;
  if (source.kind === "settings") return true;
  if (source.kind === "unavailable") return isString(source.reason) && source.reason.length > 0;
  return (
    source.kind === "api" &&
    isOneOf(
      ["vault", "remoteDesktop", "mcp", "providers", "routines", "browserProfiles", "transfer"] as const,
      source.api,
    )
  );
}

export function isServerSettingsSections(value: unknown): value is ServerSettingsSection[] {
  return (
    Array.isArray(value) &&
    value.every(isServerSettingsSection) &&
    value.map((section) => section.id).join() === SERVER_SETTINGS_SECTIONS.join()
  );
}

export function isStorageReport(value: unknown): value is StorageReport {
  return (
    isDynamicRecord(value) &&
    plainInteger(value.totalBytes, 0, Number.MAX_SAFE_INTEGER) &&
    (value.freeBytes === null || plainInteger(value.freeBytes, 0, Number.MAX_SAFE_INTEGER)) &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isDynamicRecord(item) &&
        isOneOf(STORAGE_ITEM_IDS, item.id) &&
        plainInteger(item.bytes, 0, Number.MAX_SAFE_INTEGER),
    ) &&
    plainInteger(value.reclaimableBytes, 0, Number.MAX_SAFE_INTEGER) &&
    isString(value.measuredAt)
  );
}

export function isServerSettingsChanged(
  value: unknown,
): value is ServerSettingsChanged & { type: "server-settings-changed" } {
  return isDynamicRecord(value) && value.type === "server-settings-changed" && isServerSettings(value.settings);
}
