// COSGRAL W3-KK3: IPC of the "always allow" rules. This computer only: a remote server's rules are not shown here.

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { ApprovalRulesStore } from "../backend/approval-rules";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { parseApprovalRulesBotId, parseRevokeApprovalRule } from "./ipc/approval-rules-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerApprovalRulesIpc(rules: () => ApprovalRulesStore | null): void {
  handleTrusted(IPC_CHANNELS.approvalRulesList, (input: unknown) => {
    const scoped = parseAgentRequest(input);
    if (scoped.serverId !== "local") return [];
    return rules()?.list(parseApprovalRulesBotId(scoped.payload)) ?? [];
  });
  handleTrusted(IPC_CHANNELS.approvalRulesRevoke, (input: unknown) => {
    const scoped = parseAgentRequest(input);
    if (scoped.serverId !== "local") throw new Error("Approval rules are kept only on this computer.");
    const store = rules();
    if (!store) throw new Error("Approval rules are unavailable.");
    return store.revoke(parseRevokeApprovalRule(scoped.payload).ruleId);
  });
}
