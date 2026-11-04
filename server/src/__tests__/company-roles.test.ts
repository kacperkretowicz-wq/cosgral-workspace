import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { companies, companyMemberships, principalPermissionGrants, agents, createDb, activityLog } from "@paperclipai/db";
import { companyRoleRoutes } from "../routes/company-roles.js";
import { accessService } from "../services/access.js";
import * as activity from "../services/activity-log.js";
import { errorHandler } from "../middleware/error-handler.js";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>, db: ReturnType<typeof createDb>;
let companyId: string, otherId: string, memberId: string, agentMemberId: string, agentId: string;
beforeAll(async () => {
 database = await startEmbeddedPostgresTestDatabase("cosgral19-roles-"); db = createDb(database.connectionString);
 companyId = randomUUID(); otherId = randomUUID(); agentId = randomUUID();
 await db.insert(companies).values([{ id: companyId, name: "Roles", issuePrefix: "ROL" }, { id: otherId, name: "Other", issuePrefix: "OTH" }]);
 await db.insert(agents).values({ id: agentId, companyId, name: "No model", role: "engineer", adapterType: "process" });
 const members = await db.insert(companyMemberships).values([
 ...["admin", "limited", "scoped", "no-manage", "viewer", "operator", "bob"].map(principalId => ({ companyId, principalType: "user", principalId, membershipRole: ["admin", "limited", "scoped", "no-manage"].includes(principalId) ? "admin" : principalId === "viewer" ? "viewer" : "operator" })),
 { companyId, principalType: "agent", principalId: agentId, membershipRole: "member" },
 ]).returning();
 memberId = members.find(m => m.principalId === "bob")!.id; agentMemberId = members.find(m => m.principalId === agentId)!.id;
 await db.insert(principalPermissionGrants).values([
 ...["admin", "limited", "scoped", "operator"].map(principalId => ({ companyId, principalType: "user", principalId, permissionKey: "users:manage_permissions" })),
 { companyId, principalType: "user", principalId: "admin", permissionKey: "agents:create" },
 { companyId, principalType: "user", principalId: "scoped", permissionKey: "agents:create", scope: { projectId: randomUUID() } },
 ]);
}, 60000);
afterAll(async () => { await db?.$client.end(); await database?.cleanup(); });
function app(userId = "admin", actorType = "board", ids = [companyId]) {
 const a = express(); a.use(express.json()); a.use((req, _res, next) => {
 req.actor = actorType === "board" ? { type: "board", source: "session", userId, companyIds: ids }
 : actorType === "agent" ? { type: "agent", agentId, companyId, source: "agent_key" } : { type: "none", source: "none" }; next();
 }); a.use("/api", companyRoleRoutes(db)); a.use(errorHandler); return a;
}
const base = () => `/api/companies/${companyId}/roles`;
const definition = { name: "Programista", description: "Tworzy agentów", permissions: ["agents:create"] };
let role: any;
it("creates and lists strict company role definitions and rejects unknown permissions/fields", async () => {
 role = (await request(app()).post(base()).send(definition).expect(201)).body;
 expect(role).toMatchObject({ ...definition, version: 1, companyId });
 expect((await request(app("viewer")).get(base()).expect(200)).body).toEqual([role]);
 for (const input of [{ ...definition, permissions: ["root:all"] }, { ...definition, grants: [] }, { ...definition, permissions: ["agents:create", "agents:create"] }, { ...definition, name: " " }]) await request(app()).post(base()).send(input).expect(400);
 await request(app()).post(base()).send(definition).expect(409);
});
it("denies non-admins, missing manage permission, agents, anonymous and foreign companies", async () => {
 for (const user of ["viewer", "operator", "no-manage", "outsider"]) await request(app(user)).post(base()).send(definition).expect(user === "outsider" ? 404 : 403);
 for (const type of ["agent", "none"]) await request(app("admin", type)).post(base()).send(definition).expect(403);
 await request(app()).get(`/api/companies/${otherId}/roles`).expect(404);
 await request(app()).put(`${base()}/${randomUUID()}`).send({ ...definition, version: 1 }).expect(404);
});
it("rejects both missing and scoped grant escalation on create, edit and assignment", async () => {
 for (const user of ["limited", "scoped"]) {
  await request(app(user)).post(base()).send({ ...definition, name: user }).expect(403);
  await request(app(user)).put(`${base()}/${role.id}`).send({ ...definition, version: 1 }).expect(403);
  await request(app(user)).put(`/api/companies/${companyId}/members/${memberId}/custom-role`).send({ roleId: role.id, version: 1 }).expect(403);
 }
});
it("applies real Paperclip grants to a user and agent with a version receipt, without changing base roles", async () => {
 for (const [id, type, principal] of [[memberId, "user", "bob"], [agentMemberId, "agent", agentId]]) {
  const applied = (await request(app()).put(`/api/companies/${companyId}/members/${id}/custom-role`).send({ roleId: role.id, version: 1 }).expect(200)).body;
  expect(applied).toMatchObject({ memberId: id, roleId: role.id, version: 1, permissions: ["agents:create"] });
  expect(await accessService(db).hasPermission(companyId, type as "user" | "agent", principal, "agents:create")).toBe(true);
 }
 const member = await db.query.companyMemberships.findFirst({ where: eq(companyMemberships.id, memberId) });
 expect(member!.membershipRole).toBe("operator");
 const audit = await db.select().from(activityLog).where(eq(activityLog.action, "company_role.applied"));
 expect(audit.map(row => row.details?.memberId).sort()).toEqual([memberId, agentMemberId].sort());
});
it("versions edits without silently extending existing assignments, and rejects stale assignment/edit", async () => {
 role = (await request(app()).put(`${base()}/${role.id}`).send({ name: "Nowa", description: "Pusta", permissions: [], version: 1 }).expect(200)).body;
 expect(role.version).toBe(2);
 expect(await accessService(db).hasPermission(companyId, "user", "bob", "agents:create")).toBe(true);
 await request(app()).put(`${base()}/${role.id}`).send({ ...definition, version: 1 }).expect(409);
 await request(app()).put(`/api/companies/${companyId}/members/${memberId}/custom-role`).send({ roleId: role.id, version: 1 }).expect(409);
 await request(app()).put(`/api/companies/${companyId}/members/${memberId}/custom-role`).send({ roleId: role.id, version: 2 }).expect(200);
 expect(await accessService(db).hasPermission(companyId, "user", "bob", "agents:create")).toBe(false);
});
it("protects built-in admins/viewers, suspended members and cross-company role/member IDs", async () => {
 const members = await db.select().from(companyMemberships).where(eq(companyMemberships.companyId, companyId));
 for (const principal of ["admin", "viewer"]) await request(app()).put(`/api/companies/${companyId}/members/${members.find(m => m.principalId === principal)!.id}/custom-role`).send({ roleId: role.id, version: 2 }).expect(409);
 await request(app()).put(`/api/companies/${companyId}/members/${randomUUID()}/custom-role`).send({ roleId: role.id, version: 2 }).expect(404);
 await request(app()).put(`/api/companies/${companyId}/members/${memberId}/custom-role`).send({ roleId: randomUUID(), version: 2 }).expect(404);
 await db.update(companyMemberships).set({ status: "suspended" }).where(eq(companyMemberships.id, memberId));
 await request(app()).put(`/api/companies/${companyId}/members/${memberId}/custom-role`).send({ roleId: role.id, version: 2 }).expect(409);
 await db.update(companyMemberships).set({ status: "active" }).where(eq(companyMemberships.id, memberId));
});
it("rolls back role edits and grant assignment if audit cannot persist", async () => {
 const granted = (await request(app()).post(base()).send({ ...definition, name: "Do rollbacku" }).expect(201)).body;
 const audit = vi.spyOn(activity, "persistActivity").mockRejectedValue(new Error("synthetic audit failure"));
 try {
  await request(app()).put(`${base()}/${role.id}`).send({ ...definition, version: 2 }).expect(500);
  await request(app()).put(`/api/companies/${companyId}/members/${memberId}/custom-role`).send({ roleId: granted.id, version: 1 }).expect(500);
 } finally { audit.mockRestore(); }
 expect((await request(app()).get(base()).expect(200)).body.find((r: any) => r.id === role.id)).toEqual(role);
 expect(await accessService(db).hasPermission(companyId, "user", "bob", "agents:create")).toBe(false);
});

