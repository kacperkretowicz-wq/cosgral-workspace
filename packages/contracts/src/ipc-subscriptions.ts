// COSGRAL W5-BE1: managed agent CLIs (Codex, Claude Code). The program downloads the official CLI when none is found,
// checks it (SHA-256 from the official manifest), keeps one folder per version and updates it automatically unless the
// person switched that off or pinned a version. A custom path always wins over the downloaded CLI, which wins over a
// CLI on PATH. Only downloaded CLIs are ever removed. This computer only (not the phone, not a remote server).
// The first download of a CLI asks on a confirm card in Needs you; updates after that run without a card.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const MANAGED_CLI_IDS = ["codex", "claude"] as const;
export type ManagedCliId = (typeof MANAGED_CLI_IDS)[number];

/** Where the CLI in use comes from: the person's own path, downloaded by COSGRAL, found on the system, or none. */
export const MANAGED_CLI_SOURCES = ["custom", "managed", "system", "none"] as const;
export type ManagedCliSource = (typeof MANAGED_CLI_SOURCES)[number];

export const MANAGED_CLI_PHASES = [
  "idle",
  "checking",
  "awaiting-approval",
  "downloading",
  "verifying",
  "installing",
  "removing",
  "error",
] as const;
export type ManagedCliPhase = (typeof MANAGED_CLI_PHASES)[number];

export const MANAGED_CLI_LIMITS = {
  customPath: 1024,
  version: 64,
} as const;

export interface ManagedCliProgress {
  receivedBytes: number;
  /** 0 when the server did not say. */
  totalBytes: number;
}

export interface ManagedCliState {
  id: ManagedCliId;
  source: ManagedCliSource;
  /** The executable in use (custom, managed or system); null when there is none. */
  executable: string | null;
  /** Version of the CLI in use. */
  version: string | null;
  /** The downloaded (managed) version, also when a custom or system CLI is in use. */
  managedVersion: string | null;
  /** Pinned version for downloads and updates; null = the newest from the official source. */
  pinnedVersion: string | null;
  /** Newest version seen at the official source; null until checked. */
  latestVersion: string | null;
  /** Update the downloaded CLI without asking (default true, owner decision 16.11). Ignored while pinned. */
  autoUpdate: boolean;
  /** The person's own executable; when set it is used instead of the downloaded or system CLI. */
  customPath: string | null;
  phase: ManagedCliPhase;
  progress: ManagedCliProgress | null;
  /** Readable reason of the last failure; null when fine. */
  error: string | null;
  /** When the official source was last checked (ISO time); null when never. */
  checkedAt: string | null;
}

export interface ManagedCliIdInput {
  id: ManagedCliId;
}

export interface InstallManagedCliInput {
  id: ManagedCliId;
  /** A specific version; omitted = pinned version, else the newest. */
  version?: string;
}

export interface PinManagedCliInput {
  id: ManagedCliId;
  /** null unpins (follow the newest version). */
  version: string | null;
}

export interface ManagedCliSettingsInput {
  id: ManagedCliId;
  autoUpdate?: boolean;
  /** A path to the person's own CLI; null clears it (back to downloaded or system). */
  customPath?: string | null;
}

/** COSGRAL W5: subscriptions API. Optional in the window until every mock has it. */
export interface SubscriptionsDesktopApi {
  listCli: () => Promise<ManagedCliState[]>;
  /** Ask the official source for the newest version (no download). */
  checkCli: (input: ManagedCliIdInput) => Promise<ManagedCliState>;
  /** Download, verify and install; the first download of a CLI asks on a confirm card first. */
  installCli: (input: InstallManagedCliInput) => Promise<ManagedCliState>;
  /** Install the newest (or pinned) version now. */
  updateCli: (input: ManagedCliIdInput) => Promise<ManagedCliState>;
  /** Remove the downloaded CLI only; a custom or system CLI is never touched. */
  removeCli: (input: ManagedCliIdInput) => Promise<ManagedCliState>;
  pinCli: (input: PinManagedCliInput) => Promise<ManagedCliState>;
  setCliSettings: (input: ManagedCliSettingsInput) => Promise<ManagedCliState>;
}

export function isManagedCliId(value: unknown): value is ManagedCliId {
  return isOneOf(MANAGED_CLI_IDS, value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isProgress(value: unknown): value is ManagedCliProgress {
  return isDynamicRecord(value) && isNumber(value.receivedBytes) && isNumber(value.totalBytes);
}

export function isManagedCliState(value: unknown): value is ManagedCliState {
  return (
    isDynamicRecord(value) &&
    isManagedCliId(value.id) &&
    isOneOf(MANAGED_CLI_SOURCES, value.source) &&
    isNullableString(value.executable) &&
    isNullableString(value.version) &&
    isNullableString(value.managedVersion) &&
    isNullableString(value.pinnedVersion) &&
    isNullableString(value.latestVersion) &&
    isBoolean(value.autoUpdate) &&
    isNullableString(value.customPath) &&
    isOneOf(MANAGED_CLI_PHASES, value.phase) &&
    (value.progress === null || isProgress(value.progress)) &&
    isNullableString(value.error) &&
    isNullableString(value.checkedAt)
  );
}

export function isManagedCliStateList(value: unknown): value is ManagedCliState[] {
  return Array.isArray(value) && value.every(isManagedCliState);
}

function parseVersion(value: unknown): string {
  if (!isString(value) || !/^[0-9A-Za-z.+-]{1,64}$/.test(value)) throw new Error("The version is not valid.");
  return value;
}

function parseId(value: unknown): ManagedCliId {
  if (!isDynamicRecord(value) || !isManagedCliId(value.id)) throw new Error("Choose Codex or Claude.");
  return value.id;
}

export function parseManagedCliIdInput(value: unknown): ManagedCliIdInput {
  return { id: parseId(value) };
}

export function parseInstallManagedCliInput(value: unknown): InstallManagedCliInput {
  const id = parseId(value);
  const record = isDynamicRecord(value) ? value : {};
  return record.version === undefined ? { id } : { id, version: parseVersion(record.version) };
}

export function parsePinManagedCliInput(value: unknown): PinManagedCliInput {
  const id = parseId(value);
  const record = isDynamicRecord(value) ? value : {};
  return { id, version: record.version === null ? null : parseVersion(record.version) };
}

export function parseManagedCliSettingsInput(value: unknown): ManagedCliSettingsInput {
  const id = parseId(value);
  const record = isDynamicRecord(value) ? value : {};
  const input: ManagedCliSettingsInput = { id };
  if (record.autoUpdate !== undefined) {
    if (!isBoolean(record.autoUpdate)) throw new Error("autoUpdate must be true or false.");
    input.autoUpdate = record.autoUpdate;
  }
  if (record.customPath !== undefined) {
    if (record.customPath === null) input.customPath = null;
    else if (
      isString(record.customPath) &&
      record.customPath.trim().length > 0 &&
      record.customPath.length <= MANAGED_CLI_LIMITS.customPath
    )
      input.customPath = record.customPath.trim();
    else throw new Error("The CLI path is not valid.");
  }
  return input;
}
