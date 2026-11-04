import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, uniqueIndex, foreignKey, check } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";

// Execution guidance is company-scoped and deliberately separate from presentation preferences.
export const workspaceInstructions = pgTable("workspace_instructions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  projectId: uuid("project_id"),
  text: text("text").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  scopeUq: uniqueIndex("workspace_instructions_scope_uq").on(t.companyId, t.key),
  projectFk: foreignKey({ columns: [t.companyId, t.projectId], foreignColumns: [projects.companyId, projects.id] }).onDelete("cascade"),
  scopeCheck: check("workspace_instructions_scope_check", sql`(${t.projectId} is not null and ${t.key} = 'project:' || ${t.projectId}::text) or (${t.projectId} is null and (${t.key} = 'company' or ${t.key} like 'user:%'))`),
  lengthCheck: check("workspace_instructions_length_check", sql`length(${t.text}) <= 8000`),
}));
