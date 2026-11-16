// COSGRAL W8-BE1: access levels of an agent (spec-w8.md 1A, W8-01…08; decisions Q2, Q3, Q4, Q9 and 1G).
//
// Three levels, least access first:
// - "working-folder" (the default for every agent, also one made from a template or imported, Q9): the agent works only in its
//   working folder, the folders the person added, and the shared folder of the program. A write outside them is REFUSED, with a
//   readable reason (no card, no silent success).
// - "ask-first": the same folders, but anything outside them waits for the person in a card of "Needs you" (Allow / Always /
//   Deny, as the approvals of today). Deny stops it.
// - "full": wide access to the disk. It is reached ONLY through a card (a raise is never done by a call alone), and it never
//   includes Computer Use or the camera (Q4: they keep their own consents).
// Excluded folders are forbidden at EVERY level, also "full" (Q3), and no "Always allow" rule can open them. Lowering a level is
// immediate; raising it is a card. A level, its folders and its rules are kept on disk and come back after a restart.
//
// What the program can enforce today: the program tells each agent's CLI how far it may go (sandbox and folders), refuses or
// asks for every request the CLI makes to go further, and refuses its own tools outside the folders. It does NOT isolate the
// processes of the agent from the operating system: an agent at "full" runs with the rights of the Windows user, so an
// excluded folder is refused where the program is asked, not walled off (that wall is W8-BE2).
//
// This computer only.

import { isBoolean, isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const ACCESS_LEVELS = ["working-folder", "ask-first", "full"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Every new agent starts here (W8-01); so does an agent made from a template (Q9). */
export const DEFAULT_ACCESS_LEVEL: AccessLevel = "working-folder";

export const ACCESS_LIMITS = {
  /** Folders in each of the two lists of one agent. */
  folders: 20,
  /** Characters of one folder path. */
  path: 520,
} as const;

export interface AgentAccess {
  botId: string;
  level: AccessLevel;
  /** Folders the agent may work in besides its own (W8-05). */
  additionalFolders: string[];
  /** Folders the agent may never touch, at any level (Q3). */
  excludedFolders: string[];
  /** When the level was last RAISED through a card, else null (it shows in the settings: W8-04). */
  raisedAt: string | null;
  /** When anything here last changed, else null (never changed: the defaults). */
  updatedAt: string | null;
}

export interface AccessAgentInput {
  botId: string;
}

/** Replaces the lists (a list left out stays as it is). Absolute folders only; see `accessFolderProblem`. */
export interface SetAccessFoldersInput {
  botId: string;
  additionalFolders?: string[];
  excludedFolders?: string[];
}

export interface SetAccessLevelInput {
  botId: string;
  level: AccessLevel;
}

export interface SetAccessLevelResult {
  /** The access as it is now: after a raise it is still the OLD level until the card is allowed. */
  access: AgentAccess;
  /** True when a card was opened for the person (a raise): follow `access-changed`. */
  raiseRequested: boolean;
}

/** `window.openbot.access` (this computer only). Changes come as the event `access-changed`. */
export interface AccessDesktopApi {
  get: (input: AccessAgentInput) => Promise<AgentAccess>;
  /** The access of every agent. */
  list: () => Promise<AgentAccess[]>;
  setFolders: (input: SetAccessFoldersInput) => Promise<AgentAccess>;
  /** Lowering is done at once. Raising opens a confirm card in "Needs you" and changes nothing until it is allowed. */
  setLevel: (input: SetAccessLevelInput) => Promise<SetAccessLevelResult>;
}

/** Event `access-changed`: replace the access of this agent. */
export interface AccessChanged {
  access: AgentAccess;
}

export const ACCESS_DENIAL_REASONS = ["excluded", "outside-folder"] as const;
export type AccessDenialReason = (typeof ACCESS_DENIAL_REASONS)[number];

/**
 * Event `access-denied`: the program refused something an agent asked for (the agent is told too). Show it, so that a refusal
 * is never a silent success or a silent failure (W8-02).
 */
export interface AccessDenied {
  botId: string;
  /** The thread of the agent, else null. */
  threadId: string | null;
  kind: "file-change" | "command" | "permissions" | "tool";
  reason: AccessDenialReason;
  /** The folder or file that was refused, else null (a command that names no path). */
  path: string | null;
  /** A readable sentence for the window. */
  message: string;
}

// --- rules shared by the engine, the mock and the window ---

const RANK: Record<AccessLevel, number> = { "working-folder": 0, "ask-first": 1, full: 2 };

export function accessRank(level: AccessLevel): number {
  return RANK[level];
}

/** Whether going from one level to another widens what the agent may do (it needs a card). */
export function accessIsRaise(from: AccessLevel, to: AccessLevel): boolean {
  return RANK[to] > RANK[from];
}

export const ACCESS_LEVEL_INFO: Record<AccessLevel, { name: string; summary: string }> = {
  "working-folder": {
    name: "Working folder only",
    summary: "The agent works only in its folder and the folders you add. A write anywhere else is refused.",
  },
  "ask-first": {
    name: "Ask first",
    summary: "The agent asks you before it goes outside those folders: a card waits in Needs you.",
  },
  full: {
    name: "Full access",
    summary:
      "The agent may work anywhere on this computer except the folders you excluded. It does not include Computer Use or the camera: they ask separately.",
  },
};

export function defaultAgentAccess(botId: string): AgentAccess {
  return {
    botId,
    level: DEFAULT_ACCESS_LEVEL,
    additionalFolders: [],
    excludedFolders: [],
    raisedAt: null,
    updatedAt: null,
  };
}

/** The text of the confirm card that a raise opens (the person must read what the new level means). */
export function accessRaiseCard(input: { agentName: string; from: AccessLevel; to: AccessLevel }): {
  title: string;
  preview: string;
} {
  const target = ACCESS_LEVEL_INFO[input.to];
  const lines = [
    `${input.agentName}: ${ACCESS_LEVEL_INFO[input.from].name} → ${target.name}.`,
    target.summary,
    "Folders you excluded stay forbidden.",
    "Allow to change the level. Cancel keeps it as it is.",
  ];
  return { title: `Give ${input.agentName} more access?`, preview: lines.join("\n") };
}

// --- paths: the same rule in the engine and in the window ---

const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;
const WINDOWS_UNC = /^\\\\[^\\/]+[\\/][^\\/]+/;

/**
 * A folder or file path made comparable: absolute only, `/` and `\` read alike, `.` and `..` resolved, no trailing separator,
 * and lower case for Windows paths (a drive letter or a share). Null when it is not an absolute path, or when `..` climbs
 * above the root.
 */
export function normalizeAccessPath(path: string): string | null {
  const value = path.trim();
  if (!value || value.length > ACCESS_LIMITS.path * 4 || value.includes("\0")) return null;
  const windows = WINDOWS_DRIVE.test(value) || WINDOWS_UNC.test(value);
  if (!windows && !value.startsWith("/")) return null;
  const unc = WINDOWS_UNC.test(value);
  const parts = value.replace(/\\/g, "/").split("/");
  const prefix = windows ? (unc ? "//" : `${(parts[0] ?? "").toLowerCase()}/`) : "/";
  const body = unc ? parts.slice(2) : parts.slice(windows ? 1 : 0);
  const kept: string[] = [];
  for (const part of body) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (kept.length === 0) return null;
      kept.pop();
      continue;
    }
    kept.push(windows ? part.toLowerCase() : part);
  }
  return kept.length === 0 ? prefix : `${prefix}${kept.join("/")}`;
}

