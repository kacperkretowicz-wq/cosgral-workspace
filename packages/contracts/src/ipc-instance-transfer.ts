// COSGRAL W12-KK (g2): moving agents between computers with ONE .zip file (Settings of the server: "Transfer" and "Import"), and the
// preferences of program updates. Our own contract for the behaviour of OpenBot 0.71 (parity rows: instance transfer, agent import).
//
// WHAT TRAVELS. For each chosen agent: its profile (name, role, instructions, avatar colour), its skills (the files of each), its
// memories and its routines; and, if the person asks, the portable settings of the server. WHAT NEVER TRAVELS: API keys, sign-ins,
// connector tokens, the Vault, the values of MCP variables and headers, chat history, the files of the Library (not in this version)
// and the preferences of the program. The file holds no secret, and the window never gets a path or the bytes of the file: the main
// process opens the save/open dialogs, writes and reads the file, and the window only names agents and a token.
//
// WHAT AN IMPORT DOES. It first STAGES the file (reads it, checks it, shows every agent and what it brings) and changes nothing.
// Then the person picks agents and `apply` creates NEW agents only: nothing that exists is overwritten, a name that is taken gets a
// numbered copy name, a routine from a file is created PAUSED (the person turns it on), and a skill is saved as a new library skill.
// The same staging reads the agent export of another program (a .zip with a manifest of agents), so "Import" and "Transfer" are one engine.

import type { UpdateStatus } from "./ipc-app-auth";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const INSTANCE_TRANSFER_LIMITS = {
  /** The file is read into memory on import, so it stays well below what a computer holds. */
  archiveBytes: 512 * 1024 * 1024,
  /** One file inside the archive after unpacking (a zip bomb stops here). */
  entryBytes: 32 * 1024 * 1024,
  /** All unpacked bytes of one file. */
  unpackedBytes: 1024 * 1024 * 1024,
  entries: 20_000,
  agents: 200,
  skillsPerAgent: 100,
  memoriesPerAgent: 1_000,
  routinesPerAgent: 100,
  warnings: 50,
  text: 20_000,
  name: 200,
} as const;

/** What one agent of this computer would bring (the Transfer page lists these to pick from). */
export interface TransferAgentSummary {
  id: string;
  name: string;
  /** The role line. */
  title: string;
  avatarSeed: string;
  skillCount: number;
  routineCount: number;
  memoryCount: number;
}

export interface InstanceTransferSummary {
  agents: TransferAgentSummary[];
  /** What this version can carry; the window shows the rest as "not moved". */
  capabilities: { settings: boolean; files: boolean; history: boolean };
}

export interface ExportInstanceInput {
  agentIds: string[];
  /** Also the portable settings of the server (Personality, defaults for agents). */
  includeSettings: boolean;
}

/** `cancelled`: the person closed the save dialog; nothing was written. */
export type ExportInstanceResult =
  | { status: "saved"; fileName: string; bytes: number; agents: number; warnings: string[] }
  | { status: "cancelled" };

/** Where a staged file came from: this program's own transfer, or the agent export of another program. */
export const TRANSFER_SOURCES = ["transfer", "agent-export"] as const;
export type TransferSource = (typeof TRANSFER_SOURCES)[number];

export interface TransferPreviewAgent {
  /** The agent's key inside the file; `apply` names agents by it. */
  key: string;
  name: string;
  title: string;
  skillNames: string[];
  memoryCount: number;
  routineNames: string[];
  /** An agent with this name exists here: the import makes a numbered copy name, it never overwrites. */
  nameTaken: boolean;
}

export interface TransferPreview {
  /** One-time id of the staged file; the window never sees a path. */
  token: string;
  source: TransferSource;
  /** The program that made the file, as it says (a short text), and when. */
  sourceApp: string;
  exportedAt: string | null;
  agents: TransferPreviewAgent[];
  hasSettings: boolean;
  /** Things in the file that will be left out, in plain sentences. */
  warnings: string[];
}

