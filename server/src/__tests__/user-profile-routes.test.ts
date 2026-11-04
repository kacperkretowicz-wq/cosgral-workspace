import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { authRoutes } from "../routes/auth.js";
import { subscribeCompanyLiveEvents } from "../services/live-events.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agents,
  authUsers,
  companies,
  companyMemberships,
  costEvents,
  createDb,
  issueComments,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
let errorHandler: typeof import("../middleware/index.js").errorHandler;
let userProfileRoutes: typeof import("../routes/user-profiles.js").userProfileRoutes;

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres user profile route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("GET /companies/:companyId/users/:userSlug/profile", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;
  let userId!: string;
  let agentId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-user-profile-route-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock("../routes/user-profiles.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    const [routes, middleware] = await Promise.all([
      vi.importActual<typeof import("../routes/user-profiles.js")>("../routes/user-profiles.js"),
      vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    ]);
    userProfileRoutes = routes.userProfileRoutes;
    errorHandler = middleware.errorHandler;
    companyId = randomUUID();
    userId = randomUUID();
    agentId = randomUUID();
    const now = new Date();

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `U${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(authUsers).values({
      id: userId,
      name: "Dotta",
      email: "dotta@example.com",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: userId,
      status: "active",
      membershipRole: "owner",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Coder",
      role: "engineer",
      adapterType: "process",
      adapterConfig: {},
    });
  });

  afterEach(async () => {
    await db.delete(costEvents);
    await db.delete(issueComments);
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companyMemberships);
    await db.delete(authUsers);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  function createApp() {
    if (!userProfileRoutes || !errorHandler) {
      throw new Error("user profile route test dependencies were not loaded");
    }
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        source: "local_implicit",
        userId,
        companyIds: [companyId],
      };
      next();
    });
    app.use("/api/auth", authRoutes(db));
    app.use("/api", userProfileRoutes(db));
    app.use(errorHandler);
    return app;
  }

  it("rolls back the profile and publishes nothing when the audit write fails", async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeCompanyLiveEvents(companyId, event => { received.push(event); });
    await db.$client.unsafe(`CREATE FUNCTION test_profile_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'user.profile_updated' THEN RAISE EXCEPTION 'injected profile audit failure'; END IF;
      RETURN NEW; END $$`);
    try {
      await db.$client.unsafe(`CREATE TRIGGER test_profile_audit_failure BEFORE INSERT ON activity_log
        FOR EACH ROW EXECUTE FUNCTION test_profile_audit_failure()`);
      const res = await request(createApp()).patch("/api/auth/profile").send({ name: "Must roll back", image: "https://example.test/rollback.png" });
      expect(res.status).toBe(500);
      expect(await db.select({ name: authUsers.name, image: authUsers.image }).from(authUsers))
        .toEqual([{ name: "Dotta", image: null }]);
      expect(received).toEqual([]);
      expect(await db.select().from(activityLog)).toEqual([]);
    } finally {
      unsubscribe();
      await db.$client.unsafe("DROP TRIGGER IF EXISTS test_profile_audit_failure ON activity_log");
      await db.$client.unsafe("DROP FUNCTION IF EXISTS test_profile_audit_failure()");
    }
  });

  it("publishes a committed profile change only to active user memberships without profile content", async () => {
    const outside = randomUUID();
    await db.insert(companies).values({ id: outside, name: "Other", issuePrefix: "OTHER" });
    await db.insert(companyMemberships).values({ companyId: outside, principalType: "user", principalId: userId, status: "inactive" });
    const received: Array<{ companyId: string; payload: Record<string, unknown> }> = [];
    const unsubscribe = subscribeCompanyLiveEvents(companyId, event => { received.push(event); });
    const unsubscribeOutside = subscribeCompanyLiveEvents(outside, event => { received.push(event); });
    try {
      const res = await request(createApp()).patch("/api/auth/profile").send({ name: "Updated person", image: "https://example.test/avatar.png" });
      expect(res.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({ companyId, payload: { action: "user.profile_updated", entityType: "user", entityId: userId } });
      expect(JSON.stringify(received)).not.toContain("Updated person");
      expect(JSON.stringify(received)).not.toContain("avatar.png");
    } finally { unsubscribe(); unsubscribeOutside(); }
  });

  it("resolves a user slug and returns issue, activity, and attributed cost stats", async () => {
    const doneIssueId = randomUUID();
    const openIssueId = randomUUID();
    const now = new Date();
    const older = new Date(now.getTime() - 60_000);

    await db.insert(issues).values([
      {
        id: doneIssueId,
        companyId,
        title: "Ship profile page",
        status: "done",
        priority: "high",
        createdByUserId: userId,
        identifier: "USR-1",
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: openIssueId,
        companyId,
        title: "Review profile copy",
        status: "in_progress",
        priority: "medium",
        assigneeUserId: userId,
        identifier: "USR-2",
        createdAt: older,
        updatedAt: older,
      },
    ]);
    await db.insert(issueComments).values({
      companyId,
      issueId: openIssueId,
      authorUserId: userId,
      body: "Looks good.",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(activityLog).values({
      companyId,
      actorType: "user",
      actorId: userId,
      action: "issue.updated",
      entityType: "issue",
      entityId: doneIssueId,
      createdAt: now,
    });
    await db.insert(costEvents).values({
      companyId,
      agentId,
      issueId: doneIssueId,
      provider: "openai",
      biller: "openai",
      billingType: "metered_api",
      model: "gpt-test",
      inputTokens: 120,
      cachedInputTokens: 30,
      outputTokens: 40,
      costCents: 42,
      occurredAt: now,
    });

    const response = await request(createApp()).get(`/api/companies/${companyId}/users/dotta/profile`);

    expect(response.status).toBe(200);
    expect(response.body.user.slug).toBe("dotta");
    expect(response.body.user.membershipRole).toBe("owner");
    expect(response.body.stats).toHaveLength(3);

    const all = response.body.stats.find((entry: { key: string }) => entry.key === "all");
    expect(all).toMatchObject({
      touchedIssues: 2,
      createdIssues: 1,
      completedIssues: 1,
      assignedOpenIssues: 1,
      commentCount: 1,
      activityCount: 1,
      costCents: 42,
      inputTokens: 120,
      cachedInputTokens: 30,
      outputTokens: 40,
      costEventCount: 1,
    });
    expect(response.body.recentIssues.map((issue: { identifier: string }) => issue.identifier)).toEqual(["USR-1", "USR-2"]);
    expect(response.body.recentActivity[0].action).toBe("issue.updated");
    expect(response.body.topAgents[0]).toMatchObject({ agentId, agentName: "Coder", costCents: 42 });
    expect(response.body.topProviders[0]).toMatchObject({ provider: "openai", model: "gpt-test", costCents: 42 });
  });
});
