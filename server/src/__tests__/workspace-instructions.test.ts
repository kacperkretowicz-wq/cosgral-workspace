import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { companies, companyMemberships, projects, createDb, activityLog } from "@paperclipai/db";
import * as activity from "../services/activity-log.js";
import { workspaceInstructionService } from "../services/workspace-instructions.js";
import { workspaceInstructionRoutes } from "../routes/workspace-instructions.js";
import { errorHandler } from "../middleware/error-handler.js";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
let db: ReturnType<typeof createDb>;
let companyId: string, projectId: string;
beforeAll(async () => {
 database = await startEmbeddedPostgresTestDatabase("cosgral18-instructions-"); db = createDb(database.connectionString);
 companyId = randomUUID(); projectId = randomUUID();
 await db.insert(companies).values({ id: companyId, name: "Instructions", issuePrefix: "INS" });
 await db.insert(companyMemberships).values(["alice", "bob"].map(principalId => ({ companyId, principalId, principalType: "user", status: "active", membershipRole: "member" })));
 await db.insert(projects).values({ id: projectId, companyId, name: "Project" });
}, 60000);
afterAll(async () => { await db?.$client.end(); await database?.cleanup(); });
function app(role = "member", userId = "alice", ids = [companyId]) {
 const a = express(); a.use(express.json()); a.use((req, _res, next) => {
 req.actor = { type: "board", source: "session", userId, companyIds: ids, memberships: ids.map(companyId => ({ companyId, status: "active", membershipRole: role })) }; next();
 }); a.use("/api", workspaceInstructionRoutes(db)); a.use(errorHandler); return a;
}
const base = () => `/api/companies/${companyId}/instructions`;
it("saves three separate scopes, isolates people and companies, rejects viewer writes and identity injection", async () => {
 for (const scope of ["company", "me", `projects/${projectId}`]) {
  await request(app()).put(`${base()}/${scope}`).send({ text: `Wskazówka ${scope}` }).expect(200);
  expect((await request(app()).get(`${base()}/${scope}`).expect(200)).body.text).toBe(`Wskazówka ${scope}`);
  expect((await request(app("viewer")).get(`${base()}/${scope === `projects/${projectId}` ? "company" : scope}`).expect(200)).body.canEdit).toBe(false);
  await request(app("viewer")).put(`${base()}/${scope}`).send({ text: "Zmiana" }).expect(403);
 }
 expect((await request(app("member", "bob")).get(`${base()}/me`).expect(200)).body.text).toBe("");
 await request(app("member", "outsider", [])).get(`${base()}/company`).expect(404);
 await request(app()).put(`${base()}/me`).send({ text: "OK", userId: "bob" }).expect(400);
 const events = (await db.select().from(activityLog)).filter(r => r.action === "workspace_instructions.updated");
 expect(events).toHaveLength(3);
 expect(events.every(event => event.details === null)).toBe(true);
});
it("rejects excessive content, credentials and control characters without persisting them", async () => {
 for (const text of ["a".repeat(8001), "api_key=synthetic-test-value", "Bearer synthetic-test-token", "sk-" + "z".repeat(25), "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----", "password: fictional", "x\u0000y"]) {
  await request(app()).put(`${base()}/company`).send({ text }).expect(400);
 }
 expect((await request(app()).get(`${base()}/company`).expect(200)).body.text).toBe("Wskazówka company");
});
it("denies foreign/private projects and missing memberships", async () => {
 await request(app()).get(`${base()}/projects/${randomUUID()}`).expect(404);
 const privateId = randomUUID(); await db.insert(projects).values({ id: privateId, companyId, name: "Private", visibility: "private", privacyOwnerUserId: "other" });
 await request(app()).get(`${base()}/projects/${privateId}`).expect(404);
 const a = express(); a.use(express.json()); a.use((req, _res, next) => { req.actor = { type: "board", source: "session", userId: "alice", companyIds: [companyId] }; next(); }); a.use("/api", workspaceInstructionRoutes(db)); a.use(errorHandler);
 await request(a).put(`${base()}/me`).send({ text: "no" }).expect(403);
});

it("rolls back unauditable writes and preserves company boundaries", async () => {
 const svc = workspaceInstructionService(db), otherId = randomUUID();
 await expect(svc.set(otherId, "company", "alice", { text: "Brak firmy" })).rejects.toThrow();
 expect(await svc.get(otherId, "company")).toEqual({ text: "" });
 await db.insert(companies).values({ id: otherId, name: "Inna firma", issuePrefix: "IN2" });
 await request(app()).put(`/api/companies/${otherId}/instructions/company`).send({ text: "Obca" }).expect(404);
 await expect(svc.set(otherId, `project:${projectId}`, "alice", { text: "Obcy projekt" }, projectId)).rejects.toThrow();
 expect(await svc.markdown(otherId, projectId, "alice")).toBe("");
});

it("rolls the instruction change back if activity persistence fails", async () => {
 const svc = workspaceInstructionService(db), original = await svc.get(companyId, "company");
 const audit = vi.spyOn(activity, "persistActivity").mockRejectedValueOnce(new Error("synthetic audit failure"));
 try { await expect(svc.set(companyId, "company", "alice", { text: "Nie zapisywać bez audytu" })).rejects.toThrow("synthetic audit failure"); }
 finally { audit.mockRestore(); }
 expect(await svc.get(companyId, "company")).toEqual(original);
});
