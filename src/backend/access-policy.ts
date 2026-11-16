// COSGRAL W8-BE1: the access levels on the engine side (spec-w8.md 1A, W8-01…08; Q2, Q3, Q4). Pure rules, no state:
// 1. what the CLI is told for a level (sandbox, approval policy, folders);
// 2. what a request of the CLI to go further means for the level (refuse, ask, or let the usual card and rules decide);
// 3. the same for the tools of the program that take a path, and for the tools of Claude Code.
// The contract has the rule for one path (`accessDecision`); this file finds the paths.
//
// What this cannot do: the text of a shell command is read for full paths only. `cd ..` or a variable can hide a path, so
// at "working-folder" and "ask-first" the real wall is the CLI's own sandbox (it asks, and the program refuses or asks).
// At "full" the CLI asks for nothing, so an excluded folder is refused only where the program is asked (its own tools, and
// Claude Code's tools). A wall around the whole process is W8-BE2.

import { posix, win32 } from "node:path";
import {
  type AccessDecision,
  type AccessOperation,
  type AccessPolicy,
  type AgentAccess,
  type AgentApproval,
  accessDecision,
  normalizeAccessPath,
  pathIsInside,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";

export interface AgentFolders {
  /** The agent's own working folder. */
  workspace: string;
  /** The shared folder of the program: the agent's too, without anybody adding it. */
  shared: string;
}

/** The `sandboxPolicy` of `turn/start`. */
export type SandboxPolicy =
  | { type: "dangerFullAccess" }
  | { type: "workspaceWrite"; writableRoots: string[]; networkAccess: boolean };

/** What the CLI is told when a thread starts, resumes or starts a turn. */
export interface CliAccess {
  approvalPolicy: "on-request";
  sandbox: "workspace-write" | "danger-full-access";
  sandboxPolicy: SandboxPolicy;
  runtimeWorkspaceRoots: string[];
}

function sameFolder(a: string, b: string): boolean {
  const left = normalizeAccessPath(a);
  return left !== null && left === normalizeAccessPath(b);
}

/** The policy for the contract's rule: the level, the folders of the agent and the folders it may never touch. */
export function accessPolicyOf(access: AgentAccess, folders: AgentFolders): AccessPolicy {
  return {
    level: access.level,
    workspace: folders.workspace,
    additionalFolders: access.additionalFolders,
    implicitFolders: [folders.shared],
    excludedFolders: access.excludedFolders,
  };
}

/**
 * The CLI at the three levels. "working-folder" and "ask-first" give the CLI a sandbox that writes only in the working
 * folder, the added folders and the shared folder, so anything else comes back as a request that the program refuses or
 * asks about. "full" is the wide sandbox, as before; it is reached only through a card (the contract). Excluded folders are
 * never roots.
 */
export function cliAccess(access: AgentAccess, folders: AgentFolders): CliAccess {
  const roots: string[] = [];
  for (const folder of [folders.workspace, ...access.additionalFolders, folders.shared]) {
    if (access.excludedFolders.some((excluded) => pathIsInside(excluded, folder))) continue;
    if (!roots.some((known) => sameFolder(known, folder))) roots.push(folder);
  }
  if (access.level === "full") {
    return {
      approvalPolicy: "on-request",
      sandbox: "danger-full-access",
      sandboxPolicy: { type: "dangerFullAccess" },
      runtimeWorkspaceRoots: roots,
    };
  }
  return {
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
    sandboxPolicy: { type: "workspaceWrite", writableRoots: roots, networkAccess: true },
    runtimeWorkspaceRoots: roots,
  };
}

// --- paths in text ---

const DRIVE_PATH = /[A-Za-z]:[\\/][^\s"'<>|&;]*/g;
const UNC_PATH = /\\\\[^\s\\/"'<>|]+[\\/][^\s"'<>|&;]*/g;
const UNIX_PATH = /(?:^|[\s=(])(\/[^\s"'<>|&;]+)/g;

function looksAbsolute(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]+[\\/]/.test(value) || /^\/[^\s/]/.test(value);
}

/** A switch like `/q` or `/c` is not a path. */
function isSwitch(value: string): boolean {
  return /^\/[^/]{1,2}$/.test(value);
}

/** The full paths a command line names (drive, network share and unix paths, also in quotes). Never a guess about `..`. */
export function commandPaths(command: string): string[] {
  const found: string[] = [];
  const add = (value: string) => {
    const path = value.trim().replace(/[),.:]+$/, "");
    if (path && !found.includes(path)) found.push(path);
  };
  let rest = command.replace(
    /"([^"]*)"|'([^']*)'/g,
    (whole, double: string | undefined, single: string | undefined) => {
      const inner = double ?? single ?? "";
      if (looksAbsolute(inner) && !isSwitch(inner)) {
        add(inner);
        return " ";
      }
      return whole;
    },
  );
  for (const match of rest.matchAll(UNC_PATH)) add(match[0]);
  rest = rest.replace(UNC_PATH, " ");
  for (const match of rest.matchAll(DRIVE_PATH)) add(match[0]);
  for (const match of rest.matchAll(UNIX_PATH)) {
    const value = match[1] ?? "";
    if (value && !isSwitch(value)) add(value);
  }
  return found;
}

/** A `..` step in a command (`..\x`, `../x`, `cd ..`), not a name that merely contains dots. */
function climbsOut(command: string): boolean {
  return /(^|[\s"'=\\/])\.\.([\\/]|$|\s|["'])/.test(command);
}

// --- decisions ---

/** Refusal first (an excluded folder is the strongest), then asking, else allow. */
function strictest(decisions: AccessDecision[]): AccessDecision {
  const denials = decisions.filter((decision) => decision.verdict === "deny");
  const excluded = denials.find((decision) => decision.verdict === "deny" && decision.reason === "excluded");
  if (excluded) return excluded;
  const denied = denials[0];
  if (denied) return denied;
  return decisions.some((decision) => decision.verdict === "ask") ? { verdict: "ask" } : { verdict: "allow" };
}

/**
 * What a level means for a request of the CLI to go further (a command, a file change, extra permissions). "allow" only
 * says the level has nothing against it: the usual "always allow" rules and the card of "Needs you" still decide. "deny" is
 * final: no rule opens it and no card is shown.
 */
export function decideApproval(policy: AccessPolicy, approval: AgentApproval): AccessDecision {
  const decisions: AccessDecision[] = [];
  const check = (operation: AccessOperation, paths: string[]) => {
    for (const path of paths) decisions.push(accessDecision(policy, operation, path));
  };
  if (approval.kind === "file-change") {
    const named = approval.grantRoot ?? approval.cwd;
    check("write", named ? [named] : [""]);
  } else if (approval.kind === "permissions") {
    const files = approval.permissions?.fileSystem;
    check("read", files?.read ?? []);
    check("write", files?.write ?? []);
    if (!files || files.read.length + files.write.length === 0) decisions.push({ verdict: "allow" });
  } else if (approval.kind === "command") {
    // A command at the CLI's request can write anywhere it names; without a known folder it is judged as an unknown path.
    const paths = [...(approval.cwd ? [approval.cwd] : []), ...commandPaths(approval.command ?? "")];
    // `..` hides where a command goes: below "full" it counts as a path that cannot be checked.
    if (policy.level !== "full" && climbsOut(approval.command ?? "")) paths.push("");
    check("write", paths.length > 0 ? paths : [""]);
  } else {
    // Screen and camera eyes have their own consents (Q4): the level never speaks for them.
    return { verdict: "allow" };
  }
  return strictest(decisions);
}

const WRITING_TOOL = /write|save|delete|remove|move|copy|create|export|download|rename|update|overwrite|upload/i;

/** What a level means for the tools of the program that take a path: which paths, and whether the tool changes things. */
export function decideToolPaths(policy: AccessPolicy, tool: string, paths: readonly string[]): AccessDecision {
  const operation: AccessOperation = WRITING_TOOL.test(tool) ? "write" : "read";
  return strictest(paths.map((path) => accessDecision(policy, operation, path)));
}

// --- paths in the arguments of a tool ---

const PATH_KEYS = new Set([
  "path",
  "paths",
  "file",
  "files",
  "filepath",
  "file_path",
  "folder",
  "folders",
  "directory",
  "dir",
  "cwd",
  "source",
  "destination",
  "src",
  "dest",
  "target",
  "output",
  "outputpath",
]);

function isWindowsFolder(folder: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(folder) || folder.startsWith("\\\\");
}

/** An absolute path stays; a relative one is read from the working folder (so `..` cannot hide where it goes). */
export function resolveAgainst(workspace: string, path: string): string {
  if (looksAbsolute(path)) return isWindowsFolder(path) ? win32.normalize(path) : posix.normalize(path);
  return isWindowsFolder(workspace) ? win32.resolve(workspace, path) : posix.resolve(workspace, path);
}

/** The paths named in the arguments of a tool call: the values of the usual path keys, up to a few levels deep. */
export function toolPaths(args: unknown, workspace: string): string[] {
  const found: string[] = [];
  const take = (value: unknown) => {
    if (isString(value)) {
      const text = value.trim();
      if (text && !text.includes("://") && !text.includes("\0")) found.push(resolveAgainst(workspace, text));
    } else if (Array.isArray(value)) {
      for (const item of value.slice(0, 50)) take(item);
    }
  };
  const walk = (value: unknown, depth: number) => {
    if (depth > 3 || !isDynamicRecord(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (PATH_KEYS.has(key.toLowerCase())) take(item);
      else walk(item, depth + 1);
    }
  };
  walk(args, 0);
  return found;
}

// --- the tools of Claude Code ---

export type ClaudeToolRequest =
  | { kind: "file-change"; path: string; operation: "write" }
  | { kind: "read"; path: string; operation: "read" }
  | { kind: "command"; command: string; cwd: string; operation: "write" };

const FILE_WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const FILE_READ_TOOLS = new Set(["Read", "Glob", "Grep", "NotebookRead", "LS"]);

function dirnameOf(path: string): string {
  return isWindowsFolder(path) ? win32.dirname(path) : posix.dirname(path);
}

/**
 * A tool of Claude Code as the request the program already judges for Codex: a file tool is a change in the folder of the
 * file, a shell tool is a command in the working folder. Null for tools that touch no folder (the program's own tools,
 * the web, questions).
 */
export function claudeToolRequest(tool: string, input: unknown, workspace: string): ClaudeToolRequest | null {
  const text = (key: string) => {
    const value = isDynamicRecord(input) ? input[key] : undefined;
    return isString(value) ? value : null;
  };
  if (FILE_WRITE_TOOLS.has(tool)) {
    const file = text("file_path") ?? text("notebook_path") ?? text("path");
    return file ? { kind: "file-change", path: dirnameOf(resolveAgainst(workspace, file)), operation: "write" } : null;
  }
  if (FILE_READ_TOOLS.has(tool)) {
    const file = text("file_path") ?? text("notebook_path") ?? text("path");
    return file ? { kind: "read", path: resolveAgainst(workspace, file), operation: "read" } : null;
  }
  if (tool === "Bash" || tool === "PowerShell") {
    const command = text("command");
    return command ? { kind: "command", command, cwd: workspace, operation: "write" } : null;
  }
  return null;
}