export interface ApplyTransferInput {
  token: string;
  /** The agents to import, by key; an empty list imports only the settings. */
  keys: string[];
  includeSettings: boolean;
}

export const TRANSFER_SKIP_REASONS = ["unselected", "invalid", "limit", "failed"] as const;
export type TransferSkipReason = (typeof TRANSFER_SKIP_REASONS)[number];

export interface ApplyTransferResult {
  agents: Array<{ key: string; id: string; name: string }>;
  skipped: Array<{ key: string; reason: TransferSkipReason }>;
  /** Routines were created paused; skills and memories that could not be saved; and so on. */
  warnings: string[];
  settingsApplied: boolean;
}

export interface DiscardTransferInput {
  token: string;
}

/** Sources the Import page offers, with whether this version can read them. */
export const IMPORT_SOURCE_IDS = ["agent-zip", "hermes", "other-computer"] as const;
export type ImportSourceId = (typeof IMPORT_SOURCE_IDS)[number];

export interface ImportSourceInfo {
  id: ImportSourceId;
  /** The card's title. */
  label: string;
  /** The card's line under the title. */
  description: string;
  available: boolean;
  /** Why it is not available, or for `other-computer`: where to go instead ("Use Transfer"). */
  note: string | null;
}

/** The cards of the Import page, in order. One list for the program and the preview, so both say the same. */
export function importSourceCards(): ImportSourceInfo[] {
  return [
    {
      id: "agent-zip",
      label: "An agent export (.zip)",
      description: "Choose the .zip an agent export made. You see every item before anything changes.",
      available: true,
      note: null,
    },
    {
      id: "hermes",
      label: "Hermes Agent",
      description: "Read the Hermes folder on this computer, or an export from Hermes.",
      available: false,
      note: "Reading a Hermes folder is not supported in this version.",
    },
    {
      id: "other-computer",
      label: "Another COSGRAL computer",
      description: "Use Transfer to move agents and settings together.",
      available: true,
      note: "Use Transfer to move agents and settings together.",
    },
  ];
}

/** The three steps the Transfer page shows above its two buttons. */
export const TRANSFER_STEPS = [
  "Export from the old server",
  "Copy the .zip file",
  "Import into the new server",
] as const;

/** What a transfer never moves (the Transfer page says it under its buttons). */
export const TRANSFER_NOT_MOVED = [
  "API keys",
  "Sign-ins and connector tokens",
  "The Vault",
  "Values of MCP variables and headers",
  "Chat history",
  "Files of the Library",
  "Preferences of the program",
] as const;

export interface InstanceTransferDesktopApi {
  summary: () => Promise<InstanceTransferSummary>;
  /** Opens the save dialog, writes the .zip, answers what was written. The path never reaches the window. */
  exportAgents: (input: ExportInstanceInput) => Promise<ExportInstanceResult>;
  /** Opens the file dialog, STAGES the chosen .zip and answers what is in it (null when the person closed the dialog). Changes nothing. */
  choose: () => Promise<TransferPreview | null>;
  /** Creates the chosen agents as new ones. Never overwrites. */
  apply: (input: ApplyTransferInput) => Promise<ApplyTransferResult>;
  /** Drops a staged file. */
  discard: (input: DiscardTransferInput) => Promise<void>;
  importSources: () => Promise<ImportSourceInfo[]>;
}

// --- program updates: preferences (the check, download and install themselves are `window.openbot.updates`) ---

export const UPDATE_PREFERENCE_LIMITS = { checkEveryHoursMin: 1, checkEveryHoursMax: 168 } as const;

/**
 * Updates are checked by the program on a timer, or only when the person asks. A check asks the update address of the build for
 * a small description of the newest version and sends nothing else about the person or the computer. With `automaticChecks` off the
 * program makes no network request about updates by itself.
 */
