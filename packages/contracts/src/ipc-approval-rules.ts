// COSGRAL W3-KK3: "Always allow" for approval cards (parity row 11).
//
// An agent asks for a command, a file change or a permission; the person can answer Allow once, Always allow or Deny.
// "Always allow" saves a rule for THIS agent and THIS kind of request; the next matching request is allowed without a
// card. A rule is narrow on purpose:
//   command      the command starts with the saved words (a whole word, never half a word). A command that chains
//                or redirects (; & | < > ` $( or a new line) never matches, so "git status" does not allow
//                "git status; rm -r x". Bare shells and interpreters (powershell, cmd, bash, python, node …) cannot be
//                saved, because allowing them is allowing everything.
//   file-change  the request names a folder (its grant root or working folder) and that folder is the saved folder or
//                inside it. A request that names no folder never matches.
//   permissions  every folder the request wants to read or write is inside the saved folder; writing needs a "write"
//                rule; network access is never covered.
//
// Rules never cover Computer Use, the Vault, payments, Mobile Connect pairing, browser takeover or agent eyes (screen
// and camera): those are other cards that never look at rules. A phone cannot create or read rules (the phone API
// answers 403 for `approval-rules`; its answers carry no `always`). A rule is made only from an approval that is open
// now, and the program checks the scope you choose against that approval.

import { isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const APPROVAL_RULE_KINDS = ["command", "file-change", "permissions"] as const;
export type ApprovalRuleKind = (typeof APPROVAL_RULE_KINDS)[number];

export const APPROVAL_RULE_ACCESS = ["read", "write"] as const;
export type ApprovalRuleAccess = (typeof APPROVAL_RULE_ACCESS)[number];

export const APPROVAL_RULE_LIMITS = {
  prefix: 500,
  folder: 1_000,
  perAgent: 100,
  total: 500,
} as const;

/** What an "always" rule never covers (shown in the UI next to the rule list). */
export const APPROVAL_RULES_NEVER_COVER = [
  "Computer Use",
  "the Vault",
  "payments",
  "Mobile Connect pairing",
  "taking over the browser",
  "screen and camera sharing",
] as const;

interface ApprovalRuleBase {
  id: string;
  botId: string;
  createdAt: string;
  /** When it last allowed a request; null if never. */
  lastUsedAt: string | null;
  uses: number;
}

export type ApprovalRule =
  | (ApprovalRuleBase & { kind: "command"; prefix: string })
  | (ApprovalRuleBase & { kind: "file-change"; folder: string })
  | (ApprovalRuleBase & { kind: "permissions"; folder: string; access: ApprovalRuleAccess });

/**
 * What the person chose with "Always allow". Everything is optional: a command rule defaults to the whole command, a
 * file-change rule to the folder the request names. The program refuses a scope that does not cover the open request.
 */
export interface ApprovalRuleScope {
  /** command: the words the command must start with (a prefix of the open command, by whole words). */
  prefix?: string;
  /** file-change and permissions: the folder (it must contain what the open request names). */
  folder?: string;
  /** permissions: "write" also allows reading; defaults to "write" when the request writes. */
  access?: ApprovalRuleAccess;
}

export interface RevokeApprovalRuleInput {
  ruleId: string;
}

/** `window.openbot.approvalRules` (this computer only). Changes come as `approval-rules-changed`. */
export interface ApprovalRulesDesktopApi {
  /** All rules, or one agent's. */
  list: (botId?: string) => Promise<ApprovalRule[]>;
  /** Takes the rule away at once; returns the remaining rules. */
  revoke: (input: RevokeApprovalRuleInput) => Promise<ApprovalRule[]>;
}

/** One short line for the rule list. */
export function describeApprovalRule(rule: ApprovalRule): string {
  switch (rule.kind) {
    case "command":
      return `Commands that start with “${rule.prefix}”`;
    case "file-change":
      return `File changes in ${rule.folder}`;
    case "permissions":
      return `${rule.access === "write" ? "Reading and writing" : "Reading"} in ${rule.folder}`;
  }
}

export function isApprovalRuleScope(value: unknown): value is ApprovalRuleScope {
  return (
    isDynamicRecord(value) &&
    (value.prefix === undefined || (isString(value.prefix) && value.prefix.length <= APPROVAL_RULE_LIMITS.prefix)) &&
    (value.folder === undefined || (isString(value.folder) && value.folder.length <= APPROVAL_RULE_LIMITS.folder)) &&
    (value.access === undefined || isOneOf(APPROVAL_RULE_ACCESS, value.access))
  );
}

export function isApprovalRule(value: unknown): value is ApprovalRule {
  if (
    !isDynamicRecord(value) ||
    !isString(value.id) ||
    !isString(value.botId) ||
    !isString(value.createdAt) ||
    !(value.lastUsedAt === null || isString(value.lastUsedAt)) ||
    !isNumber(value.uses) ||
    !isOneOf(APPROVAL_RULE_KINDS, value.kind)
  ) {
    return false;
  }
  if (value.kind === "command") return isString(value.prefix) && value.prefix.length > 0;
  if (value.kind === "file-change") return isString(value.folder) && value.folder.length > 0;
  return isString(value.folder) && value.folder.length > 0 && isOneOf(APPROVAL_RULE_ACCESS, value.access);
}

export function isApprovalRuleList(value: unknown): value is ApprovalRule[] {
  return Array.isArray(value) && value.every(isApprovalRule);
}