/** True when `path` is `folder` or inside it. Both must be absolute; anything else is never inside. */
export function pathIsInside(folder: string, path: string): boolean {
  const base = normalizeAccessPath(folder);
  const target = normalizeAccessPath(path);
  if (!base || !target) return false;
  const root = base.endsWith("/") ? base : `${base}/`;
  return target === base || target.startsWith(root);
}

/** Null when `folder` can be put in a list: an absolute folder that is not a whole drive or share. */
export function accessFolderProblem(folder: string) {
  const value = folder.trim();
  if (!value) return "Choose a folder.";
  if (value.length > ACCESS_LIMITS.path) return "That folder path is too long.";
  const normal = normalizeAccessPath(value);
  if (!normal) return "Use the full path of a folder.";
  if (normal === "/" || /^[a-z]:\/$/.test(normal) || normal === "//") {
    return "A whole drive cannot be added. Choose a folder.";
  }
  if (WINDOWS_UNC.test(value) && normal.split("/").filter(Boolean).length < 3) {
    return "A whole network share cannot be added. Choose a folder in it.";
  }
  return null;
}

export interface AccessPolicy {
  level: AccessLevel;
  /** The agent's own working folder. */
  workspace: string;
  additionalFolders: readonly string[];
  /** Folders that are the agent's too, without the person adding them (the shared folder of the program). */
  implicitFolders?: readonly string[];
  excludedFolders: readonly string[];
}

export type AccessOperation = "read" | "write";

export type AccessDecision =
  | { verdict: "allow" }
  | { verdict: "ask" }
  | { verdict: "deny"; reason: AccessDenialReason; message: string };

/**
 * What a level allows for one path (W8-02, W8-03, W8-05, Q3). The order matters:
 * 1. an excluded folder is refused at every level and for reads too; no rule opens it;
 * 2. the working folder, the added folders and the implicit ones are the agent's: allowed;
 * 3. elsewhere: "full" allows; "ask-first" asks; "working-folder" refuses a WRITE (a read follows the sandbox of the CLI, which
 *    reads widely; the program cannot narrow it without the isolation of W8-BE2).
 * A path that is not absolute is not understood and is never allowed by guessing: it asks at "ask-first" and "full" is not
 * trusted either, so it asks there too, and it is refused at "working-folder".
 */