export interface UpdatePreferences {
  automaticChecks: boolean;
  /** Download a found update without asking (needs automaticChecks). */
  automaticDownload: boolean;
  /** Install a downloaded update when the program closes. */
  installOnQuit: boolean;
  includePrereleases: boolean;
  checkEveryHours: number;
}

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = {
  automaticChecks: true,
  automaticDownload: false,
  installOnQuit: true,
  includePrereleases: false,
  checkEveryHours: 4,
};

export type SetUpdatePreferencesInput = Partial<UpdatePreferences>;

/** The two tracks of the "Update track" selector. "preview" also receives pre-releases. */
export const UPDATE_TRACKS = [
  { id: "stable", label: "Stable", description: "Stable receives tested releases.", includePrereleases: false },
  {
    id: "preview",
    label: "Preview",
    description: "Preview also receives pre-releases, a little earlier and less tested.",
    includePrereleases: true,
  },
] as const;
export type UpdateTrackId = (typeof UPDATE_TRACKS)[number]["id"];

export function updateTrackOf(preferences: UpdatePreferences): UpdateTrackId {
  return preferences.includePrereleases ? "preview" : "stable";
}

/** The preferences change that picks a track (pass it to `set`). */
export function updateTrackChange(track: UpdateTrackId): SetUpdatePreferencesInput {
  return { includePrereleases: UPDATE_TRACKS.find((entry) => entry.id === track)?.includePrereleases ?? false };
}

/** Something the other program offers on this page that this version does NOT, with its reason. */
export interface UpdatesUnavailableFeature {
  id: "member-updates" | "release-notes";
  label: string;
  reason: string;
}

export const UPDATES_UNAVAILABLE_FEATURES: readonly UpdatesUnavailableFeature[] = [
  {
    id: "member-updates",
    label: "Allow updates from server members",
    reason: "This program has no server members: only you update it.",
  },
  {
    id: "release-notes",
    label: "What's new",
    reason: "This version has no release-notes page. The list of changes is in the repository.",
  },
];

/** The "Restart when idle" button: restart into a downloaded update once no agent is working. */
export interface RestartWhenIdle {
  /** A downloaded update is ready, so the button works. */
  available: boolean;
  /** Why it does not (a plain sentence), or null. */
  reason: string | null;
  /** The program waits for the agents to finish and then restarts. */
  pending: boolean;
}

/** Everything the Updates page draws, in one answer. A change comes as `update-preferences-changed` or an update status event. */
export interface UpdatesOverview {
  preferences: UpdatePreferences;
  track: UpdateTrackId;
  /** The version, the phase (idle, checking, available, downloading, ready, ...) and the message of the button's state. */
  status: UpdateStatus;
  /** False in a build that cannot update (a development copy, another system): then the status says why. */
  canUpdate: boolean;
  restartWhenIdle: RestartWhenIdle;
  unavailable: UpdatesUnavailableFeature[];
}

export function buildUpdatesOverview(input: {
  preferences: UpdatePreferences;
  status: UpdateStatus;
  restartPending: boolean;
}): UpdatesOverview {
  const { preferences, status, restartPending } = input;
  const ready = status.phase === "ready";
  return {
    preferences: { ...preferences },
    track: updateTrackOf(preferences),
    status: { ...status },
    canUpdate: status.phase !== "unsupported",
    restartWhenIdle: {
      available: ready || restartPending,
      reason: ready || restartPending ? null : "No update has been downloaded yet.",
      pending: restartPending,
    },
    unavailable: UPDATES_UNAVAILABLE_FEATURES.map((feature) => ({ ...feature })),
  };
}

export interface UpdatePreferencesDesktopApi {
  /** The whole Updates page: preferences, track, update status, the "Restart when idle" button and what is not offered. */
  getOverview: () => Promise<UpdatesOverview>;
  /** Restarts into the downloaded update as soon as no agent is working (new routine runs wait until then). Needs a downloaded update. */
  restartWhenIdle: () => Promise<UpdatesOverview>;
  /** Stops waiting for the agents. */
  cancelRestartWhenIdle: () => Promise<UpdatesOverview>;
  get: () => Promise<UpdatePreferences>;
  set: (input: SetUpdatePreferencesInput) => Promise<UpdatePreferences>;
}

