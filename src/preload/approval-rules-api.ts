// COSGRAL W3-KK3: the window API of the "always allow" rules. Answers are checked with the contract guards.

import {
  type ApprovalRule,
  type ApprovalRulesDesktopApi,
  IPC_CHANNELS,
  isApprovalRuleList,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createApprovalRulesApi(invoke: Invoke): ApprovalRulesDesktopApi {
  return {
    list: (botId) => invoke(IPC_CHANNELS.approvalRulesList, botId ?? null, decodeRules),
    revoke: (input) => invoke(IPC_CHANNELS.approvalRulesRevoke, input, decodeRules),
  };
}

function decodeRules(value: unknown): ApprovalRule[] {
  if (!isApprovalRuleList(value)) throw new Error("Invalid approval rules response.");
  return value;
}
