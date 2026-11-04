import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityLog, companies, createDb, userWorkspacePreferences } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { workspacePreferenceRoutes } from "../routes/workspace-preferences.js";
import { workspacePreferenceService } from "../services/workspace-preferences.js";

const support = await getEmbeddedPostgresTestSupport();
if (!support.supported) console.warn(`Workspace preference database tests unavailable: ${support.reason}`);

(support.supported ? describe : describe.skip)("personal workspace preferences", () => {
  let db: ReturnType<typeof createDb>;
  let temp: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  beforeAll(async () => {
    temp = await startEmbeddedPostgresTestDatabase("paperclip-workspace-preferences-");
    db = createDb(temp.connectionString);
  }, 30_000);
  afterAll(async () => { await temp?.cleanup(); });

  const actor = (companyId: string, userId: string): Express.Request["actor"] => ({
    type: "board", source: "session", userId, companyIds: [companyId],
    memberships: [{ companyId, membershipRole: "viewer", status: "active" }],
  });
  const app = (identity: Express.Request["actor"]) => {
    const result = express(); result.use(express.json());
    result.use((req, _res, next) => { req.actor = identity; next(); });
    result.use("/api", workspacePreferenceRoutes(db)); result.use(errorHandler);
    return result;
  };
  async function company() {
    const id = randomUUID();
    await db.insert(companies).values({ id, name: "Workspace preference test", issuePrefix: `P${id.slice(0, 7)}` });
    return id;
  }
  const url = (companyId: string) => `/api/companies/${companyId}/workspace-preferences/me`;

  it("persists validated personalization per user without altering workspace mode", async () => {
    const companyId = await company(), userId = randomUUID(), other = randomUUID();
    const path = `/api/companies/${companyId}/workspace-preferences/me/personalization`;
    const prefs = { theme: "system", accent: "violet", sidebarWidth: 280, conversationWidth: 360, detailsOpen: true, views: { [`${companyId}:project`]: "table" } };
    await request(app(actor(companyId, userId))).put(path).send(prefs).expect(200);
    const saved = await request(app(actor(companyId, userId))).get("/api/workspace-preferences/me/personalization").expect(200);
    expect(saved.body).toMatchObject(prefs);
    const isolated = await request(app(actor(companyId, other))).get("/api/workspace-preferences/me/personalization").expect(200);
    expect(isolated.body.accent).toBe("cosgral");
    expect(isolated.body.views).toEqual({});
    expect((await workspacePreferenceService(db).get(userId)).coordinatorWorkspaceEnabled).toBe(false);
    for (const invalid of [{ ...prefs, sidebarWidth: 0 }, { ...prefs, accent: "red" }, { ...prefs, userId: other }, { ...prefs, views: { x: "bad" } }]) {
      await request(app(actor(companyId, userId))).put(path).send(invalid).expect(400);
    }
    await request(app(actor(companyId, userId))).put(path.replace(companyId, randomUUID())).send(prefs).expect(403);
  });

  it("denies agent and anonymous personalization access and rolls back an unauditable save", async () => {
    const companyId = await company(), userId = randomUUID();
    const path = `/api/companies/${companyId}/workspace-preferences/me/personalization`;
    for (const identity of [{ type: "none", source: "none" }, { type: "agent", source: "agent_key", companyId, agentId: randomUUID() }] as Express.Request["actor"][]) {
      await request(app(identity)).get("/api/workspace-preferences/me/personalization").expect(403);
      await request(app(identity)).put(path).send({ accent: "violet" }).expect(403);
    }
    const svc = workspacePreferenceService(db);
    const original = await svc.getPersonalization(userId);
    await expect(svc.setPersonalization(randomUUID(), userId, { ...original, accent: "violet" })).rejects.toThrow();
    expect(await svc.getPersonalization(userId)).toEqual(original);
  });

  it("defaults to classic without creating a row", async () => {
    const userId = randomUUID();
    expect(await workspacePreferenceService(db).get(userId)).toEqual({ userId, coordinatorWorkspaceEnabled: false, updatedAt: null });
    expect(await db.select().from(userWorkspacePreferences).where(eq(userWorkspacePreferences.userId, userId))).toHaveLength(0);
  });

  it("lets a viewer opt in and out across companies without changing another person's choice", async () => {
    const first = await company(), second = await company(), userId = randomUUID(), otherUser = randomUUID();
    await request(app(actor(first, userId))).put(url(first)).send({ coordinatorWorkspaceEnabled: true }).expect(200);
    const response = await request(app(actor(second, userId))).get("/api/workspace-preferences/me").expect(200);
    expect(response.body).toMatchObject({ userId, coordinatorWorkspaceEnabled: true });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect((await request(app(actor(first, otherUser))).get("/api/workspace-preferences/me").expect(200)).body.coordinatorWorkspaceEnabled).toBe(false);
    await request(app(actor(second, userId))).put(url(second)).send({ coordinatorWorkspaceEnabled: false }).expect(200);
    expect((await workspacePreferenceService(db).get(userId)).coordinatorWorkspaceEnabled).toBe(false);
    const events = await db.select().from(activityLog).where(and(eq(activityLog.actorId, userId), eq(activityLog.action, "workspace_preferences.updated")));
    expect(events).toHaveLength(2);
    expect(events.map(event => event.companyId).sort()).toEqual([first, second].sort());
    expect(events.every(event => event.details === null && event.entityType === "user_preference")).toBe(true);
  });

  it("rejects foreign company audit scopes, inactive membership, anonymous/agent callers and identity injection", async () => {
    const companyId = await company(), foreignId = await company(), userId = randomUUID();
    await request(app(actor(companyId, userId))).put(url(foreignId)).send({ coordinatorWorkspaceEnabled: true }).expect(403);
    await request(app({ ...actor(companyId, userId), memberships: [] })).put(url(companyId)).send({ coordinatorWorkspaceEnabled: true }).expect(403);
    await request(app(actor(companyId, userId))).put(url(companyId)).send({ coordinatorWorkspaceEnabled: true, userId: "someone-else" }).expect(400);
    await request(app({ type: "none", source: "none" })).get("/api/workspace-preferences/me").expect(403);
    await request(app({ type: "agent", source: "agent_key", companyId, agentId: randomUUID() })).get("/api/workspace-preferences/me").expect(403);
    expect((await workspacePreferenceService(db).get(userId)).coordinatorWorkspaceEnabled).toBe(false);
  });

  it("uses the explicit local board principal without creating a signed-in user's setting", async () => {
    const companyId = await company();
    const local: Express.Request["actor"] = { type: "board", source: "local_implicit", userId: "local-board", isInstanceAdmin: true };
    await request(app(local)).put(url(companyId)).send({ coordinatorWorkspaceEnabled: true }).expect(200);
    expect((await request(app(local)).get("/api/workspace-preferences/me").expect(200)).body).toMatchObject({ userId: "local-board", coordinatorWorkspaceEnabled: true });
    expect((await workspacePreferenceService(db).get(randomUUID())).coordinatorWorkspaceEnabled).toBe(false);
  });

  it("rolls the preference back when the audit cannot be persisted", async () => {
    const userId = randomUUID();
    await expect(workspacePreferenceService(db).set(randomUUID(), userId, true)).rejects.toThrow();
    expect(await workspacePreferenceService(db).get(userId)).toEqual({ userId, coordinatorWorkspaceEnabled: false, updatedAt: null });
  });
});