/** Event `update-preferences-changed`: the whole preferences. */
export interface UpdatePreferencesChanged {
  preferences: UpdatePreferences;
}

// --- guards and parsers ---

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isTransferAgentSummary(value: unknown): value is TransferAgentSummary {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.title) &&
    isString(value.avatarSeed) &&
    isNumber(value.skillCount) &&
    isNumber(value.routineCount) &&
    isNumber(value.memoryCount)
  );
}

export function isInstanceTransferSummary(value: unknown): value is InstanceTransferSummary {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.agents) &&
    value.agents.every(isTransferAgentSummary) &&
    isDynamicRecord(value.capabilities) &&
    isBoolean(value.capabilities.settings) &&
    isBoolean(value.capabilities.files) &&
    isBoolean(value.capabilities.history)
  );
}

export function isExportInstanceResult(value: unknown): value is ExportInstanceResult {
  if (!isDynamicRecord(value)) return false;
  if (value.status === "cancelled") return true;
  return (
    value.status === "saved" &&
    isString(value.fileName) &&
    isNumber(value.bytes) &&
    isNumber(value.agents) &&
    isStringList(value.warnings)
  );
}

function isPreviewAgent(value: unknown): value is TransferPreviewAgent {
  return (
    isDynamicRecord(value) &&
    isString(value.key) &&
    isString(value.name) &&
    isString(value.title) &&
    isStringList(value.skillNames) &&
    isNumber(value.memoryCount) &&
    isStringList(value.routineNames) &&
    isBoolean(value.nameTaken)
  );
}

export function isTransferPreview(value: unknown): value is TransferPreview {
  return (
    isDynamicRecord(value) &&
    isString(value.token) &&
    isOneOf(TRANSFER_SOURCES, value.source) &&
    isString(value.sourceApp) &&
    (value.exportedAt === null || isString(value.exportedAt)) &&
    Array.isArray(value.agents) &&
    value.agents.every(isPreviewAgent) &&
    isBoolean(value.hasSettings) &&
    isStringList(value.warnings)
  );
}

export function isApplyTransferResult(value: unknown): value is ApplyTransferResult {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.agents) &&
    value.agents.every(
      (agent) => isDynamicRecord(agent) && isString(agent.key) && isString(agent.id) && isString(agent.name),
    ) &&
    Array.isArray(value.skipped) &&
    value.skipped.every(
      (entry) => isDynamicRecord(entry) && isString(entry.key) && isOneOf(TRANSFER_SKIP_REASONS, entry.reason),
    ) &&
    isStringList(value.warnings) &&
    isBoolean(value.settingsApplied)
  );
}

export function isImportSourceInfo(value: unknown): value is ImportSourceInfo {
  return (
    isDynamicRecord(value) &&
    isOneOf(IMPORT_SOURCE_IDS, value.id) &&
    isString(value.label) &&
    isString(value.description) &&
    isBoolean(value.available) &&
    (value.note === null || isString(value.note))
  );
}

export function isUpdatesOverview(value: unknown): value is UpdatesOverview {
  return (
    isDynamicRecord(value) &&
    isUpdatePreferences(value.preferences) &&
    isOneOf(["stable", "preview"], value.track) &&
    isDynamicRecord(value.status) &&
    isString(value.status.phase) &&
    isString(value.status.currentVersion) &&
    isBoolean(value.canUpdate) &&
    isDynamicRecord(value.restartWhenIdle) &&
    isBoolean(value.restartWhenIdle.available) &&
    isBoolean(value.restartWhenIdle.pending) &&
    (value.restartWhenIdle.reason === null || isString(value.restartWhenIdle.reason)) &&
    Array.isArray(value.unavailable) &&
    value.unavailable.every(
      (item) => isDynamicRecord(item) && isString(item.id) && isString(item.label) && isString(item.reason),
    )
  );
}

