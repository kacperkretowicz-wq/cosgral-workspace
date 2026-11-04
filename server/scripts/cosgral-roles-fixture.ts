// Wyłącznie izolowany fixture. Iniekcja aktorów nigdy nie trafia do aplikacji produkcyjnej.
import express from "express";
import { createDb, companies, companyMemberships, principalPermissionGrants, agents } from "@paperclipai/db";
import { randomUUID } from "node:crypto";
import { startEmbeddedPostgresTestDatabase } from "../src/__tests__/helpers/embedded-postgres.js";
import { companyRoleRoutes } from "../src/routes/company-roles.js";
import { accessService } from "../src/services/access.js";
import { errorHandler } from "../src/middleware/error-handler.js";
const database = await startEmbeddedPostgresTestDatabase("cosgral19-live-");
const db = createDb(database.connectionString);
const companyId = randomUUID(), otherId = randomUUID(), agentId = randomUUID();
await db.insert(companies).values([{ id: companyId, name: "Role e2e", issuePrefix: "R19" }, { id: otherId, name: "Other", issuePrefix: "O19" }]);
await db.insert(agents).values({ id: agentId, companyId, name: "Fixture bez modelu", role: "engineer", adapterType: "process" });
const members = await db.insert(companyMemberships).values([
 ...["admin", "limited", "scoped", "viewer", "bob"].map(principalId => ({ companyId, principalType: "user", principalId, membershipRole: ["admin", "limited", "scoped"].includes(principalId) ? "admin" : principalId === "viewer" ? "viewer" : "operator" })),
 { companyId, principalType: "agent", principalId: agentId, membershipRole: "member" },
]).returning();
await db.insert(principalPermissionGrants).values([
 ...["admin", "limited", "scoped"].map(principalId => ({ companyId, principalType: "user", principalId, permissionKey: "users:manage_permissions" })),
 { companyId, principalType: "user", principalId: "admin", permissionKey: "agents:create" },
 { companyId, principalType: "user", principalId: "scoped", permissionKey: "agents:create", scope: { projectIds: [randomUUID()] } },
]);
const app = express(); app.use(express.json());
app.use((req, _res, next) => {
 const actor = req.header("x-cosgral-fixture-actor") ?? "admin";
 req.actor = actor === "agent" ? { type: "agent", agentId, companyId, source: "agent_key" }
 : actor === "anonymous" ? { type: "none", source: "none" }
 : { type: "board", source: "session", userId: actor, companyIds: actor === "outsider" ? [] : [companyId] };
 next();
});
app.get("/fixture", (_req, res) => res.json({ companyId, otherId, memberId: members.find(m => m.principalId === "bob")!.id, agentMemberId: members.find(m => m.principalType === "agent")!.id }));
app.get("/fixture/permissions", async (_req, res) => res.json({ user: await accessService(db).hasPermission(companyId, "user", "bob", "agents:create"), agent: await accessService(db).hasPermission(companyId, "agent", agentId, "agents:create") }));
app.use("/api", companyRoleRoutes(db)); app.use(errorHandler);
const server = app.listen(3197, "127.0.0.1", () => console.log("COSGRAL19_READY"));
let closing = false;
async function close() { if (closing) return; closing = true; server.close(); await db.$client.end(); await database.cleanup(); process.exit(0); }
process.once("SIGTERM", () => void close()); process.once("SIGINT", () => void close());
