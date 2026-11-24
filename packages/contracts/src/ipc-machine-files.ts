// COSGRAL W12 (BE-AE, parity row 45): "machine files" of the library.
//
// The library keeps the files the person and agents saved. "Machine files" lets the person (and, only if the person
// says so, chosen agents) look into ONE folder of this computer and copy files from it into the library. Nothing is
// read without a grant: the person picks a folder, the program remembers the grant until it is revoked or the
// program restarts. A path that leaves the folder (`..`, absolute paths, links that point elsewhere) is refused,
// secret-looking files (`.env`, private keys, password stores) are never listed or read, and every limit is in
// MACHINE_FILES_LIMITS. A file is only COPIED into the library (LibraryStore.addFiles); it is never moved or changed.

import { LIBRARY_LIMITS } from "./ipc-library";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const MACHINE_FILES_LIMITS = {
  /** Folders the person may grant at the same time. */
  grants: 10,
  /** Entries returned for one folder; a longer folder is cut and marked `truncated`. */
  entriesPerListing: 500,
  /** Length of a path inside the granted folder. */
  relativePath: 1_024,
  /** Nesting inside the granted folder. */
  depth: 16,
  /** One file: the same as a library file. */
  fileBytes: LIBRARY_LIMITS.fileBytes,
  label: 80,
} as const;

/** Why a request was refused; the UI shows a sentence for each, an agent gets the code. */
export const MACHINE_FILE_REFUSALS = [
  "not-granted",
  "bot-not-allowed",
  "outside-folder",
  "blocked-name",
  "not-found",
  "not-a-folder",
  "not-a-file",
  "too-large",
] as const;
export type MachineFileRefusal = (typeof MACHINE_FILE_REFUSALS)[number];

/** The folder the person allowed. `botIds` empty: only the person looks into it; otherwise these agents may too. */
export interface MachineFolderGrant {
  id: string;
  label: string;
  /** Real path of the folder (shown to the person). */
  root: string;
  botIds: string[];
  grantedAt: string;
}

export interface GrantMachineFolderOptions {
  label?: string;
  botIds?: string[];
}

export interface MachineFileEntry {
  name: string;
  /** Path inside the granted folder, always with "/" as the separator. */
  relativePath: string;
  kind: "file" | "folder";
  /** 0 for a folder. */
  size: number;
  modifiedAt: string;
}

export interface ListMachineFolderInput {
  grantId: string;
  /** Folder inside the granted one; empty means the granted folder itself. */
  relativePath?: string;
  /** The agent that asks, or null for the person. Set by the program, never by the caller's text. */
  actor: string | null;
}

export interface ResolveMachineFileInput {
  grantId: string;
  relativePath: string;
  actor: string | null;
}

export type MachineListing =
  | { status: "ok"; entries: MachineFileEntry[]; truncated: boolean }
  | { status: "refused"; reason: MachineFileRefusal };

export type MachineFileResolution =
  | { status: "ok"; path: string; name: string; size: number; root: string }
  | { status: "refused"; reason: MachineFileRefusal };

const SECRET_EXACT = new Set([
  ".netrc",
  ".npmrc",
  ".pypirc",
  ".git-credentials",
  ".htpasswd",
  "credentials",
  "credentials.json",
  "secrets.json",
  "login data",
  "cookies",
  "web data",
  "ntuser.dat",
]);
const SECRET_PREFIXES = [".env", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"];
const SECRET_SUFFIXES = [".pem", ".key", ".pfx", ".p12", ".kdbx", ".ppk", ".keystore", ".jks"];

/** True for names that look like a secret (keys, tokens, password stores). Such files are never listed or read. */
export function isBlockedMachineName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    SECRET_EXACT.has(lower) ||
    SECRET_PREFIXES.some((prefix) => lower.startsWith(prefix)) ||
    SECRET_SUFFIXES.some((suffix) => lower.endsWith(suffix))
  );
}

export function isMachineFileRefusal(value: unknown): value is MachineFileRefusal {
  return isOneOf(MACHINE_FILE_REFUSALS, value);
}

export function isMachineFolderGrant(value: unknown): value is MachineFolderGrant {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isString(value.root) &&
    Array.isArray(value.botIds) &&
    value.botIds.every(isString) &&
    isString(value.grantedAt)
  );
}

