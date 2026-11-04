import { and, eq, or } from "drizzle-orm";
import { heartbeatRuns, issueComments, issues, projectConversations, type Db } from "@paperclipai/db";

/** One automatic agent→agent hop. Replies persist, but cannot start ping-pong.
 * Read the authenticated run's durable source, never a client-supplied hop count.
 * Missing attribution fails closed for agent-authored cross-assignee messages. */
export async function allowAgentMessageWake(db: Db, companyId: string, targetIssueId: string, agentId?: string | null, runId?: string | null) {
  if (!agentId) return true;
  const [scope] = await db.select({ id: issues.id }).from(issues).innerJoin(projectConversations, and(
    eq(projectConversations.companyId, issues.companyId), eq(projectConversations.projectId, issues.projectId),
    or(eq(projectConversations.issueId, issues.id), eq(projectConversations.issueId, issues.parentId)),
  )).where(and(eq(issues.companyId, companyId), eq(issues.id, targetIssueId)));
  if (!scope) return true;
  if (!runId) return false;
  const [run] = await db.select().from(heartbeatRuns).where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.agentId, agentId)));
  if (!run || run.status !== "running") return false;
  const context = run.contextSnapshot;
  const sourceId = context?.wakeCommentId ?? context?.commentId;
  if (typeof sourceId !== "string" || !/^[0-9a-f-]{36}$/i.test(sourceId)) {
    // A comment wake without a verifiable source cannot extend a chain.
    return !["issue_commented", "issue_reopened_via_comment"].includes(String(context?.wakeReason));
  }
  const [source] = await db.select({ authorAgentId: issueComments.authorAgentId }).from(issueComments)
    .where(and(eq(issueComments.companyId, companyId), eq(issueComments.id, sourceId)));
  return Boolean(source && !source.authorAgentId);
}
