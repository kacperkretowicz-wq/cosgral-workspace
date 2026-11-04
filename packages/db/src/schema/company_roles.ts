import { pgTable, uuid, text, integer, timestamp, jsonb, uniqueIndex, foreignKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { companyMemberships } from "./company_memberships.js";

export const companyRoles = pgTable("company_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(), description: text("description").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  companyIdUnique: uniqueIndex("company_roles_company_id_unique").on(table.companyId, table.id),
  companyNameUnique: uniqueIndex("company_roles_company_name_unique").on(table.companyId, table.name),
  validDefinition: check("company_roles_definition_check", sql`length(btrim(${table.name})) between 1 and 100 and length(${table.description}) <= 2000 and ${table.version} > 0 and jsonb_typeof(${table.permissions}) = 'array'`),
}));

// Pokwitowanie ostatniego zastosowania. Późniejsza ręczna edycja grantów ma pierwszeństwo.
export const companyRoleApplications = pgTable("company_role_applications", {
  memberId: uuid("member_id").primaryKey(), companyId: uuid("company_id").notNull(),
  roleId: uuid("role_id").notNull(), version: integer("version").notNull(), name: text("name").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull(),
  appliedByUserId: text("applied_by_user_id").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  roleCompanyFk: foreignKey({ columns: [table.companyId, table.roleId], foreignColumns: [companyRoles.companyId, companyRoles.id] }),
  memberCompanyFk: foreignKey({ columns: [table.companyId, table.memberId], foreignColumns: [companyMemberships.companyId, companyMemberships.id] }).onDelete("cascade"),
}));
