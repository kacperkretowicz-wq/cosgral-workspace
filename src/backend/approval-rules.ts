// COSGRAL W3-KK3: "Always allow" rules for approval cards (see packages/contracts/src/ipc-approval-rules.ts for the
// rules of the rules). This file has the matching (pure) and the store (one small JSON file of this computer).

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, parse, relative, resolve } from "node:path";
import {
  type AgentApproval,
  APPROVAL_RULE_LIMITS,
  type ApprovalRule,
  type ApprovalRuleScope,
  isApprovalRule,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";

const FILE_VERSION = 1;

// -- Commands ---------------------------------------------------------------------------------------------------------

/** A command with any of these chains, redirects or substitutes something else; no rule ever matches it. */
const SHELL_CONTROL = /[;&|<>`\n\r\0]|\$\(|\$\{/;

/** Bare shells and interpreters: "always allow" on them would allow everything. */
const BARE_INTERPRETERS = new Set([
  "powershell",
  "pwsh",
  "cmd",
  "bash",
  "sh",
  "zsh",
  "fish",
  "wsl",
  "python",
  "python3",
  "py",
  "node",
  "bun",
  "deno",
  "npx",
  "perl",
  "ruby",
  "php",
  "curl",
  "wget",
  "iex",
  "invoke-expression",
  "sudo",
  "runas",
  "start",
  "eval",
  "env",
  "xargs",
]);

function firstWord(command: string): string {
  const trimmed = command.trim();
  const quoted = /^"([^"]*)"|^'([^']*)'/.exec(trimmed);
  const word = quoted ? (quoted[1] ?? quoted[2] ?? "") : (trimmed.split(/\s+/)[0] ?? "");
  const name = word.split(/[\\/]/).pop() ?? word;
  return name.toLowerCase().replace(/\.(exe|cmd|bat|ps1|com)$/, "");
}

/** Null when `prefix` can be saved as a command rule, otherwise why not. */
export function commandPrefixProblem(prefix: string): string | null {
  const value = prefix.trim();
  if (value.length < 2) return "Choose at least a short command to allow.";
  if (value.length > APPROVAL_RULE_LIMITS.prefix) return "That command is too long to save.";
  if (SHELL_CONTROL.test(value)) return "A saved command cannot chain or redirect (; & | < > or a new line).";
  if ((value.match(/"/g)?.length ?? 0) % 2 !== 0 || (value.match(/'/g)?.length ?? 0) % 2 !== 0) {
    return "A saved command cannot end inside quotes. Keep the whole quoted part.";
  }
  if (!/\s/.test(value) && BARE_INTERPRETERS.has(firstWord(value))) {
    return `“${value}” runs anything you give it, so it cannot be allowed for good. Save the full command instead.`;
  }
  return null;
}

/** True when `command` starts with the whole words of `prefix` and does not chain, redirect or substitute. */
export function commandMatchesPrefix(command: string, prefix: string): boolean {
  const text = command.trim();
  const saved = prefix.trim();
  if (!saved || SHELL_CONTROL.test(text)) return false;
  return text === saved || text.startsWith(`${saved} `) || text.startsWith(`${saved}\t`);
}

// -- Folders ----------------------------------------------------------------------------------------------------------

function normalizedPath(path: string): string {
  const full = resolve(path);
  return process.platform === "win32" ? full.toLowerCase() : full;
}

const FOLDER_PROBLEMS: Record<"empty" | "long" | "relative" | "drive", string> = {
  empty: "Choose a folder.",
  long: "That folder path is too long to save.",
  relative: "Use a full folder path.",
  drive: "A whole drive cannot be allowed for good. Choose a folder.",
};

/** Null when `folder` can be saved, otherwise why not. */
export function folderProblem(folder: string): string | null {
  const value = folder.trim();
  if (!value) return FOLDER_PROBLEMS.empty;
  if (value.length > APPROVAL_RULE_LIMITS.folder) return FOLDER_PROBLEMS.long;
  if (!isAbsolute(value)) return FOLDER_PROBLEMS.relative;
  if (parse(resolve(value)).root === resolve(value)) return FOLDER_PROBLEMS.drive;
  return null;
}

/** True when `path` is `folder` or inside it (case-insensitive on Windows; `..` is resolved first). */
export function pathInside(folder: string, path: string): boolean {
  if (!isAbsolute(folder) || !isAbsolute(path)) return false;
  const rel = relative(normalizedPath(folder), normalizedPath(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** The deepest folder that contains every path, or null when there is none below a drive root. */
export function commonFolder(paths: readonly string[]): string | null {
  const absolute = paths.filter((path) => isAbsolute(path)).map((path) => resolve(path));
  const first = absolute[0];
  if (!first || absolute.length !== paths.length) return null;
  let candidate = first;
  while (!absolute.every((path) => pathInside(candidate, path))) {
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
  return folderProblem(candidate) === null ? candidate : null;
}

// -- Rules and approvals ----------------------------------------------------------------------------------------------

type NewRule =
  | { kind: "command"; prefix: string }
  | { kind: "file-change"; folder: string }
  | { kind: "permissions"; folder: string; access: "read" | "write" };

/** The folder a file-change approval names: its grant root, otherwise its working folder. */
function namedFolder(approval: AgentApproval): string | null {
  return approval.grantRoot ?? approval.cwd;
}

/** Whether a rule allows this approval. Rules only ever look at the provider's own three kinds. */
export function ruleMatches(rule: ApprovalRule, approval: AgentApproval): boolean {
  if (rule.botId !== approval.botId || rule.kind !== approval.kind) return false;
  if (rule.kind === "command") return approval.command !== null && commandMatchesPrefix(approval.command, rule.prefix);
  if (rule.kind === "file-change") {
    const folder = namedFolder(approval);
    return folder !== null && pathInside(rule.folder, folder);
  }
  const permissions = approval.permissions;
  if (!permissions || permissions.network) return false;
  const { read, write } = permissions.fileSystem;
  if (read.length + write.length === 0) return false;
  if (write.length && rule.access !== "write") return false;
  return [...read, ...write].every((path) => pathInside(rule.folder, path));
}

/**
 * The rule that "Always allow" makes from this open approval and the person's scope, or the reason it cannot be made.
 * The scope must cover the approval itself, so a client cannot save a rule for something it was not asked about.
 */
export function ruleFromApproval(
  approval: AgentApproval,
  scope: ApprovalRuleScope,
): { ok: true; rule: NewRule } | { ok: false; reason: string } {
  if (approval.kind === "command") {
    const command = approval.command?.trim() ?? "";
    if (!command) return { ok: false, reason: "This request has no command to remember." };
    const prefix = (scope.prefix ?? command).trim();
    const problem = commandPrefixProblem(prefix);
    if (problem) return { ok: false, reason: problem };
    if (!/\s/.test(prefix) && prefix !== command) {
      return { ok: false, reason: "Keep at least two words (the program and what it does), or the whole command." };
    }
    if (!commandMatchesPrefix(command, prefix)) {
      return {
        ok: false,
        reason: "That command cannot be remembered: it chains, redirects, or does not start with those words.",
      };
    }
    return { ok: true, rule: { kind: "command", prefix } };
  }
  if (approval.kind === "file-change") {
    const named = namedFolder(approval);
    if (!named)
      return { ok: false, reason: "This request does not say which folder it changes, so it cannot be remembered." };
    const folder = (scope.folder ?? named).trim();
    const problem = folderProblem(folder);
    if (problem) return { ok: false, reason: problem };
    if (!pathInside(folder, named))
      return { ok: false, reason: "That folder does not contain the one in this request." };
    return { ok: true, rule: { kind: "file-change", folder: resolve(folder) } };
  }
  if (approval.kind === "permissions") {
    const permissions = approval.permissions;
    if (!permissions) return { ok: false, reason: "This request has nothing to remember." };
    if (permissions.network) return { ok: false, reason: "Network access cannot be allowed for good." };
    const paths = [...permissions.fileSystem.read, ...permissions.fileSystem.write];
    if (!paths.length) return { ok: false, reason: "This request names no folder, so it cannot be remembered." };
    const folder = (scope.folder ?? commonFolder(paths) ?? "").trim();
    const problem = folderProblem(folder);
    if (problem) {
      return { ok: false, reason: scope.folder ? problem : "Choose one folder that contains everything it asks for." };
    }
    if (!paths.every((path) => pathInside(folder, path))) {
      return { ok: false, reason: "That folder does not contain everything this request asks for." };
    }
    const needsWrite = permissions.fileSystem.write.length > 0;
    const access = scope.access ?? (needsWrite ? "write" : "read");
    if (needsWrite && access !== "write")
      return { ok: false, reason: "This request writes, so the rule must allow writing." };
    return { ok: true, rule: { kind: "permissions", folder: resolve(folder), access } };
  }
  return { ok: false, reason: "This kind of request can never be allowed for good." };
}

// -- Store ------------------------------------------------------------------------------------------------------------

export interface ApprovalRulesStoreOptions {
  filePath: string;
  /** Called with all rules after every change. */
  onChange?: (rules: ApprovalRule[]) => void;
  now?: () => Date;
}

export class ApprovalRulesStore {
  readonly #filePath: string;
  readonly #onChange: ((rules: ApprovalRule[]) => void) | undefined;
  readonly #now: () => Date;
  #rules: ApprovalRule[];

  constructor(options: ApprovalRulesStoreOptions) {
    this.#filePath = options.filePath;
    this.#onChange = options.onChange;
    this.#now = options.now ?? (() => new Date());
    this.#rules = readRules(this.#filePath);
  }

  list(botId?: string): ApprovalRule[] {
    return structuredClone(botId === undefined ? this.#rules : this.#rules.filter((rule) => rule.botId === botId));
  }

  /** Saves the rule that "Always allow" asks for; throws the reason when it cannot. The same rule twice is kept once. */
  addFromApproval(approval: AgentApproval, scope: ApprovalRuleScope): ApprovalRule {
    const made = ruleFromApproval(approval, scope);
    if (!made.ok) throw new Error(made.reason);
    const wanted = made.rule;
    const existing = this.#rules.find((rule) => rule.botId === approval.botId && sameRule(rule, wanted));
    if (existing) return structuredClone(existing);
    if (this.#rules.length >= APPROVAL_RULE_LIMITS.total)
      throw new Error("There are too many saved rules. Remove some first.");
    if (this.#rules.filter((rule) => rule.botId === approval.botId).length >= APPROVAL_RULE_LIMITS.perAgent) {
      throw new Error("This agent has too many saved rules. Remove some first.");
    }
    const base = {
      id: randomUUID(),
      botId: approval.botId,
      createdAt: this.#now().toISOString(),
      lastUsedAt: null,
      uses: 0,
    };
    const rule: ApprovalRule = { ...base, ...made.rule };
    this.#rules.push(rule);
    this.#save();
    return structuredClone(rule);
  }

  /** The rule that allows this approval, if any; counts the use. Never called for approvals decided in COSGRAL. */
  match(approval: AgentApproval): ApprovalRule | null {
    const rule = this.#rules.find((candidate) => ruleMatches(candidate, approval));
    if (!rule) return null;
    rule.uses += 1;
    rule.lastUsedAt = this.#now().toISOString();
    this.#save();
    return structuredClone(rule);
  }

  revoke(ruleId: string): ApprovalRule[] {
    const before = this.#rules.length;
    this.#rules = this.#rules.filter((rule) => rule.id !== ruleId);
    if (this.#rules.length !== before) this.#save();
    return this.list();
  }

  /** An agent was deleted: its rules go with it. */
  removeForBot(botId: string): void {
    const before = this.#rules.length;
    this.#rules = this.#rules.filter((rule) => rule.botId !== botId);
    if (this.#rules.length !== before) this.#save();
  }

  #save(): void {
    mkdirSync(dirname(this.#filePath), { recursive: true });
    const temporary = `${this.#filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: FILE_VERSION, rules: this.#rules }, null, 2), "utf8");
    renameSync(temporary, this.#filePath);
    this.#onChange?.(this.list());
  }
}

function sameRule(rule: ApprovalRule, wanted: NewRule): boolean {
  if (rule.kind === "command") return wanted.kind === "command" && rule.prefix === wanted.prefix;
  if (rule.kind === "file-change") return wanted.kind === "file-change" && samePath(rule.folder, wanted.folder);
  return wanted.kind === "permissions" && samePath(rule.folder, wanted.folder) && rule.access === wanted.access;
}

function samePath(left: string, right: string): boolean {
  return normalizedPath(left) === normalizedPath(right);
}

/** A broken or old file gives no rules (never a rule that was not saved on purpose); good rules in it are kept. */
function readRules(filePath: string): ApprovalRule[] {
  if (!existsSync(filePath)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
  if (!isDynamicRecord(raw) || raw.version !== FILE_VERSION || !Array.isArray(raw.rules)) return [];
  return raw.rules.filter(isApprovalRule);
}
