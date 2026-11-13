// COSGRAL W3-KK3: input validation for the "always allow" rules IPC calls and for the scope sent with an approval.

import { type ApprovalRuleScope, isApprovalRuleScope, type RevokeApprovalRuleInput } from "@openbot/contracts/ipc";
import { isObject, requireString } from "./validation";

export function parseApprovalRulesBotId(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : requireString(value, "botId");
}

export function parseRevokeApprovalRule(value: unknown): RevokeApprovalRuleInput {
  if (!isObject(value)) throw new Error("The rule is required.");
  return { ruleId: requireString(value.ruleId, "ruleId") };
}

/** The scope of "Always allow": only the known fields, with their limits. Unknown fields are dropped. */
export function parseApprovalRuleScope(value: unknown): ApprovalRuleScope {
  if (!isApprovalRuleScope(value)) throw new Error("Invalid always-allow choice.");
  const scope: ApprovalRuleScope = {};
  if (value.prefix !== undefined) scope.prefix = value.prefix;
  if (value.folder !== undefined) scope.folder = value.folder;
  if (value.access !== undefined) scope.access = value.access;
  return scope;
}
