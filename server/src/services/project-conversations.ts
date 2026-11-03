import { and, eq } from "drizzle-orm";
import { agents, issues, projectConversations, projects, type Db } from "@paperclipai/db";
import { issueService } from "./issues.js";
import { PROJECT_CONVERSATION_ORIGIN } from "./project-conversation-policy.js";
import { accessService } from "./access.js";
import { conflict, unprocessable } from "../errors.js";

/** Persistence only: callers must authorize the project and issue for the actor. */
export function projectConversationService(db: Db) {
  const issueSvc = issueService(db);

  const service = {
    async get(companyId: string, projectId: string) {
      const [row] = await db.select({ issue: issues }).from(projectConversations)
        .innerJoin(issues, and(eq(issues.companyId, projectConversations.companyId), eq(issues.id, projectConversations.issueId)))
        .where(and(eq(projectConversations.companyId, companyId), eq(projectConversations.projectId, projectId)));
      return row?.issue ?? null;
    },

    async setCoordinator(companyId: string, projectId: string, userId: string, agentId: string | null, hooks: {
      authorize: (tx: Db) => Promise<void>;
      changed: (tx: Db, issueId: string, previousAgentId: string | null, agentId: string | null, commentId: string) => Promise<void>;
    }) {
      return db.transaction(async rawTx => {
        const tx = rawTx as unknown as Db;
        const [project] = await tx.select().from(projects).where(and(eq(projects.companyId, companyId), eq(projects.id, projectId))).for("update");
        if (!project) return null;
        await hooks.authorize(tx);
        if (project.archivedAt) throw conflict("Archived projects cannot change coordinator");
        let agent: typeof agents.$inferSelect | undefined;
        if (agentId) {
          [agent] = await tx.select().from(agents).where(and(eq(agents.companyId, companyId), eq(agents.id, agentId))).for("share");
          if (!agent) throw unprocessable("Coordinator must be an agent of this company");
          if (["paused", "terminated", "pending_approval", "error"].includes(agent.status)) throw unprocessable("Coordinator is paused or not ready");
          const decision = await accessService(tx).decide({ actor: { type: "agent", companyId, agentId }, action: "project:read",
            resource: { type: "project", companyId, projectId } });
          if (!decision.allowed) throw unprocessable("Coordinator needs access to this project");
        }
        const conversation = projectConversationService(tx);
        const result = await conversation.getOrCreate(companyId, projectId, userId);
        if (!result) return null;
        const issue = result.issue;
        if (issue.assigneeAgentId === agentId) return issue;
        // This is the only assignment writer for shared channels: authorization,
        // selection event and visible comment commit together, without waking on selection.
        const [updated] = await tx.update(issues).set({ assigneeAgentId: agentId, assigneeUserId: null,
          status: agentId ? "todo" : "backlog", updatedAt: new Date() }).where(and(eq(issues.companyId, companyId), eq(issues.id, issue.id))).returning();
        const comment = await issueService(tx).addComment(issue.id,
          agent ? `Koordynator projektu: ${agent.name}.` : "Koordynator projektu został odłączony.", { userId }, { authorType: "user" });
        await hooks.changed(tx, issue.id, issue.assigneeAgentId, agentId, comment.id);
        return updated;
      });
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
  return service;
}