export function isUpdatePreferences(value: unknown): value is UpdatePreferences {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.automaticChecks) &&
    isBoolean(value.automaticDownload) &&
    isBoolean(value.installOnQuit) &&
    isBoolean(value.includePrereleases) &&
    isNumber(value.checkEveryHours) &&
    value.checkEveryHours >= UPDATE_PREFERENCE_LIMITS.checkEveryHoursMin &&
    value.checkEveryHours <= UPDATE_PREFERENCE_LIMITS.checkEveryHoursMax
  );
}

export function isUpdatePreferencesChanged(
  value: unknown,
): value is UpdatePreferencesChanged & { type: "update-preferences-changed" } {
  return (
    isDynamicRecord(value) && value.type === "update-preferences-changed" && isUpdatePreferences(value.preferences)
  );
}

function parseIdList(value: unknown, what: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`The ${what} list is not valid.`);
  const ids: string[] = [];
  for (const item of value) {
    if (!isString(item) || item.length === 0 || item.length > 200) throw new Error(`The ${what} list is not valid.`);
    if (!ids.includes(item)) ids.push(item);
  }
  return ids;
}

export function parseExportInstanceInput(input: unknown): ExportInstanceInput {
  if (!isDynamicRecord(input)) throw new Error("The export request is malformed.");
  const agentIds = parseIdList(input.agentIds, "agent", INSTANCE_TRANSFER_LIMITS.agents);
  if (!isBoolean(input.includeSettings)) throw new Error("The export request is malformed.");
  if (agentIds.length === 0 && !input.includeSettings) throw new Error("Choose at least one agent or the settings.");
  return { agentIds, includeSettings: input.includeSettings };
}

export function parseApplyTransferInput(input: unknown): ApplyTransferInput {
  if (!isDynamicRecord(input)) throw new Error("The import request is malformed.");
  if (!isString(input.token) || input.token.length === 0 || input.token.length > 200)
    throw new Error("Choose a file first.");
  const keys = parseIdList(input.keys, "agent", INSTANCE_TRANSFER_LIMITS.agents);
  if (!isBoolean(input.includeSettings)) throw new Error("The import request is malformed.");
  if (keys.length === 0 && !input.includeSettings) throw new Error("Choose at least one agent or the settings.");
  return { token: input.token, keys, includeSettings: input.includeSettings };
}

export function parseDiscardTransferInput(input: unknown): DiscardTransferInput {
  if (!isDynamicRecord(input) || !isString(input.token) || input.token.length === 0 || input.token.length > 200) {
    throw new Error("Choose a file first.");
  }
  return { token: input.token };
}

export function parseSetUpdatePreferencesInput(input: unknown): SetUpdatePreferencesInput {
  if (!isDynamicRecord(input)) throw new Error("The update request is malformed.");
  const out: SetUpdatePreferencesInput = {};
  for (const key of ["automaticChecks", "automaticDownload", "installOnQuit", "includePrereleases"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (!isBoolean(value)) throw new Error("A switch is true or false.");
    out[key] = value;
  }
  if (input.checkEveryHours !== undefined) {
    const hours = input.checkEveryHours;
    if (
      !isNumber(hours) ||
      !Number.isInteger(hours) ||
      hours < UPDATE_PREFERENCE_LIMITS.checkEveryHoursMin ||
      hours > UPDATE_PREFERENCE_LIMITS.checkEveryHoursMax
    ) {
      throw new Error(
        `Check every ${UPDATE_PREFERENCE_LIMITS.checkEveryHoursMin} to ${UPDATE_PREFERENCE_LIMITS.checkEveryHoursMax} hours.`,
      );
    }
    out.checkEveryHours = hours;
  }
  return out;
}

/** The preferences after a change; "download by itself" needs the checks. */
export function mergeUpdatePreferences(
  current: UpdatePreferences,
  change: SetUpdatePreferencesInput,
): UpdatePreferences {
  const next = { ...current, ...change };
  return next.automaticChecks ? next : { ...next, automaticDownload: false };
}
