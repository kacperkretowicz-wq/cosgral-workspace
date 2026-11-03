import { foreignKey, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { projects } from "./projects.js";

/** Durable identity of a project's shared conversation, backed by an ordinary issue thread. */
export const projectConversations = pgTable("project_conversations", {
  companyId: uuid("company_id").notNull(),
  projectId: uuid("project_id").notNull(),
  issueId: uuid("issue_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projectUq: unique("project_conversations_project_uq").on(table.companyId, table.projectId),
  issueUq: unique("project_conversations_issue_uq").on(table.companyId, table.issueId),
  projectFk: foreignKey({
    name: "project_conversations_project_fk",
    columns: [table.companyId, table.projectId],
    foreignColumns: [projects.companyId, projects.id],
  }).onDelete("cascade"),
  issueFk: foreignKey({
    name: "project_conversations_issue_fk",
    columns: [table.companyId, table.projectId, table.issueId],
    foreignColumns: [issues.companyId, issues.projectId, issues.id],
  }).onDelete("restrict"),
}));
