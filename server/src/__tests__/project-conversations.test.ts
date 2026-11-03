import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, activityLog, companies, companyMemberships, createDb, heartbeatRuns, issues, projectAccessMembers, projectConversations, projects, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { projectConversationService } from "../services/project-conversations.js";
import { issueService } from "../services/issues.js";
import { projectRoutes } from "../routes/projects.js";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/error-handler.js";

const { wakeup } = vi.hoisted(() => ({ wakeup: vi.fn(async (..._args: unknown[]) => null) }));
vi.mock("../services/heartbeat.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../services/heartbeat.js")>();
  return { ...actual, heartbeatService: (...args: Parameters<typeof actual.heartbeatService>) => ({ ...actual.heartbeatService(...args), wakeup }) };
});

describe("project conversation identity", () => {
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("project-conversation-");
    db = createDb(database.connectionString);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
  afterAll(async () => { await db?.$client.end(); await database?.cleanup(); });

  it("creates the first selection atomically and preserves execution ownership during a run", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Selection test", issuePrefix: `S${companyId.slice(0, 6)}` });
    const [project] = await db.insert(projects).values({ companyId, name: "Selection" }).returning();
    const [agent] = await db.insert(agents).values({ companyId, name: "Any compatible adapter", role: "general", adapterType: "process" }).returning();
    const service = projectConversationService(db);
    const hooks = { authorize: vi.fn(async () => {}), changed: vi.fn(async () => {}) };
    const selected = await service.setCoordinator(companyId, project!.id, "owner", agent!.id, hooks);
    expect(selected?.assigneeAgentId).toBe(agent!.id);
    expect(hooks.changed).toHaveBeenCalledTimes(1);
    const [run] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, issueId: selected!.id, status: "running" }).returning();
    await db.update(issues).set({ status: "in_review", executionRunId: run!.id }).where(eq(issues.id, selected!.id));
    expect((await service.setCoordinator(companyId, project!.id, "owner", agent!.id, hooks))?.assigneeAgentId).toBe(agent!.id);
    await expect(service.setCoordinator(companyId, project!.id, "owner", null, hooks)).rejects.toThrow(/execution|run/i);
    expect((await service.get(companyId, project!.id))?.assigneeAgentId).toBe(agent!.id);
    expect(hooks.changed).toHaveBeenCalledTimes(1);
    await db.update(issues).set({ executionRunId: null }).where(eq(issues.id, selected!.id));
    await db.update(issues).set({ checkoutRunId: run!.id }).where(eq(issues.id, selected!.id));
    await expect(service.setCoordinator(companyId, project!.id, "owner", null, hooks)).rejects.toThrow(/execution|run/i);
    await db.update(issues).set({ checkoutRunId: null, status: "in_progress" }).where(eq(issues.id, selected!.id));
    await expect(service.setCoordinator(companyId, project!.id, "owner", null, hooks)).rejects.toThrow(/execution|run/i);
    await db.update(issues).set({ status: "in_review" }).where(eq(issues.id, selected!.id));
    // A failed event write must roll back assignment and its visible comment.
    await expect(service.setCoordinator(companyId, project!.id, "owner", null, {
      ...hooks, changed: async () => { throw new Error("audit unavailable"); },
    })).rejects.toThrow("audit unavailable");
    expect((await service.get(companyId, project!.id))?.assigneeAgentId).toBe(agent!.id);
    expect(await issueService(db).listComments(selected!.id)).toHaveLength(1);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

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
    const [coordinator] = await db.insert(agents).values({ companyId, name: "Coordinator", role: "general", adapterType: "codex_local" }).returning();
    const [foreignCompany] = await db.insert(companies).values({ name: "Foreign", issuePrefix: `F${companyId.slice(0, 6)}` }).returning();
    const [foreignAgent] = await db.insert(agents).values({ companyId: foreignCompany!.id, name: "Foreign", role: "general" }).returning();
    const choose = `${url}/coordinator`;
    expect((await request(app).put(choose).set("x-test-user", "viewer").send({ agentId: coordinator!.id })).status).toBe(403);
    expect((await request(app).put(choose).set("x-test-user", "person-b").send({ agentId: coordinator!.id })).status).toBe(403);
    expect((await request(app).put(choose).set("x-test-user", "outsider").send({ agentId: coordinator!.id })).status).toBe(404);
    expect((await request(app).put(choose).set("x-test-user", "person-a").send({ agentId: foreignAgent!.id })).status).toBe(422);
    // Private project membership is required for the selected agent too.
    expect((await request(app).put(choose).set("x-test-user", "person-a").send({ agentId: coordinator!.id })).status).toBe(422);
    await db.insert(projectAccessMembers).values({ companyId, projectId: project!.id, subjectType: "agent", subjectId: coordinator!.id });
    await db.update(agents).set({ status: "paused" }).where(eq(agents.id, coordinator!.id));
    expect((await request(app).put(choose).set("x-test-user", "person-a").send({ agentId: coordinator!.id })).status).toBe(422);
    await db.update(agents).set({ status: "idle" }).where(eq(agents.id, coordinator!.id));
    wakeup.mockClear();
    const selected = await request(app).put(choose).set("x-test-user", "person-a").send({ agentId: coordinator!.id });
    expect(selected.status).toBe(200);
    expect(selected.body.coordinatorAgentId).toBe(coordinator!.id);
    expect(selected.body.canManageCoordinator).toBe(true);
    expect(wakeup).not.toHaveBeenCalled();
    const persisted = await issueService(db).getById(first.body.issueId);
    expect(persisted?.assigneeAgentId).toBe(coordinator!.id);
    expect(persisted?.conversationAgentId).toBeNull();
    expect(persisted?.status).toBe("todo");
    expect((await request(app).get(url).set("x-test-user", "person-b")).body).toMatchObject({ coordinatorAgentId: coordinator!.id, canManageCoordinator: false });
    expect(await db.select().from(activityLog).where(and(eq(activityLog.entityId, first.body.issueId), eq(activityLog.action, "project.conversation_coordinator_changed")))).toHaveLength(1);
    // Same selection is idempotent, with no extra event/comment.
    expect((await request(app).put(choose).set("x-test-user", "person-a").send({ agentId: coordinator!.id })).status).toBe(200);
    await expect(issueService(db).update(first.body.issueId, { assigneeAgentId: null })).rejects.toThrow(/coordinator/i);
    expect((await request(app).patch(`/api/issues/${first.body.issueId}`).set("x-test-user", "person-b").send({ assigneeAgentId: null })).status).toBe(409);
    const [worker] = await db.insert(agents).values({ companyId, name: "Worker", role: "general", adapterType: "process", reportsTo: coordinator!.id }).returning();
    await db.insert(projectAccessMembers).values({ companyId, projectId: project!.id, subjectType: "agent", subjectId: worker!.id });
    wakeup.mockClear();
    const delegated = await request(app).post(`/api/companies/${companyId}/issues`).set("x-test-user", "person-a").send({
      title: "Delegate", parentId: first.body.issueId, projectId: project!.id, status: "todo", assigneeAgentId: worker!.id,
      description: `Source conversation: /issues/${first.body.issueId}`, idempotencyKey: "test-delegation-v1",
    });
    expect(delegated.status).toBe(201);
    const child = delegated.body;
    await vi.waitFor(() => expect(wakeup).toHaveBeenCalledWith(worker!.id, expect.objectContaining({
      reason: "issue_assigned", contextSnapshot: expect.objectContaining({ issueId: child.id }),
    })));
    expect(await issueService(db).getWakeableParentAfterChildCompletion(first.body.issueId)).toBeNull();
    // An unrelated open child must not suppress a completed delegation report.
    const pending = await issueService(db).create(companyId, {
      title: "Another request", parentId: first.body.issueId, projectId: project!.id, status: "todo",
    });
    wakeup.mockClear();
    expect((await request(app).patch(`/api/issues/${child.id}`).set("x-test-user", "person-a").send({ status: "done" })).status).toBe(200);
    await vi.waitFor(() => expect(wakeup).toHaveBeenCalledWith(coordinator!.id, expect.objectContaining({
      reason: "issue_children_completed", contextSnapshot: expect.objectContaining({ issueId: first.body.issueId, completedChildIssueId: child.id }),
    })));
    await issueService(db).update(pending.id, { status: "cancelled" });
    expect((await issueService(db).getWakeableParentAfterChildCompletion(first.body.issueId))?.assigneeAgentId).toBe(coordinator!.id);
    expect(child.projectId).toBe(project!.id);
    await issueService(db).release(first.body.issueId, coordinator!.id);
    expect((await issueService(db).getById(first.body.issueId))?.assigneeAgentId).toBe(coordinator!.id);
    wakeup.mockClear();
    const requestId = randomUUID();
    const sent = await request(app).post(`/api/issues/${first.body.issueId}/comments`).set("x-test-user", "person-b").send({ body: "Delegate this work", clientRequestId: requestId });
    expect(sent.status).toBe(201);
    await vi.waitFor(() => expect(wakeup).toHaveBeenCalledWith(coordinator!.id, expect.objectContaining({
      reason: "issue_commented", contextSnapshot: expect.objectContaining({ issueId: first.body.issueId, wakeCommentId: sent.body.id }),
    })));
    const count = wakeup.mock.calls.length;
    const repeated = await request(app).post(`/api/issues/${first.body.issueId}/comments`).set("x-test-user", "person-b").send({ body: "Delegate this work", clientRequestId: requestId });
    expect(repeated.body.id).toBe(sent.body.id);
    expect(wakeup.mock.calls).toHaveLength(count);
    // Remove the coordinator before unrelated existing comment-access checks.
    expect((await request(app).put(choose).set("x-test-user", "person-a").send({ agentId: null })).status).toBe(200);
    await expect(issueService(db).checkout(first.body.issueId, coordinator!.id, ["backlog"], null)).rejects.toThrow();
    const commentsUrl = `/api/issues/${first.body.issueId}/comments`;
    expect((await request(app).post(commentsUrl).set("x-test-user", "person-a").send({ body: "Hello from A" })).status).toBe(201);
    expect((await request(app).post(commentsUrl).set("x-test-user", "person-b").send({ body: "Hello from B" })).status).toBe(201);
    const history = await request(app).get(`${commentsUrl}?order=asc`).set("x-test-user", "person-b");
    expect(history.status).toBe(200);
    expect(history.body.slice(-2).map((comment: { body: string }) => comment.body)).toEqual(["Hello from A", "Hello from B"]);
    expect(history.body.filter((comment: { body: string }) => /Koordynator/.test(comment.body))).toHaveLength(2);
    expect((await request(app).get(commentsUrl).set("x-test-user", "outsider")).status).toBe(404);
    expect((await request(app).post(commentsUrl).set("x-test-user", "viewer").send({ body: "Not allowed" })).status).toBe(403);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
});
