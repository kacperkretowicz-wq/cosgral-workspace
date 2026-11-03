import { activityLog, heartbeatRuns, issueComments, issueThreadInteractions, issues, type Db } from "@paperclipai/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { persistActivity, publishActivity, type ActivityPublication } from "../activity-log.js";
import { PROJECT_CONVERSATION_ORIGIN } from "../project-conversation-policy.js";
import { notifyStatusCardIssueChange } from "../status-card-notifications.js";

/** Settle a channel turn before releasing its execution lock. No task disposition or retry. */
export async function settleProjectConversationTurn(db: Db, run: Pick<typeof heartbeatRuns.$inferSelect,
  "id" | "companyId" | "agentId" | "status"> & { issueId: string | null }) {
  if (!run.issueId || !["succeeded", "failed", "timed_out", "cancelled"].includes(run.status)) return false;
  const publications: ActivityPublication[] = [];
  const settled = await db.transaction(async tx => {
    const [issue] = await tx.select({
      id: issues.id, companyId: issues.companyId, projectId: issues.projectId, status: issues.status,
      assigneeAgentId: issues.assigneeAgentId, executionRunId: issues.executionRunId, checkoutRunId: issues.checkoutRunId,
    }).from(issues).where(and(
      eq(issues.id, run.issueId!), eq(issues.companyId, run.companyId),
      eq(issues.originKind, PROJECT_CONVERSATION_ORIGIN),
    )).for("update");
    if (!issue) return false;
    // A late release must never change another coordinator's turn.
    if (issue.assigneeAgentId !== run.agentId
      || (issue.executionRunId && issue.executionRunId !== run.id)
      || (issue.checkoutRunId && issue.checkoutRunId !== run.id)) return true;
    const [reply] = await tx.select({ id: issueComments.id }).from(issueComments).where(and(
      eq(issueComments.companyId, run.companyId), eq(issueComments.issueId, issue.id),
      eq(issueComments.createdByRunId, run.id), eq(issueComments.authorAgentId, run.agentId),
      isNull(issueComments.deletedAt),
    )).limit(1);
    // Text (including a claimed handoff) is not an action receipt. Only this
    // run's persisted, scoped writes can confirm delegation or a decision gate.
    const [delegation] = await tx.select({ id: issues.id }).from(issues).where(and(
      eq(issues.companyId, run.companyId), eq(issues.parentId, issue.id),
      issue.projectId ? eq(issues.projectId, issue.projectId) : isNull(issues.projectId),
      eq(issues.originRunId, run.id), eq(issues.createdByAgentId, run.agentId),
    )).limit(1);
    const [interaction] = await tx.select({ id: issueThreadInteractions.id }).from(issueThreadInteractions).where(and(
      eq(issueThreadInteractions.companyId, run.companyId), eq(issueThreadInteractions.issueId, issue.id),
      eq(issueThreadInteractions.sourceRunId, run.id), eq(issueThreadInteractions.createdByAgentId, run.agentId),
    )).limit(1);
    const [childAction] = await tx.select({ id: activityLog.id }).from(activityLog).innerJoin(issues, and(
      eq(sql`${issues.id}::text`, activityLog.entityId), eq(issues.companyId, run.companyId),
      eq(issues.parentId, issue.id),
      issue.projectId ? eq(issues.projectId, issue.projectId) : isNull(issues.projectId),
    )).where(and(eq(activityLog.companyId, run.companyId), eq(activityLog.runId, run.id),
      eq(activityLog.actorType, "agent"), eq(activityLog.actorId, run.agentId),
      eq(activityLog.entityType, "issue"), inArray(activityLog.action, ["issue.created", "issue.updated"]),
    )).limit(1);
    // A completion wake needs a reply, not another delegation. Revalidate the
    // stored child binding rather than treating arbitrary context as a receipt.
    const [storedRun] = await tx.select({ completedChildIssueId: sql<unknown>`${heartbeatRuns.contextSnapshot}->'completedChildIssueId'` }).from(heartbeatRuns).where(and(
      eq(heartbeatRuns.id, run.id), eq(heartbeatRuns.companyId, run.companyId),
    ));
    const completedChildId = storedRun?.completedChildIssueId;
    const [completedChild] = typeof completedChildId === "string"
      ? await tx.select({ id: issues.id }).from(issues).where(and(
        eq(sql`${issues.id}::text`, completedChildId), eq(issues.companyId, run.companyId),
        eq(issues.parentId, issue.id), eq(issues.status, "done"),
        issue.projectId ? eq(issues.projectId, issue.projectId) : isNull(issues.projectId),
      )).limit(1) : [];
    const missingAction = !delegation && !interaction && !childAction && !completedChild;
    const noticeKey = `project-conversation-turn:${run.id}`;
    const [notice] = await tx.select({ id: issueComments.id }).from(issueComments).where(and(
      eq(issueComments.issueId, issue.id), eq(issueComments.companyId, run.companyId),
      eq(issueComments.clientRequestId, noticeKey), eq(issueComments.authorType, "system"),
    )).limit(1);
    if (!notice && (run.status !== "succeeded" || !reply || missingAction)) {
      const [comment] = await tx.insert(issueComments).values({
        companyId: run.companyId, issueId: issue.id, authorType: "system", createdByRunId: run.id,
        clientRequestId: noticeKey,
        body: run.status === "succeeded"
          ? !reply
            ? "Błąd tury koordynatora: proces zakończył się bez potwierdzonej odpowiedzi przez API rozmowy. Delegowanie nie zostało potwierdzone. Sprawdź szczegóły uruchomienia przed ponowieniem."
            : "Błąd weryfikacji delegowania: koordynator odpowiedział, ale nie zapisał zadania ani operacji przez API. Sam komentarz nie potwierdza wykonania polecenia. Sprawdź szczegóły uruchomienia przed ponowieniem."
          : "Nie udało się zakończyć odpowiedzi koordynatora. Rozmowa pozostaje otwarta; sprawdź szczegóły uruchomienia i poproś o ponowienie po usunięciu przyczyny.",
      }).returning();
      publications.push((await persistActivity(tx as unknown as Db, {
        companyId: run.companyId, actorType: "system", actorId: "project_conversation", runId: run.id,
        action: "issue.comment_added", entityType: "issue", entityId: issue.id,
        details: { commentId: comment.id, source: "project_conversation.turn_failed", runStatus: run.status },
      })).publication);
    }
    if (issue.status !== "todo" || issue.checkoutRunId === run.id) {
      await notifyStatusCardIssueChange(tx, issue.companyId);
      await tx.update(issues).set({ status: "todo", statusVersion: sql`${issues.statusVersion} + 1`,
        ...(issue.checkoutRunId === run.id ? { checkoutRunId: null } : {}),
        completedAt: null, cancelledAt: null, updatedAt: new Date(),
      }).where(eq(issues.id, issue.id));
      publications.push((await persistActivity(tx as unknown as Db, {
        companyId: run.companyId, actorType: "system", actorId: "project_conversation", runId: run.id,
        action: "issue.updated", entityType: "issue", entityId: issue.id,
        details: { status: "todo", source: "project_conversation.turn_settled" },
      })).publication);
    }
    return true;
  });
  for (const publication of publications) publishActivity(publication);
  return settled;
}
