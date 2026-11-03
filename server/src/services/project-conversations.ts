import { and, eq } from "drizzle-orm";
import { issues, projectConversations, projects, type Db } from "@paperclipai/db";
import { issueService } from "./issues.js";
import { PROJECT_CONVERSATION_ORIGIN } from "./project-conversation-policy.js";
import { conflict } from "../errors.js";

/** Persistence only: callers must authorize the project and issue for the actor. */
export function projectConversationService(db: Db) {
  const issueSvc = issueService(db);

  return {
    async get(companyId: string, projectId: string) {
      const [row] = await db.select({ issue: issues }).from(projectConversations)
        .innerJoin(issues, and(eq(issues.companyId, projectConversations.companyId), eq(issues.id, projectConversations.issueId)))
        .where(and(eq(projectConversations.companyId, companyId), eq(projectConversations.projectId, projectId)));
      return row?.issue ?? null;
    },

    async getOrCreate(companyId: string, projectId: string, createdByUserId: string, hooks?: {
      authorize: (tx: Db) => Promise<void>;
      created: (tx: Db, issueId: string) => Promise<void>;
    }) {
      return db.transaction(async (tx) => {
        // Serialize first creation, including a request racing a project delete.
        const [project] = await tx.select({ id: projects.id, name: projects.name, archivedAt: projects.archivedAt })
          .from(projects).where(and(eq(projects.companyId, companyId), eq(projects.id, projectId))).for("update");
        if (!project) return null;
        await hooks?.authorize(tx as unknown as Db);
        const [existing] = await tx.select({ issue: issues }).from(projectConversations)
          .innerJoin(issues, and(eq(issues.companyId, projectConversations.companyId), eq(issues.id, projectConversations.issueId)))
          .where(and(eq(projectConversations.companyId, companyId), eq(projectConversations.projectId, projectId)));
        if (existing) return { issue: existing.issue, created: false };
        if (project.archivedAt) throw conflict("Archived projects cannot start a new conversation");

        const issue = await issueSvc.create(companyId, {
          title: `Project conversation: ${project.name}`,
          projectId,
          status: "backlog",
          originKind: PROJECT_CONVERSATION_ORIGIN,
          createdByUserId,
          allowDuplicate: true,
        }, tx);
        await tx.insert(projectConversations).values({ companyId, projectId, issueId: issue.id });
        await hooks?.created(tx as unknown as Db, issue.id);
        return { issue, created: true };
      });
    },
  };
}