export function isMachineFileEntry(value: unknown): value is MachineFileEntry {
  return (
    isDynamicRecord(value) &&
    isString(value.name) &&
    isString(value.relativePath) &&
    isOneOf(["file", "folder"], value.kind) &&
    isNumber(value.size) &&
    isString(value.modifiedAt)
  );
}

export function isMachineListing(value: unknown): value is MachineListing {
  if (!isDynamicRecord(value)) return false;
  if (value.status === "refused") return isMachineFileRefusal(value.reason);
  return (
    value.status === "ok" &&
    Array.isArray(value.entries) &&
    value.entries.every(isMachineFileEntry) &&
    isBoolean(value.truncated)
  );
}

// The person's window on granted folders (Library › Files › "This computer"). The program adds `actor: null` itself:
// the window never says who asks, so an agent can never use these calls.

export interface MachineGrantIdInput {
  grantId: string;
}

export interface MachineFolderPathInput {
  grantId: string;
  /** Empty: the granted folder itself. */
  relativePath?: string;
}

export interface OpenMachineFileInput {
  grantId: string;
  relativePath: string;
  /** "open" with the system app; "reveal" in its folder. */
  action: "open" | "reveal";
}

export interface CopyMachineFilesInput {
  grantId: string;
  relativePaths: string[];
}

/** How many files went into the library, and which were refused (with the reason). */
export interface CopyMachineFilesResult {
  added: number;
  refused: Array<{ relativePath: string; reason: MachineFileRefusal }>;
}

/** Files copied into the library in one call. */
export const MACHINE_FILES_COPY_LIMIT = 50;

/** `window.openbot.machineFiles` (this computer only). */
export interface MachineFilesDesktopApi {
  grants: () => Promise<MachineFolderGrant[]>;
  /** Opens the system folder picker; null when the person cancels. Throws a sentence when the folder is not allowed. */
  grant: () => Promise<MachineFolderGrant | null>;
  /** Stops sharing the folder; nothing on disk changes. */
  revoke: (input: MachineGrantIdInput) => Promise<void>;
  list: (input: MachineFolderPathInput) => Promise<MachineListing>;
  open: (input: OpenMachineFileInput) => Promise<void>;
  copyToLibrary: (input: CopyMachineFilesInput) => Promise<CopyMachineFilesResult>;
}

function grantId(value: unknown): string {
  if (!isString(value) || value.length === 0 || value.length > 100) throw new Error("A shared folder is required.");
  return value;
}

function relativePathText(value: unknown): string {
  if (value === undefined) return "";
  if (!isString(value) || value.length > MACHINE_FILES_LIMITS.relativePath) throw new Error("The path is too long.");
  return value;
}

export function parseMachineGrantId(raw: unknown): MachineGrantIdInput {
  if (!isDynamicRecord(raw)) throw new Error("A shared folder is required.");
  return { grantId: grantId(raw.grantId) };
}

export function parseMachineFolderPath(raw: unknown): Required<MachineFolderPathInput> {
  if (!isDynamicRecord(raw)) throw new Error("A shared folder is required.");
  return { grantId: grantId(raw.grantId), relativePath: relativePathText(raw.relativePath) };
}

export function parseOpenMachineFile(raw: unknown): OpenMachineFileInput {
  if (!isDynamicRecord(raw)) throw new Error("A file is required.");
  if (raw.action !== "open" && raw.action !== "reveal") throw new Error("Unknown action.");
  return { grantId: grantId(raw.grantId), relativePath: relativePathText(raw.relativePath), action: raw.action };
}

export function parseCopyMachineFiles(raw: unknown): CopyMachineFilesInput {
  if (!isDynamicRecord(raw) || !Array.isArray(raw.relativePaths) || raw.relativePaths.length === 0) {
    throw new Error("Pick at least one file.");
  }
  if (raw.relativePaths.length > MACHINE_FILES_COPY_LIMIT) {
    throw new Error(`Copy at most ${MACHINE_FILES_COPY_LIMIT} files at once.`);
  }
  return { grantId: grantId(raw.grantId), relativePaths: raw.relativePaths.map(relativePathText) };
}

export function isCopyMachineFilesResult(value: unknown): value is CopyMachineFilesResult {
  return (
    isDynamicRecord(value) &&
    isNumber(value.added) &&
    Array.isArray(value.refused) &&
    value.refused.every(
      (item) => isDynamicRecord(item) && isString(item.relativePath) && isMachineFileRefusal(item.reason),
    )
  );
}