export function accessDecision(policy: AccessPolicy, operation: AccessOperation, path: string): AccessDecision {
  if (!normalizeAccessPath(path)) {
    if (policy.level === "working-folder" && operation === "write") {
      return {
        verdict: "deny",
        reason: "outside-folder",
        message: "This path is not a full path, so it cannot be checked. Use a full path inside the working folder.",
      };
    }
    return policy.level === "working-folder" ? { verdict: "allow" } : { verdict: "ask" };
  }
  if (policy.excludedFolders.some((folder) => pathIsInside(folder, path))) {
    return {
      verdict: "deny",
      reason: "excluded",
      message: "This folder is excluded for this agent. It cannot be used at any access level.",
    };
  }
  const own = [policy.workspace, ...policy.additionalFolders, ...(policy.implicitFolders ?? [])];
  if (own.some((folder) => pathIsInside(folder, path))) return { verdict: "allow" };
  if (policy.level === "full") return { verdict: "allow" };
  if (policy.level === "ask-first") return { verdict: "ask" };
  if (operation === "read") return { verdict: "allow" };
  return {
    verdict: "deny",
    reason: "outside-folder",
    message:
      "This agent may only work in its working folder. Give it more access, or add this folder, in its settings.",
  };
}

// --- guards and parsers ---

export function isAgentAccess(value: unknown): value is AgentAccess {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isOneOf(ACCESS_LEVELS, value.level) &&
    Array.isArray(value.additionalFolders) &&
    value.additionalFolders.every(isString) &&
    Array.isArray(value.excludedFolders) &&
    value.excludedFolders.every(isString) &&
    (value.raisedAt === null || isString(value.raisedAt)) &&
    (value.updatedAt === null || isString(value.updatedAt))
  );
}

export function isAgentAccessList(value: unknown): value is AgentAccess[] {
  return Array.isArray(value) && value.every(isAgentAccess);
}

export function isSetAccessLevelResult(value: unknown): value is SetAccessLevelResult {
  return isDynamicRecord(value) && isAgentAccess(value.access) && isBoolean(value.raiseRequested);
}

export function isAccessChanged(value: unknown): value is AccessChanged & { type: "access-changed" } {
  return isDynamicRecord(value) && value.type === "access-changed" && isAgentAccess(value.access);
}

export function isAccessDenied(value: unknown): value is AccessDenied & { type: "access-denied" } {
  return (
    isDynamicRecord(value) &&
    value.type === "access-denied" &&
    isString(value.botId) &&
    (value.threadId === null || isString(value.threadId)) &&
    isOneOf(["file-change", "command", "permissions", "tool"] as const, value.kind) &&
    isOneOf(ACCESS_DENIAL_REASONS, value.reason) &&
    (value.path === null || isString(value.path)) &&
    isString(value.message)
  );
}

function botIdOf(value: unknown): string {
  if (!isString(value) || value.length === 0 || value.length > 200) throw new Error("Choose an agent.");
  return value;
}

export function parseAccessAgentInput(value: unknown): AccessAgentInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  return { botId: botIdOf(value.botId) };
}

function folderList(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${what} must be a list of folders.`);
  if (value.length > ACCESS_LIMITS.folders) throw new Error(`At most ${ACCESS_LIMITS.folders} folders in ${what}.`);
  const result: string[] = [];
  for (const item of value) {
    if (!isString(item)) throw new Error(`${what} must be a list of folders.`);
    const problem = accessFolderProblem(item);
    if (problem) throw new Error(problem);
    const folder = item.trim();
    const normal = normalizeAccessPath(folder);
    if (!result.some((known) => normalizeAccessPath(known) === normal)) result.push(folder);
  }
  return result;
}

export function parseSetAccessFoldersInput(value: unknown): SetAccessFoldersInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  const input: SetAccessFoldersInput = { botId: botIdOf(value.botId) };
  if (value.additionalFolders !== undefined)
    input.additionalFolders = folderList(value.additionalFolders, "The added folders");
  if (value.excludedFolders !== undefined)
    input.excludedFolders = folderList(value.excludedFolders, "The excluded folders");
  if (input.additionalFolders === undefined && input.excludedFolders === undefined) {
    throw new Error("Give the added folders, the excluded folders, or both.");
  }
  return input;
}

export function parseSetAccessLevelInput(value: unknown): SetAccessLevelInput {
  if (!isDynamicRecord(value)) throw new Error("Expected an object.");
  if (!isOneOf(ACCESS_LEVELS, value.level)) throw new Error(`The level is one of: ${ACCESS_LEVELS.join(", ")}.`);
  return { botId: botIdOf(value.botId), level: value.level };
}