it("serializes concurrent definition edits, allowing exactly one matching version", async () => {
 const responses = await Promise.all(["Pierwsza", "Druga"].map(name => request(app()).put(`${base()}/${role.id}`).send({ name, description: "Równoczesna edycja", permissions: [], version: 2 })));
 expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
});
it("removes role definitions and application receipts with the company deletion workflow", async () => {
 const { deleteCompany } = await import("../services/company-deletion.js");
 const { companyRoleService } = await import("../services/company-roles.js");
 await db.insert(companyMemberships).values([{ companyId: otherId, principalType: "user", principalId: "admin", membershipRole: "admin" }, { companyId: otherId, principalType: "user", principalId: "bob", membershipRole: "operator" }]);
 await db.insert(principalPermissionGrants).values({ companyId: otherId, principalType: "user", principalId: "admin", permissionKey: "users:manage_permissions" });
 const svc = companyRoleService(db), otherRole = await svc.create(otherId, "admin", { name: "Usuwana", description: "", permissions: [] });
 const member = await accessService(db).getMembership(otherId, "user", "bob");
 await svc.apply(otherId, "admin", member!.id, otherRole.id, 1);
 expect((await deleteCompany(db, otherId))!.id).toBe(otherId);
 expect(await db.query.companies.findFirst({ where: eq(companies.id, otherId) })).toBeUndefined();
});

it("honors the actor company scope even when the user has a stored company membership", async () => {
 await request(app("admin", "board", [])).get(base()).expect(404);
 await request(app("admin", "board", [])).post(base()).send({ ...definition, name: "Poza zakresem tokena" }).expect(404);
});
