import { allowAgentMessageWake } from "../services/project-message-wakeup.js";
import { projectConversationRoster } from "../services/heartbeat/project-conversation-roster.js";
import { issueThreadInteractionService } from "../services/issue-thread-interactions.js";
import { buildPaperclipTaskMarkdown } from "../services/heartbeat/task-markdown.js";
import { authorizeProjectPresence } from "../realtime/project-conversation-presence.js";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, activityLog, companies, companyMemberships, createDb, heartbeatRuns, issueComments, issueThreadInteractions, issues, projectAccessMembers, projectConversations, projects, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { settleProjectConversationTurn } from "../services/heartbeat/project-conversation-turn.js";
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

  it("limits concurrent conversation children atomically and preserves idempotency", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Parallel", issuePrefix: `L${companyId.slice(0, 6)}` });
    const [project] = await db.insert(projects).values({ companyId, name: "Parallel" }).returning();
    const conversation = (await projectConversationService(db).getOrCreate(companyId, project!.id, "owner"))!.issue;
    const svc = issueService(db);
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => svc.create(companyId, {
      title: `Parallel ${i}`, parentId: conversation.id, projectId: project!.id, status: "todo", idempotencyKey: `parallel-${i}`,
    })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(4);
    const denied = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(denied.reason).toMatchObject({ status: 422, details: { code: "project_conversation_child_limit" } });
    const comments = await svc.listComments(conversation.id);
    expect(comments.some(c => c.body.includes("Limit") && c.body.includes("4"))).toBe(true);
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: "owner", status: "active", membershipRole: "operator" });
    const [worker] = await db.insert(agents).values({ companyId, name: "Worker", adapterType: "process" }).returning();
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.actor = { type: "board", source: "session", userId: "owner", companyIds: [companyId],
      memberships: [{ companyId, membershipRole: "operator", status: "active" }] }; next(); });
    app.use("/api", issueRoutes(db)); app.use(errorHandler);
    const deniedHttp = await request(app).post(`/api/companies/${companyId}/issues`).send({ title: "Overflow HTTP",
      projectId: project!.id, parentId: conversation.id, status: "todo", assigneeAgentId: worker!.id });
    expect(deniedHttp.status).toBe(422);
    expect((await svc.listComments(conversation.id)).some(c => c.id === deniedHttp.body.details.commentId)).toBe(true);
    const proposal = await request(app).post(`/api/issues/${conversation.id}/interactions`).send({ kind: "suggest_tasks", resolverPolicy: "human_only",
      payload: { version: 1, defaultParentId: conversation.id, tasks: [{ clientKey: "overflow", title: "Overflow suggestion", projectId: project!.id, assigneeAgentId: worker!.id }] } });
    expect(proposal.status).toBe(201);
    const deniedSuggestion = await request(app).post(`/api/issues/${conversation.id}/interactions/${proposal.body.id}/accept`).send({});
    expect(deniedSuggestion.status).toBe(422);
    expect((await svc.listComments(conversation.id)).some(c => c.id === deniedSuggestion.body.details.commentId)).toBe(true);
    expect((await issueThreadInteractionService(db).getById(proposal.body.id))?.status).toBe("pending");
    const accepted = results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof svc.create>>>;
    const index = results.indexOf(accepted);
    expect((await svc.create(companyId, { title: `Parallel ${index}`, parentId: conversation.id, projectId: project!.id,
      status: "todo", idempotencyKey: `parallel-${index}` })).id).toBe(accepted.value.id);
    await svc.update(accepted.value.id, { status: "done" });
    expect((await svc.createChild(conversation.id, { title: "Freed slot", status: "todo" })).issue.parentId).toBe(conversation.id);
  });

  it("keeps exactly one completion wake when sibling transactions finish concurrently", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Completion race", issuePrefix: `W${companyId.slice(0, 6)}` });
    const [project] = await db.insert(projects).values({ companyId, name: "Race" }).returning();
    const [agent] = await db.insert(agents).values({ companyId, name: "Coordinator", adapterType: "process" }).returning();
    const conversation = (await projectConversationService(db).getOrCreate(companyId, project!.id, "owner"))!.issue;
    await db.update(issues).set({ assigneeAgentId: agent!.id, status: "todo" }).where(eq(issues.id, conversation.id));
    const svc = issueService(db);
    const children = await Promise.all(["a", "b"].map(title => svc.create(companyId, { title, parentId: conversation.id, projectId: project!.id, status: "todo" })));
    const wakes = await Promise.all(children.map(child => db.transaction(async tx => {
      const service = issueService(tx as unknown as typeof db);
      const completed = await service.update(child.id, { status: "done" });
      expect(completed?.status).toBe("done");
      await tx.execute(sql`select pg_sleep(0.05)`);
      return service.getWakeableParentAfterChildCompletion(conversation.id, { issueId: child.id, summary: null });
    })));
    expect(wakes.filter(Boolean)).toHaveLength(1);
    expect(wakes.find(Boolean)?.childIssueIds.toSorted()).toEqual(children.map(child => child.id).toSorted());
  });

  it("projects child messages and task events with access checks and stops agent reply wakes", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Messages", issuePrefix: `M${companyId.slice(0, 6)}` });
    await db.insert(companyMemberships).values(["owner", "viewer"].map(principalId => ({ companyId, principalType: "user", principalId, status: "active", membershipRole: principalId === "viewer" ? "viewer" : "operator" })));
    const [project] = await db.insert(projects).values({ companyId, name: "Messages", visibility: "private", privacyOwnerUserId: "owner" }).returning();
    const [coordinator, worker, outsider] = await db.insert(agents).values(["Coordinator", "Worker", "Outsider"].map(name => ({ companyId, name, adapterType: "process" }))).returning();
    await db.insert(projectAccessMembers).values([
      ...[coordinator!, worker!].map(a => ({ companyId, projectId: project!.id, subjectType: "agent", subjectId: a.id })),
      ...["owner", "viewer"].map(subjectId => ({ companyId, projectId: project!.id, subjectType: "user", subjectId })),
    ]);
    const conversation = (await projectConversationService(db).getOrCreate(companyId, project!.id, "owner"))!.issue;
    await db.update(issues).set({ assigneeAgentId: coordinator!.id }).where(eq(issues.id, conversation.id));
    const child = await issueService(db).create(companyId, { title: "Delegated work", projectId: project!.id, parentId: conversation.id, assigneeAgentId: worker!.id, status: "todo" });
    const [sourceRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: coordinator!.id, issueId: conversation.id, status: "running" }).returning();
    let actorAgent = coordinator!.id; let actorRun = sourceRun!.id;
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      req.actor = req.header("x-test-user") ? { type: "board", source: "session", userId: req.header("x-test-user")!, companyIds: [companyId], memberships: [{ companyId, membershipRole: req.header("x-test-user") === "viewer" ? "viewer" : "operator", status: "active" }] } : { type: "agent", source: "agent_jwt", companyId, agentId: actorAgent, runId: actorRun };
      next();
    }); app.use("/api", issueRoutes(db)); app.use(errorHandler);
    const childUrl = `/api/issues/${child.id}/comments`;
    const historyUrl = `/api/issues/${conversation.id}/project-history`;
    wakeup.mockClear();
    const sent = await request(app).post(childUrl).send({ body: "Sprawdź obsługę błędów GPU" });
    expect(sent.status).toBe(201);
    expect(sent.body.metadata.recipientAgentId).toBe(worker!.id);
    await vi.waitFor(() => expect(wakeup).toHaveBeenCalledWith(worker!.id, expect.objectContaining({ reason: "issue_commented" })));
    const audit = await request(app).post(childUrl).send({ body: "Audyt GPU", messageKind: "audit" });
    expect(audit.status).toBe(201);
    expect(audit.body.metadata.messageKind).toBe("audit");
    await vi.waitFor(() => expect(wakeup).toHaveBeenCalledWith(worker!.id, expect.objectContaining({ contextSnapshot: expect.objectContaining({ wakeCommentId: audit.body.id }) })));
    const [replyRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: worker!.id, issueId: child.id, status: "running", contextSnapshot: { wakeReason: "issue_commented", wakeCommentId: sent.body.id } }).returning();
    actorAgent = worker!.id; actorRun = replyRun!.id;
    wakeup.mockClear();
    const replied = await request(app).post(`/api/issues/${conversation.id}/comments`).send({ body: "Sprawdzam GPU" });
    expect(replied.status).toBe(201);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(wakeup).not.toHaveBeenCalled();
    // PATCH with comment cannot extend the same reply chain either.
    const patched = await request(app).patch(`/api/issues/${conversation.id}`).send({ comment: "Druga odpowiedź GPU" });
    expect([200, 403]).toContain(patched.status);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(wakeup).not.toHaveBeenCalled();
    expect(await allowAgentMessageWake(db, companyId, conversation.id, worker!.id, replyRun!.id)).toBe(false);
    expect(await allowAgentMessageWake(db, companyId, conversation.id, worker!.id, sourceRun!.id)).toBe(false);
    expect(await allowAgentMessageWake(db, companyId, conversation.id, worker!.id, null)).toBe(false);
    expect(await allowAgentMessageWake(db, companyId, child.id, coordinator!.id, sourceRun!.id)).toBe(true);
    const [humanSource] = await db.insert(issueComments).values({ companyId, issueId: conversation.id, body: "Człowiek", authorUserId: "owner" }).returning();
    await db.update(heartbeatRuns).set({ contextSnapshot: { wakeReason: "issue_commented", wakeCommentId: humanSource!.id } }).where(eq(heartbeatRuns.id, sourceRun!.id));
    expect(await allowAgentMessageWake(db, companyId, child.id, coordinator!.id, sourceRun!.id)).toBe(true);
    const privateChild = await issueService(db).create(companyId, { title: "Private report", projectId: project!.id, parentId: conversation.id, visibility: "private", createdByUserId: "owner" });
    await issueService(db).addComment(privateChild.id, "PRIVATE-CONTENT", { userId: "owner" });
    const [otherProject] = await db.insert(projects).values({ companyId, name: "Other project" }).returning();
    const otherChild = await issueService(db).create(companyId, { title: "Outside project", projectId: otherProject!.id, parentId: conversation.id });
    await issueService(db).addComment(otherChild.id, "OTHER-PROJECT", { userId: "owner" });
    const [failedRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: worker!.id, issueId: child.id, status: "failed", error: "SECRET-RAW-RUNTIME" }).returning();
    await db.insert(activityLog).values({ companyId, actorType: "agent", actorId: coordinator!.id, action: "issue.created", entityType: "issue", entityId: child.id, details: { status: "todo" } });
    await db.insert(activityLog).values({ companyId, actorType: "agent", actorId: worker!.id, action: "issue.updated", entityType: "issue", entityId: child.id, details: { status: "done", _previous: { status: "todo" } } });
    const history = await request(app).get(historyUrl).set("x-test-user", "viewer");
    expect(history.status).toBe(200);
    expect(history.body.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: audit.body.id, category: "errors", messageKind: "audit" }),
      expect.objectContaining({ id: sent.body.id, category: "agents", authorAgentId: coordinator!.id, recipientAgentId: worker!.id }),
      expect.objectContaining({ kind: "task", category: "tasks", body: expect.stringContaining("done") }),
    ]));
    // Project membership can grant inherited private-child access. Match the
    // canonical issue endpoint rather than inventing a stricter projection ACL.
    const privateRead = await request(app).get(`/api/issues/${privateChild.id}`).set("x-test-user", "viewer");
    expect(JSON.stringify(history.body).includes("PRIVATE-CONTENT")).toBe(privateRead.status === 200);
    expect(JSON.stringify(history.body)).not.toContain("OTHER-PROJECT");
    expect(JSON.stringify(history.body)).not.toContain("SECRET-RAW-RUNTIME");
    expect(history.body.entries).toContainEqual(expect.objectContaining({ id: failedRun!.id, category: "errors" }));
    expect((await request(app).get(`${historyUrl}?cursor=broken`).set("x-test-user", "viewer")).status).toBe(422);
    // Stored recipient survives reassignment; deleted rows never leak content.
    await db.update(issues).set({ assigneeAgentId: coordinator!.id }).where(eq(issues.id, child.id));
    const reread = await request(app).get(historyUrl).set("x-test-user", "viewer");
    expect(reread.body.entries.find((e: { id: string }) => e.id === sent.body.id).recipientAgentId).toBe(worker!.id);
    const batch = await db.insert(issueComments).values(Array.from({ length: 47 }, (_, n) => ({ companyId, issueId: child.id, body: `Page ${n}`, authorUserId: "owner", createdAt: new Date("2026-11-04T11:00:00Z") }))).returning();
    const [fractional] = await db.insert(issueComments).values({ companyId, issueId: child.id, body: "Fractional boundary", authorUserId: "owner", createdAt: new Date("2026-11-04T11:00:00.100Z") }).returning();
    const allEntries: Array<{ id: string }> = []; let cursor: string | null = null;
    do {
      const page = await request(app).get(`${historyUrl}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`).set("x-test-user", "viewer");
      expect(page.status).toBe(200); allEntries.push(...page.body.entries); cursor = page.body.nextCursor;
    } while (cursor);
    expect(new Set(allEntries.map(e => e.id)).size).toBe(allEntries.length);
    expect(batch.every(c => allEntries.some(e => e.id === c.id))).toBe(true);
    expect(allEntries.some(e => e.id === fractional!.id)).toBe(true);
    await db.update(issueComments).set({ deletedAt: new Date() }).where(eq(issueComments.id, sent.body.id));
    expect(JSON.stringify((await request(app).get(historyUrl).set("x-test-user", "viewer")).body)).not.toContain(sent.body.body);
    expect((await request(app).post(childUrl).set("x-test-user", "viewer").send({ body: "deny" })).status).toBe(403);
    actorAgent = outsider!.id;
    expect((await request(app).get(historyUrl)).status).toBe(404);
    actorAgent = coordinator!.id; actorRun = sourceRun!.id;
    const spoof = await request(app).post(childUrl).send({ body: "spoof", metadata: { version: 1, recipientAgentId: coordinator!.id, sections: [{ rows: [{ type: "text", text: "spoof" }] }] } });
    expect([400, 403]).toContain(spoof.status);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

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

  it("reports no-op turns even with a claimed delegation, but accepts persisted actions and completion reports", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Silent turn", issuePrefix: `T${companyId.slice(0, 6)}` });
    const [project] = await db.insert(projects).values({ companyId, name: "Silent" }).returning();
    const [agent] = await db.insert(agents).values({ companyId, name: "Coordinator", role: "general" }).returning();
    const issue = await projectConversationService(db).setCoordinator(companyId, project!.id, "owner", agent!.id, {
      authorize: async () => {}, changed: async () => {},
    });
    const [run] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, issueId: issue!.id, status: "succeeded", contextSnapshot: { wakeReason: "issue_children_completed", completedChildIssueId: randomUUID() } }).returning();
    await settleProjectConversationTurn(db, run!);
    await settleProjectConversationTurn(db, run!);
    const notices = await db.select().from(issueComments).where(and(eq(issueComments.issueId, issue!.id), eq(issueComments.authorType, "system")));
    expect(notices).toHaveLength(1);
    expect(notices[0]!.body).toMatch(/^Błąd/);
    const [replyRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, issueId: issue!.id, status: "succeeded" }).returning();
    await db.insert(issueComments).values({ companyId, issueId: issue!.id, authorAgentId: agent!.id, authorType: "agent", createdByRunId: replyRun!.id, body: "Delegated and verified" });
    const [otherProject] = await db.insert(projects).values({ companyId, name: "Unrelated" }).returning();
    await db.insert(issues).values([
      { companyId, projectId: project!.id, parentId: issue!.id, title: "Old delegation", originRunId: run!.id, createdByAgentId: agent!.id },
      { companyId, projectId: project!.id, title: "Wrong parent", originRunId: replyRun!.id, createdByAgentId: agent!.id },
      { companyId, projectId: otherProject!.id, parentId: issue!.id, title: "Wrong project", originRunId: replyRun!.id, createdByAgentId: agent!.id },
    ]);
    await settleProjectConversationTurn(db, replyRun!);
    await settleProjectConversationTurn(db, replyRun!);
    const noticesAfterClaim = await db.select().from(issueComments).where(and(eq(issueComments.issueId, issue!.id), eq(issueComments.authorType, "system")));
    expect(noticesAfterClaim).toHaveLength(2);
    expect(noticesAfterClaim.find(comment => comment.createdByRunId === replyRun!.id)?.body).toMatch(/Błąd.*delegowania/);

    const [actionRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, issueId: issue!.id, status: "succeeded" }).returning();
    const [child] = await db.insert(issues).values({ companyId, projectId: project!.id, parentId: issue!.id,
      title: "Persisted delegation", status: "done", originRunId: actionRun!.id, createdByAgentId: agent!.id }).returning();
    await db.insert(issueComments).values({ companyId, issueId: issue!.id, authorAgentId: agent!.id, authorType: "agent", createdByRunId: actionRun!.id, body: "Delegated" });
    await settleProjectConversationTurn(db, actionRun!);

    const [completionRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, issueId: issue!.id,
      status: "succeeded", contextSnapshot: { completedChildIssueId: child!.id } }).returning();
    await db.insert(issueComments).values({ companyId, issueId: issue!.id, authorAgentId: agent!.id, authorType: "agent", createdByRunId: completionRun!.id, body: "Verified done" });
    await settleProjectConversationTurn(db, completionRun!);

    const [proposalRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, issueId: issue!.id, status: "succeeded" }).returning();
    await db.insert(issueThreadInteractions).values({ companyId, issueId: issue!.id, kind: "suggest_tasks",
      sourceRunId: proposalRun!.id, createdByAgentId: agent!.id, payload: { version: 1, tasks: [] } });
    await db.insert(issueComments).values({ companyId, issueId: issue!.id, authorAgentId: agent!.id, authorType: "agent", createdByRunId: proposalRun!.id, body: "Waiting for approval" });
    await settleProjectConversationTurn(db, proposalRun!);

    const [updateRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, issueId: issue!.id, status: "succeeded" }).returning();
    await db.insert(activityLog).values({ companyId, actorType: "agent", actorId: agent!.id, agentId: agent!.id,
      runId: updateRun!.id, entityType: "issue", entityId: child!.id, action: "issue.updated" });
    await db.insert(issueComments).values({ companyId, issueId: issue!.id, authorAgentId: agent!.id, authorType: "agent", createdByRunId: updateRun!.id, body: "Updated existing child" });
    await settleProjectConversationTurn(db, updateRun!);
    expect(await db.select().from(issueComments).where(and(eq(issueComments.issueId, issue!.id), eq(issueComments.authorType, "system")))).toHaveLength(2);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  it("accepts informational turns and requires API effects only for declared actions or required reports", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Turn intent", issuePrefix: `I${companyId.slice(0, 6)}` });
    const [project] = await db.insert(projects).values({ companyId, name: "Intent" }).returning();
    const [agent] = await db.insert(agents).values({ companyId, name: "Coordinator", role: "general" }).returning();
    const issue = await projectConversationService(db).setCoordinator(companyId, project!.id, "owner", agent!.id, { authorize: async () => {}, changed: async () => {} });
    const [child] = await db.insert(issues).values({ companyId, projectId: project!.id, parentId: issue!.id, title: "Finished", status: "done" }).returning();
    for (const [body, contextSnapshot, error] of [
      ["Projekt służy do zarządzania zadaniami.", {}, false],
      ["Delegowanie oznacza przypisanie zadania wykonawcy.", {}, false],
      [null, {}, false],
      ["Utworzę zadanie i deleguję je wykonawcy.", {}, true],
      ["I will delegate this task.", {}, true],
      [null, { completedChildIssueId: child!.id, wakeReason: "issue_children_completed" }, true],
      ["I will delegate this task.", { completedChildIssueId: child!.id, wakeReason: "issue_children_completed" }, true],
      ["Zadanie ukończone; wynik jest dostępny.", { completedChildIssueId: child!.id, wakeReason: "issue_children_completed" }, false],
    ] as const) {
      const [run] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, issueId: issue!.id, status: "succeeded", contextSnapshot }).returning();
      if (body) await db.insert(issueComments).values({ companyId, issueId: issue!.id, authorAgentId: agent!.id, authorType: "agent", createdByRunId: run!.id, body });
      await settleProjectConversationTurn(db, run!);
      await settleProjectConversationTurn(db, run!);
      const notices = await db.select().from(issueComments).where(and(eq(issueComments.issueId, issue!.id), eq(issueComments.createdByRunId, run!.id), eq(issueComments.authorType, "system")));
      expect(notices, String(body)).toHaveLength(error ? 1 : 0);
    }
    for (const [wakeBody, error] of [["Proszę utwórz zadanie wykonawcy.", true], ["Please create a task.", true], ["Can you delegate this task?", true], ["Could you please create a task?", true], ["Co oznacza delegowanie zadań?", false]] as const) {
      const [wake] = await db.insert(issueComments).values({ companyId, issueId: issue!.id, authorType: "system", body: wakeBody }).returning();
      const [run] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, issueId: issue!.id, status: "succeeded", contextSnapshot: { wakeCommentId: wake.id } }).returning();
      await db.insert(issueComments).values({ companyId, issueId: issue!.id, authorAgentId: agent!.id, authorType: "agent", createdByRunId: run!.id, body: "Odpowiedź informacyjna." });
      await settleProjectConversationTurn(db, run!);
      const notices = await db.select().from(issueComments).where(and(eq(issueComments.issueId, issue!.id), eq(issueComments.createdByRunId, run!.id), eq(issueComments.authorType, "system")));
      expect(notices, wakeBody).toHaveLength(error ? 1 : 0);
    }
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  it("projects executor skills, model, real load and runtime limits without credentials or foreign agents", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Roster", issuePrefix: `R${companyId.slice(0, 6)}` });
    const [project] = await db.insert(projects).values({ companyId, name: "Roster", visibility: "private", privacyOwnerUserId: "owner" }).returning();
    const [agent, unavailable] = await db.insert(agents).values([
      { companyId, name: "Coder", role: "engineer", adapterType: "codex_local", capabilities: "TypeScript and tests", adapterConfig: { model: "gpt-6.1-sol", env: { SECRET: "synthetic-private" } }, runtimeConfig: { heartbeat: { maxConcurrentRuns: 2 } } },
      { companyId, name: "Paused", role: "general", status: "paused", adapterType: "process" },
    ]).returning();
    await db.insert(projectAccessMembers).values({ companyId, projectId: project!.id, subjectType: "agent", subjectId: agent!.id });
    await db.insert(issues).values(["todo", "in_progress", "done"].map(status => ({ companyId, projectId: project!.id, title: status, status, assigneeAgentId: agent!.id })));
    await db.insert(issues).values({ companyId, projectId: project!.id, title: "Conversation is not a task", originKind: "cosgral_project_conversation", status: "todo", assigneeAgentId: agent!.id });
    await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, status: "running" });
    const roster = await projectConversationRoster(db, companyId, project!.id);
    expect(roster).toHaveLength(2);
    expect(roster.find(row => row.id === agent!.id)).toMatchObject({ capabilities: "TypeScript and tests", model: "gpt-6.1-sol", activeTaskCount: 2, activeRuns: 1, maxConcurrentRuns: 2, availableSlots: 1, projectAccess: true, providerQuota: "unknown" });
    expect(roster.find(row => row.id === unavailable!.id)).toMatchObject({ status: "paused", projectAccess: false, runtimeAvailability: "unsupported_for_project_conversation" });
    const markdown = buildPaperclipTaskMarkdown({ issue: { id: randomUUID(), identifier: "R-1", title: "Conversation", originKind: "cosgral_project_conversation", projectId: project!.id }, coordinatorRoster: roster });
    expect(markdown).toContain("Human approval gate");
    expect(markdown).toContain("activeTaskCount");
    expect(markdown).not.toContain("synthetic-private");
    expect(markdown).not.toContain('"env"');
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  it("keeps proposed work unstarted until a human decision, shares receipts and creates tasks once", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Approval", issuePrefix: `H${companyId.slice(0, 6)}` });
    await db.insert(companyMemberships).values(["a", "b", "viewer", "outsider"].map(id => ({ companyId, principalType: "user", principalId: id, status: "active", membershipRole: id === "viewer" ? "viewer" : "operator" })));
    const [project] = await db.insert(projects).values({ companyId, name: "Approval", visibility: "private", privacyOwnerUserId: "a" }).returning();
    await db.insert(projectAccessMembers).values(["a", "b", "viewer"].map(id => ({ companyId, projectId: project!.id, subjectType: "user", subjectId: id })));
    const [worker] = await db.insert(agents).values({ companyId, name: "Worker", role: "engineer", adapterType: "codex_local" }).returning();
    await db.insert(projectAccessMembers).values({ companyId, projectId: project!.id, subjectType: "agent", subjectId: worker!.id });
    const conversation = (await projectConversationService(db).getOrCreate(companyId, project!.id, "a"))!.issue;
    const [coordinator] = await db.insert(agents).values({ companyId, name: "Coordinator", role: "general", adapterType: "codex_local" }).returning();
    await db.insert(projectAccessMembers).values({ companyId, projectId: project!.id, subjectType: "agent", subjectId: coordinator!.id });
    await projectConversationService(db).setCoordinator(companyId, project!.id, "a", coordinator!.id, { authorize: async () => {}, changed: async () => {} });
    const [coordinatorRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: coordinator!.id, issueId: conversation.id, status: "running" }).returning();
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.header("x-test-agent")) { req.actor = { type: "agent", source: "agent_jwt", companyId, agentId: coordinator!.id, runId: coordinatorRun!.id }; next(); return; } const userId = req.header("x-test-user") ?? "outsider"; req.actor = { type: "board", source: "session", userId, companyIds: [companyId], memberships: [{ companyId, membershipRole: userId === "viewer" ? "viewer" : "operator", status: "active" }] }; next(); });
    app.use("/api", issueRoutes(db)); app.use(errorHandler);
    const url = `/api/issues/${conversation.id}/interactions`;
    const draft = { kind: "suggest_tasks", idempotencyKey: "human-proposal", resolverPolicy: "anyone", continuationPolicy: "none", payload: { version: 1, tasks: [{ clientKey: "one", title: "Needs human approval", projectId: project!.id, assigneeAgentId: worker!.id }] } };
    wakeup.mockClear();
    const proposed = await request(app).post(url).set("x-test-agent", "coordinator").send(draft);
    expect(proposed.status).toBe(201);
    expect(proposed.body.createdByAgentId).toBe(coordinator!.id);
    expect(proposed.body.effectiveResolverPolicy).toBe("human_only");
    expect(proposed.body.continuationPolicy).toBe("wake_assignee");
    expect((await issueService(db).list(companyId, { projectId: project!.id, includeAgentCreatedTasks: true }))).toHaveLength(0);
    expect(wakeup).not.toHaveBeenCalled();
    const visible = await request(app).get(url).set("x-test-user", "b");
    expect(visible.body.some((row: { id: string }) => row.id === proposed.body.id)).toBe(true);
    await expect(issueThreadInteractionService(db).acceptInteraction(conversation, proposed.body.id, {}, { agentId: worker!.id, runId: randomUUID(), suggestedTaskEffectsAuthorized: true })).rejects.toThrow(/human/i);
    expect((await request(app).post(`${url}/${proposed.body.id}/accept`).set("x-test-user", "viewer").send({})).status).toBe(403);
    expect((await request(app).post(`${url}/${proposed.body.id}/accept`).set("x-test-user", "outsider").send({})).status).toBe(404);
    expect((await request(app).post(`${url}/${proposed.body.id}/accept`).set("x-test-agent", "coordinator").send({})).status).toBe(403);
    const decisions = await Promise.all(["a", "b"].map(user => request(app).post(`${url}/${proposed.body.id}/accept`).set("x-test-user", user).send({})));
    expect(decisions.filter(result => result.status === 200)).toHaveLength(1);
    const created = await issueService(db).list(companyId, { projectId: project!.id, includeAgentCreatedTasks: true });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ parentId: conversation.id, assigneeAgentId: worker!.id, status: "todo" });
    expect(wakeup).toHaveBeenCalledWith(coordinator!.id, expect.objectContaining({ payload: expect.objectContaining({ interactionId: proposed.body.id, interactionStatus: "accepted" }) }));
    wakeup.mockClear();
    const rejectable = await request(app).post(url).set("x-test-user", "a").send({ ...draft, idempotencyKey: "reject-proposal" });
    expect((await request(app).post(`${url}/${rejectable.body.id}/reject`).set("x-test-user", "b").send({})).status).toBe(200);
    expect(await issueService(db).list(companyId, { projectId: project!.id, includeAgentCreatedTasks: true })).toHaveLength(1);
    expect(wakeup).toHaveBeenCalledWith(coordinator!.id, expect.objectContaining({ payload: expect.objectContaining({ interactionId: rejectable.body.id, interactionStatus: "rejected" }) }));
    const confirmation = await request(app).post(url).set("x-test-user", "a").send({ kind: "request_confirmation", resolverPolicy: "anyone", payload: { version: 1, prompt: "Publish?", supersedeOnUserComment: true } });
    expect(confirmation.status).toBe(201);
    expect(confirmation.body).toMatchObject({ effectiveResolverPolicy: "human_only", continuationPolicy: "wake_assignee", payload: { acceptLabel: "Zatwierdź", rejectLabel: "Odrzuć", supersedeOnUserComment: false } });
    expect((await request(app).post(`/api/issues/${conversation.id}/comments`).set("x-test-user", "b").send({ body: "Dodatkowy kontekst — to nie zgoda" })).status).toBe(201);
    const stillPending = await request(app).get(url).set("x-test-user", "b");
    expect(stillPending.body.find((row: { id: string }) => row.id === confirmation.body.id).status).toBe("pending");
    wakeup.mockClear();
    expect((await request(app).post(`${url}/${confirmation.body.id}/reject`).set("x-test-user", "viewer").send({})).status).toBe(403);
    expect((await request(app).post(`${url}/${confirmation.body.id}/accept`).set("x-test-user", "b").send({})).status).toBe(200);
    expect(wakeup).toHaveBeenCalledWith(coordinator!.id, expect.objectContaining({ payload: expect.objectContaining({ interactionId: confirmation.body.id, interactionStatus: "accepted" }) }));
    const secondConfirmation = await request(app).post(url).set("x-test-agent", "coordinator").send({ kind: "request_confirmation", continuationPolicy: "none", payload: { version: 1, prompt: "Publish another?" } });
    wakeup.mockClear();
    expect((await request(app).post(`${url}/${secondConfirmation.body.id}/reject`).set("x-test-user", "a").send({ reason: "Nie teraz" })).status).toBe(200);
    expect(wakeup).toHaveBeenCalledWith(coordinator!.id, expect.objectContaining({ payload: expect.objectContaining({ interactionId: secondConfirmation.body.id, interactionStatus: "rejected" }) }));
    const receipt = await request(app).get(url).set("x-test-user", "a");
    expect(receipt.body.find((row: { id: string }) => row.id === rejectable.body.id).status).toBe("rejected");
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  it("selects an authorized available executor deterministically and persists its reason without starting work", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "Selection API", issuePrefix: `E${companyId.slice(0, 6)}` });
    await db.insert(companyMemberships).values(["owner", "viewer", "outsider"].map(principalId => ({ companyId, principalType: "user", principalId, status: "active", membershipRole: principalId === "viewer" ? "viewer" : "operator" })));
    const [project] = await db.insert(projects).values({ companyId, name: "Private", visibility: "private", privacyOwnerUserId: "owner" }).returning();
    await db.insert(projectAccessMembers).values(["owner", "viewer"].map(subjectId => ({ companyId, projectId: project!.id, subjectType: "user", subjectId })));
    const [coordinator, coder, fallback, paused, inaccessible] = await db.insert(agents).values([
      { companyId, name: "Coordinator", role: "general", adapterType: "codex_local" },
      { companyId, name: "TypeScript engineer", role: "engineer", capabilities: "TypeScript", adapterType: "codex_local", adapterConfig: { model: "configured-model" }, runtimeConfig: { heartbeat: { maxConcurrentRuns: 1 } } },
      { companyId, name: "General worker", role: "general", adapterType: "codex_local" },
      { companyId, name: "Paused TypeScript", role: "engineer", capabilities: "TypeScript", status: "paused", adapterType: "codex_local" },
      { companyId, name: "Inaccessible", role: "engineer", capabilities: "TypeScript", adapterType: "codex_local" },
    ]).returning();
    await db.insert(projectAccessMembers).values([coordinator!, coder!, fallback!, paused!].map(agent => ({ companyId, projectId: project!.id, subjectType: "agent", subjectId: agent.id })));
    const conversation = await projectConversationService(db).setCoordinator(companyId, project!.id, "owner", coordinator!.id, { authorize: async () => {}, changed: async () => {} });
    await db.update(agents).set({ reportsTo: coordinator!.id }).where(eq(agents.id, coder!.id));
    const [selectionRun] = await db.insert(heartbeatRuns).values({ companyId, agentId: coordinator!.id, issueId: conversation!.id, status: "running" }).returning();
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.header("x-test-agent")) { req.actor = { type: "agent", source: "agent_jwt", companyId, agentId: coordinator!.id, runId: selectionRun!.id }; next(); return; } const userId = req.header("x-test-user") ?? "owner"; req.actor = { type: "board", source: "session", userId, companyIds: [companyId], memberships: [{ companyId, membershipRole: userId === "viewer" ? "viewer" : "operator", status: "active" }] }; next(); });
    app.use("/api", issueRoutes(db)); app.use(errorHandler);
    const url = `/api/issues/${conversation!.id}/executor-selection`;
    wakeup.mockClear();
    const selected = await request(app).post(url).send({ title: "TypeScript", model: "configured-model" });
    expect(selected.status).toBe(200);
    expect(selected.body).toMatchObject({ agentId: coder!.id });
    expect(selected.body.reason).toContain("TypeScript engineer");
    expect((await issueService(db).listComments(conversation!.id)).some(c => c.body.includes(selected.body.reason))).toBe(true);
    expect(wakeup).not.toHaveBeenCalled();
    expect((await request(app).post(url).set("x-test-agent", "coordinator").send({ title: "TypeScript" })).body.agentId).toBe(coder!.id);
    await db.insert(heartbeatRuns).values({ companyId, agentId: coder!.id, status: "queued" });
    expect((await request(app).post(url).send({ title: "TypeScript" })).body.agentId).toBe(fallback!.id);
    await db.update(agents).set({ status: "paused" }).where(eq(agents.id, coder!.id));
    expect((await request(app).post(url).send({ title: "TypeScript" })).body.agentId).toBe(fallback!.id);
    expect((await request(app).post(url).send({ title: "TypeScript", preferredAgentId: paused!.id })).status).toBe(422);
    expect((await request(app).post(url).send({ title: "TypeScript", preferredAgentId: inaccessible!.id })).status).toBe(422);
    expect((await request(app).post(url).set("x-test-user", "viewer").send({ title: "TypeScript" })).status).toBe(403);
    expect((await request(app).post(url).set("x-test-user", "outsider").send({ title: "TypeScript" })).status).toBe(404);
    await db.update(agents).set({ budgetMonthlyCents: 100, spentMonthlyCents: 100 }).where(eq(agents.id, fallback!.id));
    expect((await request(app).post(url).send({ title: "TypeScript" })).status).toBe(422);
    const [twin] = await db.insert(agents).values({ companyId, name: "Second general", role: "general", adapterType: "codex_local" }).returning();
    await db.insert(projectAccessMembers).values({ companyId, projectId: project!.id, subjectType: "agent", subjectId: twin!.id });
    await db.update(agents).set({ spentMonthlyCents: 0 }).where(eq(agents.id, fallback!.id));
    const expectedFallback = [fallback!.id, twin!.id].sort()[0];
    for (let attempt = 0; attempt < 2; attempt++) {
      const tie = await request(app).post(url).send({ title: "Unmatched work" });
      expect(tie.body.agentId).toBe(expectedFallback);
      expect(tie.body.reason).toContain("Fallback");
    }
    expect((await request(app).post(url).send({ title: "Unmatched work", preferredAgentId: twin!.id })).body.agentId).toBe(twin!.id);
    const [foreignCompany] = await db.insert(companies).values({ name: "Foreign selection", issuePrefix: `Z${companyId.slice(0, 6)}` }).returning();
    const [foreignAgent] = await db.insert(agents).values({ companyId: foreignCompany!.id, name: "Foreign", adapterType: "codex_local" }).returning();
    expect((await request(app).post(url).send({ title: "TypeScript", preferredAgentId: foreignAgent!.id })).status).toBe(422);
  }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);

  it("ranks equal capability by documented model reference cost and company-wide open load, recording exclusions even on failure", async () => {
    const companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "T15 selection", issuePrefix: `T${companyId.slice(0, 6)}` });
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: "owner", status: "active", membershipRole: "operator" });
    const [project] = await db.insert(projects).values({ companyId, name: "T15" }).returning();
    const [expensive, cheap, paused] = await db.insert(agents).values([
      { companyId, name: "Expensive", role: "engineer", capabilities: "TypeScript", adapterType: "codex_local", adapterConfig: { model: "gpt-6-astra" } },
      { companyId, name: "Cheap", role: "engineer", capabilities: "TypeScript", adapterType: "codex_local", adapterConfig: { model: "gpt-6-luna" } },
      { companyId, name: "Paused", adapterType: "codex_local", status: "paused" },
    ]).returning();
    const conversation = (await projectConversationService(db).getOrCreate(companyId, project!.id, "owner"))!.issue;
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.actor = { type: "board", source: "session", userId: "owner", companyIds: [companyId], memberships: [{ companyId, membershipRole: "operator", status: "active" }] }; next(); });
    app.use("/api", issueRoutes(db)); app.use(errorHandler);
    const url = `/api/issues/${conversation.id}/executor-selection`;
    // Give cheap the larger ID: selection must actually use cost, not win a random ID tie.
    const low = [expensive!.id, cheap!.id].sort()[0];
    const high = [expensive!.id, cheap!.id].sort()[1];
    await db.update(agents).set({ adapterConfig: { model: "gpt-6-astra" } }).where(eq(agents.id, low));
    await db.update(agents).set({ adapterConfig: { model: "gpt-6-luna" } }).where(eq(agents.id, high));
    const cost = await request(app).post(url).send({ title: "TypeScript" });
    expect(cost.status).toBe(200);
    expect(cost.body.agentId).toBe(high);
    expect(cost.body.reason).toContain("referencyjny koszt");
    expect(cost.body.reason).toContain(`${paused!.id}: status paused`);
    expect(cost.body.reason).toContain("brak danych o koszcie");
    // Backlog and work in another project both count, done/cancelled and conversation don't.
    const [other] = await db.insert(projects).values({ companyId, name: "Other" }).returning();
    await db.insert(issues).values([
      { companyId, projectId: other!.id, title: "Queued work", status: "backlog", assigneeAgentId: high },
      { companyId, title: "Finished", status: "done", assigneeAgentId: low },
      { companyId, title: "Cancelled", status: "cancelled", assigneeAgentId: low },
    ]);
    const roster = await projectConversationRoster(db, companyId, project!.id);
    expect(roster.find(a => a.id === high)).toMatchObject({ openTaskCount: 1, activeTaskCount: 0 });
    // Cost precedes load at equal skill; unknown costs disable price comparison for the score group.
    expect((await request(app).post(url).send({ title: "TypeScript" })).body.agentId).toBe(high);
    await db.update(agents).set({ adapterConfig: { model: "unknown-model" } }).where(eq(agents.id, high));
    expect((await request(app).post(url).send({ title: "TypeScript" })).body.agentId).toBe(low);
    const load = await db.insert(issues).values([
      { companyId, title: "Open backlog one", status: "backlog", assigneeAgentId: low },
      { companyId, title: "Open backlog two", status: "backlog", assigneeAgentId: low },
    ]).returning();
    expect((await request(app).post(url).send({ title: "TypeScript" })).body.agentId).toBe(high);
    await db.update(issues).set({ status: "done" }).where(eq(issues.id, load[0]!.id));
    await db.update(issues).set({ status: "todo" }).where(eq(issues.id, load[1]!.id));
    // Equal open count: zero active beats one active, despite the larger ID.
    expect((await request(app).post(url).send({ title: "TypeScript" })).body.agentId).toBe(high);
    await db.update(issues).set({ status: "backlog" }).where(eq(issues.id, load[1]!.id));
    const [queued] = await db.insert(heartbeatRuns).values({ companyId, agentId: low, status: "queued" }).returning();
    expect((await request(app).post(url).send({ title: "TypeScript" })).body.agentId).toBe(high);
    await db.update(heartbeatRuns).set({ status: "succeeded" }).where(eq(heartbeatRuns.id, queued!.id));
    // Exact requested model remains a capability criterion before price.
    expect((await request(app).post(url).send({ title: "TypeScript", model: "unknown-model" })).body.agentId).toBe(high);
    await db.update(agents).set({ budgetMonthlyCents: 5, spentMonthlyCents: 5 }).where(eq(agents.id, high));
    const denied = await request(app).post(url).send({ title: "TypeScript", preferredAgentId: high });
    expect(denied.status).toBe(422);
    const comments = await issueService(db).listComments(conversation.id);
    expect(comments.find(c => c.body.startsWith("Brak wyboru"))!.body).toContain(`${high}: budżet wyczerpany`);
    expect(comments.find(c => c.body.startsWith("Brak wyboru"))!.body).toContain("Brak wyboru");
    expect(comments.find(c => c.body.startsWith("Brak wyboru"))!.body).not.toContain("unknown-model"); // no raw configuration in exclusion details
    await db.update(agents).set({ capabilities: "", role: "general", adapterConfig: { model: "gpt-6-luna" } }).where(eq(agents.id, high));
    await db.update(agents).set({ spentMonthlyCents: 0 }).where(eq(agents.id, high));
    expect((await request(app).post(url).send({ title: "TypeScript" })).body.agentId).toBe(low);
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
    expect((await request(app).get(url).set("x-test-user", "viewer")).body).toMatchObject({ issueId: first.body.issueId, canResolveApprovals: false });
    expect((await request(app).get(url).set("x-test-user", "person-b")).body.canResolveApprovals).toBe(true);
    expect((await request(app).get(url).set("x-test-user", "outsider")).status).toBe(404);
    // Presence uses the same live project/issue policy without creating a thread or comment.
    const presenceActor = (userId: string) => ({ type: "board" as const, source: "session" as const, userId, companyIds: [companyId] });
    expect(await authorizeProjectPresence(db, presenceActor("person-b"), companyId, project!.id, false)).toBe(true);
    expect(await authorizeProjectPresence(db, presenceActor("person-b"), companyId, project!.id, true)).toBe(true);
    expect(await authorizeProjectPresence(db, presenceActor("viewer"), companyId, project!.id, false)).toBe(true);
    expect(await authorizeProjectPresence(db, presenceActor("viewer"), companyId, project!.id, true)).toBe(false);
    expect(await authorizeProjectPresence(db, presenceActor("outsider"), companyId, project!.id, false)).toBe(false);
    expect(await authorizeProjectPresence(db, { type: "none" }, companyId, project!.id, true)).toBe(false);
    expect(await authorizeProjectPresence(db, { type: "board", source: "local_implicit", userId: "local-board" }, companyId, project!.id, false)).toBe(false);
    expect(await authorizeProjectPresence(db, presenceActor("person-b"), randomUUID(), project!.id, true)).toBe(false);
    await db.delete(projectAccessMembers).where(and(eq(projectAccessMembers.projectId, project!.id), eq(projectAccessMembers.subjectId, "person-b")));
    expect(await authorizeProjectPresence(db, presenceActor("person-b"), companyId, project!.id, false)).toBe(false);
    await db.insert(projectAccessMembers).values({ companyId, projectId: project!.id, subjectType: "user", subjectId: "person-b" });
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
    // Other active children hold the final report until the last completion.
    const pending = await issueService(db).create(companyId, {
      title: "Another request", parentId: first.body.issueId, projectId: project!.id, status: "todo",
    });
    wakeup.mockClear();
    expect((await request(app).patch(`/api/issues/${child.id}`).set("x-test-user", "person-a").send({ status: "done" })).status).toBe(200);
    expect(wakeup).not.toHaveBeenCalledWith(coordinator!.id, expect.objectContaining({ reason: "issue_children_completed" }));
    expect(await issueService(db).getWakeableParentAfterChildCompletion(first.body.issueId, { issueId: child.id, summary: null })).toBeNull();
    expect((await request(app).patch(`/api/issues/${pending.id}`).set("x-test-user", "person-a").send({ status: "done" })).status).toBe(200);
    await vi.waitFor(() => expect(wakeup).toHaveBeenCalledWith(coordinator!.id, expect.objectContaining({
      reason: "issue_children_completed", idempotencyKey: expect.any(String),
      contextSnapshot: expect.objectContaining({ issueId: first.body.issueId, completedChildIssueId: pending.id, childIssueIds: [child.id, pending.id] }),
    })));
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
