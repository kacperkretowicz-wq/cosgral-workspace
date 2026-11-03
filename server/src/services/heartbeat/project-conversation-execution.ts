import { unprocessable } from "../../errors.js";
import { isProjectConversation } from "../project-conversation-policy.js";

export type ConversationExecutionRole = "coordinator" | "worker";
type AncestryIssue = { id: string; companyId: string; projectId: string | null; parentId: string | null; originKind: string };

/** Stored ancestry, never a wake payload, establishes the execution boundary. */
export async function conversationExecutionRole(
  issue: AncestryIssue | null,
  read: (id: string) => Promise<AncestryIssue | null>,
): Promise<ConversationExecutionRole | null> {
  if (!issue) return null;
  let cursor: AncestryIssue | null = issue;
  const visited = new Set<string>();
  let sameProject = true;
  for (let depth = 0; cursor && depth < 64; depth++) {
    if (visited.has(cursor.id) || cursor.companyId !== issue.companyId) break;
    sameProject = sameProject && cursor.projectId === issue.projectId;
    visited.add(cursor.id);
    if (isProjectConversation(cursor)) {
      if (!sameProject || !issue.projectId) break;
      return cursor.id === issue.id ? "coordinator" : "worker";
    }
    if (!cursor.parentId) return null;
    cursor = await read(cursor.parentId);
  }
  throw unprocessable("Cannot verify project conversation execution ancestry.");
}

/** Apply after task overrides. No caller-selected command/profile may weaken this boundary. */
export function protectConversationConfig(config: Record<string, unknown>, role: ConversationExecutionRole): Record<string, unknown> {
  return {
    ...config,
    cosgralExecutionRole: role,
    engine: "cli",
    command: "codex",
    dangerouslyBypassApprovalsAndSandbox: false,
    dangerouslyBypassSandbox: false,
    args: [], extraArgs: [],
    filesystemScope: "workspace",
    filesystemSandboxCommand: "bwrap",
    filesystemExtraPaths: [],
    workspaceStrategy: { type: "git_worktree", branchTemplate: `${role === "worker" ? "cosgral" : "cosgral-coordinator"}/{{issue.id}}/{{agent.id}}` },
  };
}
