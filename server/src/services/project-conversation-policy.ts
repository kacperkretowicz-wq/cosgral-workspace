import { issues, type Db } from "@paperclipai/db";
import { and, eq, sql } from "drizzle-orm";
import { conflict } from "../errors.js";
import { PROJECT_CONVERSATION_ORIGIN_KIND } from "@paperclipai/shared";

export const PROJECT_CONVERSATION_MAX_ACTIVE_CHILDREN = 4;

export const PROJECT_CONVERSATION_ORIGIN = PROJECT_CONVERSATION_ORIGIN_KIND;

export function isProjectConversation(issue: { originKind?: string | null } | null | undefined): boolean {
  return issue?.originKind === PROJECT_CONVERSATION_ORIGIN;
}

/** Keep the backing thread reachable and scoped to the same project. */
export function assertProjectConversationMutation(
  issue: { originKind: string; companyId: string; projectId: string | null; visibility: string; assigneeAgentId?: string | null },
  patch: { originKind?: string; companyId?: string; projectId?: string | null; visibility?: string; parentId?: string | null; hiddenAt?: Date | null; status?: string; assigneeAgentId?: string | null; assigneeUserId?: string | null; conversationAgentId?: string | null },
) {
  if (issue.originKind !== PROJECT_CONVERSATION_ORIGIN) return;
  if ((patch.assigneeAgentId !== undefined && patch.assigneeAgentId !== issue.assigneeAgentId)
    || patch.assigneeUserId != null || patch.conversationAgentId != null) {
    throw conflict("Change the project coordinator through the project conversation settings.");
  }
  if ((patch.companyId !== undefined && patch.companyId !== issue.companyId)
    || (patch.projectId !== undefined && patch.projectId !== issue.projectId)
    || (patch.originKind !== undefined && patch.originKind !== issue.originKind)
    || (patch.visibility !== undefined && patch.visibility !== issue.visibility)
    || patch.parentId != null || patch.hiddenAt != null
    || (patch.status !== undefined && !["todo", "in_progress"].includes(patch.status))) {
    throw conflict("The shared project conversation cannot be closed, hidden, moved, or made private as a task.");
  }
}

/** Serialize sibling completion before taking child row locks (also in native settlement). */
export async function lockProjectConversationChildren(db: Db, companyId: string, parentId: string | null | undefined) {
  if (!parentId) return false;
  const [parent] = await db.select({ originKind: issues.originKind }).from(issues)
    .where(and(eq(issues.companyId, companyId), eq(issues.id, parentId)));
  if (parent?.originKind !== PROJECT_CONVERSATION_ORIGIN) return false;
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`conversation-children:${companyId}:${parentId}`}, 0))`);
  return true;
}
