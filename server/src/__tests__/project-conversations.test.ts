import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies, companyMemberships, createDb, issues, projectAccessMembers, projectConversations, projects, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { projectConversationService } from "../services/project-conversations.js";
import { issueService } from "../services/issues.js";
import { projectRoutes } from "../routes/projects.js";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/error-handler.js";

describe("project conversation identity", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("project-conversation-");
    db = createDb(database.connectionString);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
  afterAll(async () => { await db?.$client.end(); await database?.cleanup(); });

  it("creates one durable thread under concurrent requests and rejects cross-project moves", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Conversation test", issuePrefix: `C${companyId.slice(0, 6)}` });
    const [project, anotherProject] = await db.insert(projects).values([
      { companyId, name: "Shared project" }, { companyId, name: "Different project" },
    ]).returning();
    const service = projectConversationService(db);
    expect(await service.get(companyId, project!.id)).toBeNull();
    const results = await Promise.all(Array.from({ length: 4 }, () => service.getOrCreate(companyId, project!.id, "person-one")));
    expect(results.every(Boolean)).toBe(true);
    expect(new Set(results.map((result) => result!.issue.id)).size).toBe(1);
    expect(results.filter((result) => result!.created)).toHaveLength(1);
    const issueId = results[0]!.issue.id;
    expect((await service.get(companyId, project!.id))?.id).toBe(issueId);
    expect(await issueService(db).list(companyId, { projectId: project!.id })).toHaveLength(0);
    expect(await issueService(db).count(companyId, { projectId: project!.id })).toBe(0);
    expect((await issueService(db).list(companyId, { issueIds: [issueId] })).map((issue) => issue.id)).toEqual([issueId]);
    expect(await db.select().from(projectConversations).where(and(
      eq(projectConversations.companyId, companyId), eq(projectConversations.projectId, project!.id),
    ))).toHaveLength(1);
    await expect(db.update(issues).set({ projectId: anotherProject!.id }).where(eq(issues.id, issueId))).rejects.toThrow();
    await expect(issueService(db).update(issueId, { status: "done" })).rejects.toThrow(/shared project conversation/i);
    await expect(issueService(db).update(issueId, { hiddenAt: new Date() })).rejects.toThrow(/shared project conversation/i);
    await expect(issueService(db).update(issueId, { visibility: "private" })).rejects.toThrow(/shared project conversation/i);
    await expect(issueService(db).remove(issueId)).rejects.toThrow();
    expect((await service.get(companyId, project!.id))?.id).toBe(issueId);
    expect(await service.getOrCreate(randomUUID(), project!.id, "person-two")).toBeNull();
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  it("allows project members to resolve the same thread while denying nonmembers and viewer creation", async () => {
    const companyId = randomUUID();
    const members = ["person-a", "person-b", "outsider", "viewer"];
    await db.insert(companies).values({ id: companyId, name: "Access test", issuePrefix: `A${companyId.slice(0, 6)}` });
    await db.insert(companyMemberships).values(members.map((user) => ({ companyId, principalType: "user", principalId: user,
      status: "active", membershipRole: user === "viewer" ? "viewer" : "operator" })));
    const [project] = await db.insert(projects).values({ companyId, name: "Private project", visibility: "private", privacyOwnerUserId: "person-a" }).returning();
    await db.insert(projectAccessMembers).values(["person-a", "person-b", "viewer"].map((user) => ({
      companyId, projectId: project!.id, subjectType: "user", subjectId: user,
    })));
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const userId = req.header("x-test-user") ?? "outsider";
      req.actor = { type: "board", source: "session", userId, companyIds: [companyId],
        memberships: [{ companyId, membershipRole: userId === "viewer" ? "viewer" : "operator", status: "active" }] };
      next();
    });
    app.use("/api", projectRoutes(db));
    app.use("/api", issueRoutes(db));
    app.use(errorHandler);
    const url = `/api/projects/${project!.id}/conversation`;
    expect((await request(app).get(url).set("x-test-user", "person-a")).body).toBeNull();
    expect((await request(app).post(url).set("x-test-user", "viewer")).status).toBe(403);
    expect((await request(app).post(url).set("x-test-user", "outsider")).status).toBe(404);
    const [first, second] = await Promise.all([
      request(app).post(url).set("x-test-user", "person-a"),
      request(app).post(url).set("x-test-user", "person-b"),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.issueId).toBe(second.body.issueId);
    expect((await request(app).get(url).set("x-test-user", "person-b")).body.issueId).toBe(first.body.issueId);
    expect((await request(app).get(url).set("x-test-user", "viewer")).body.issueId).toBe(first.body.issueId);
    expect((await request(app).get(url).set("x-test-user", "outsider")).status).toBe(404);
    const commentsUrl = `/api/issues/${first.body.issueId}/comments`;
    expect((await request(app).post(commentsUrl).set("x-test-user", "person-a").send({ body: "Hello from A" })).status).toBe(201);
    expect((await request(app).post(commentsUrl).set("x-test-user", "person-b").send({ body: "Hello from B" })).status).toBe(201);
    const history = await request(app).get(`${commentsUrl}?order=asc`).set("x-test-user", "person-b");
    expect(history.status).toBe(200);
    expect(history.body.map((comment: { body: string }) => comment.body)).toEqual(["Hello from A", "Hello from B"]);
    expect((await request(app).get(commentsUrl).set("x-test-user", "outsider")).status).toBe(404);
    expect((await request(app).post(commentsUrl).set("x-test-user", "viewer").send({ body: "Not allowed" })).status).toBe(403);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
});
