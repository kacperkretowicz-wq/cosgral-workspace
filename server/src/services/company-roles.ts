import { and, eq } from "drizzle-orm";
import { companies, companyMemberships, companyRoles, companyRoleApplications, principalPermissionGrants, agents, type Db } from "@paperclipai/db";
import { companyRoleDefinitionSchema, type CompanyRoleDefinition } from "@paperclipai/shared/company-roles";
import type { PermissionKey } from "@paperclipai/shared";
import { conflict, forbidden, notFound } from "../errors.js";
import { accessService } from "./access.js";
import { persistActivity, publishActivity } from "./activity-log.js";
import { logger } from "../middleware/logger.js";

export function companyRoleService(db: Db) {
  async function membership(tx: Db, companyId: string, userId: string, write: boolean) {
    const [member] = await tx.select().from(companyMemberships).where(and(
      eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "user"), eq(companyMemberships.principalId, userId),
    )).for("share");
    if (!member || member.status !== "active") throw notFound("Company not found");
    if (write && !["owner", "admin"].includes(member.membershipRole ?? "")) throw forbidden("Company administrator required");
    return member;
  }
  async function assertGrantAuthority(tx: Db, companyId: string, userId: string, keys: PermissionKey[]) {
    const held = await tx.select().from(principalPermissionGrants).where(and(
      eq(principalPermissionGrants.companyId, companyId), eq(principalPermissionGrants.principalType, "user"), eq(principalPermissionGrants.principalId, userId),
    )).for("share");
    // Roles contain company-wide keys only. A scoped grant can never authorize
    // issuing an unscoped one, even if the generic permission check allows it.
    for (const key of new Set<PermissionKey>(["users:manage_permissions", ...keys])) {
      const grant = held.find(g => g.permissionKey === key);
      if (!grant || (grant.scope !== null && Object.keys(grant.scope).length !== 0)
        || !await accessService(tx).hasPermission(companyId, "user", userId, key)) throw forbidden("Role exceeds administrator permissions");
    }
  }
  async function mutate<T>(companyId: string, userId: string, operation: (tx: Db) => Promise<{ value: T; action: string; entityId: string; details?: Record<string, unknown> }>) {
    const result = await db.transaction(async transaction => {
      const tx = transaction as unknown as Db;
      // Serializes this feature's create/edit/apply and coordinates company deletion.
      const [company] = await transaction.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).for("no key update");
      if (!company) throw notFound("Company not found");
      await membership(tx, companyId, userId, true);
      await assertGrantAuthority(tx, companyId, userId, []);
      const saved = await operation(tx);
      const { publication } = await persistActivity(tx, { companyId, actorType: "user", actorId: userId,
        action: saved.action, entityType: "company_role", entityId: saved.entityId, details: saved.details });
      return { value: saved.value, publication };
    });
    try { publishActivity(result.publication); } catch (err) { logger.warn({ err }, "Could not publish company role update"); }
    return result.value;
  }
  return {
    async list(companyId: string, userId: string) {
      await membership(db, companyId, userId, false);
      return db.select().from(companyRoles).where(eq(companyRoles.companyId, companyId)).orderBy(companyRoles.name);
    },
    async create(companyId: string, userId: string, input: CompanyRoleDefinition) {
      const definition = companyRoleDefinitionSchema.parse(input);
      return mutate(companyId, userId, async tx => {
        await assertGrantAuthority(tx, companyId, userId, definition.permissions);
        const [existing] = await tx.select({ id: companyRoles.id }).from(companyRoles).where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.name, definition.name)));
        if (existing) throw conflict("Role name already exists");
        const [role] = await tx.insert(companyRoles).values({ companyId, ...definition }).returning();
        return { value: role!, action: "company_role.created", entityId: role!.id };
      });
    },
    async update(companyId: string, userId: string, roleId: string, version: number, input: CompanyRoleDefinition) {
      const definition = companyRoleDefinitionSchema.parse(input);
      return mutate(companyId, userId, async tx => {
        const [existing] = await tx.select().from(companyRoles).where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.id, roleId))).for("update");
        if (!existing) throw notFound("Role not found");
        if (existing.version !== version) throw conflict("Role version changed");
        await assertGrantAuthority(tx, companyId, userId, definition.permissions);
        // Editing an existing definition also requires authority over the old set.
        await assertGrantAuthority(tx, companyId, userId, existing.permissions as PermissionKey[]);
        const names = await tx.select({ id: companyRoles.id }).from(companyRoles).where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.name, definition.name)));
        if (names.some(row => row.id !== roleId)) throw conflict("Role name already exists");
        const [role] = await tx.update(companyRoles).set({ ...definition, version: version + 1, updatedAt: new Date() }).where(eq(companyRoles.id, roleId)).returning();
        return { value: role!, action: "company_role.updated", entityId: roleId };
      });
    },
    async remove(companyId: string, userId: string, roleId: string, version: number) {
      return mutate(companyId, userId, async tx => {
        const [role] = await tx.select().from(companyRoles).where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.id, roleId))).for("update");
        if (!role) throw notFound("Role not found");
        if (role.version !== version) throw conflict("Role version changed");
        await assertGrantAuthority(tx, companyId, userId, role.permissions as PermissionKey[]);
        const [application] = await tx.select({ id: companyRoleApplications.memberId }).from(companyRoleApplications).where(and(eq(companyRoleApplications.companyId, companyId), eq(companyRoleApplications.roleId, roleId))).limit(1);
        if (application) throw conflict("Rola ma zapisane zastosowania. Nie można jej usunąć; istniejące granty pozostają bez zmian.");
        await tx.delete(companyRoles).where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.id, roleId)));
        return { value: { deleted: true }, action: "company_role.deleted", entityId: roleId, details: { version } };
      });
    },
    async apply(companyId: string, userId: string, memberId: string, roleId: string, version: number) {
      return mutate(companyId, userId, async tx => {
        const [role] = await tx.select().from(companyRoles).where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.id, roleId))).for("share");
        if (!role) throw notFound("Role not found");
        if (role.version !== version) throw conflict("Role version changed");
        await assertGrantAuthority(tx, companyId, userId, role.permissions as PermissionKey[]);
        const [member] = await tx.select().from(companyMemberships).where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.id, memberId))).for("update");
        if (!member) throw notFound("Member not found");
        if (member.status !== "active" || !["user", "agent"].includes(member.principalType)
          || ["owner", "admin", "viewer"].includes(member.membershipRole ?? "")) throw conflict("Protected or inactive membership");
        if (member.principalType === "agent") {
          const [agent] = await tx.select({ id: agents.id }).from(agents).where(and(eq(agents.id, member.principalId), eq(agents.companyId, companyId))).for("share");
          if (!agent) throw notFound("Agent not found");
        }
        await accessService(tx).setMemberPermissions(companyId, memberId, role.permissions.map(permissionKey => ({ permissionKey: permissionKey as PermissionKey })), userId);
        const receipt = { companyId, memberId, roleId, version, name: role.name, permissions: role.permissions, appliedByUserId: userId, appliedAt: new Date() };
        const [saved] = await tx.insert(companyRoleApplications).values(receipt).onConflictDoUpdate({ target: companyRoleApplications.memberId, set: receipt }).returning();
        return { value: saved!, action: "company_role.applied", entityId: roleId, details: { memberId, version } };
      });
    },
  };
}
