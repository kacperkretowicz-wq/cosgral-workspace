import { randomBytes } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns, issues, issueComments } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { isAiAuthenticationBlocked } from "../ai-auth-failure.js";
import { settleSlackConversation } from "../slack-conversation-lifecycle.js";
import { createHeartbeatRunControl } from "./run-control.js";
import { callbacks, runControlPostgresSupport, setupRunControlDatabase } from "./__tests__/run-control-fixtures.js";

vi.mock("../local-service-supervisor.js", async importOriginal => ({
  ...await importOriginal<typeof import("../local-service-supervisor.js")>(),
  terminateLocalService: vi.fn(async () => undefined),
}));
vi.mock("../slack-conversation-lifecycle.js", () => ({ settleSlackConversation: vi.fn(async () => undefined) }));

describe.skipIf(!runControlPostgresSupport.supported)("execution release reads", () => {
  let db: Db;
  const { fixture } = setupRunControlDatabase("heartbeat-release-reads-", value => { db = value; });

  function recordRunReads() {
    const reads: unknown[][] = [];
    const database = new Proxy(db, { get(target, key) {
      if (key !== "select") return Reflect.get(target, key);
      return (...fields: Parameters<Db["select"]>) => {
        const builder = target.select(...fields);
        const from = builder.from.bind(builder);
        builder.from = ((...args: Parameters<typeof from>) => {
          const query = from(...args);
          if (args[0] === heartbeatRuns) {
            const execute = query.execute.bind(query);
            query.execute = async (...executeArgs: Parameters<typeof execute>) => {
              const rows = await execute(...executeArgs);
              reads.push(rows);
              return rows;
            };
          }
          return query;
        }) as typeof builder.from;
        return builder;
      };
    }});
    return { database, reads };
  }

  it.each([
    { errorCode: "codex_auth_required", livenessState: "blocked", resultJson: null },
    { errorCode: "codex_auth_required", livenessState: "advanced", resultJson: null },
    { errorCode: "configuration_incomplete", livenessState: "blocked", resultJson: { configurationIncomplete: { reason: "ai_connection_unavailable" } } },
    { errorCode: "configuration_incomplete", livenessState: "blocked", resultJson: { configurationIncomplete: { reason: "secret_binding_missing", agentId: "owner", missingBindings: [{ bindingType: "user_secret_ref", consumerType: "agent", consumerId: "owner", errorCode: "user_secret_missing", envKey: "OPENAI_API_KEY", configPath: "env.OPENAI_API_KEY" }] } } },
    { errorCode: "configuration_incomplete", livenessState: "blocked", resultJson: { configurationIncomplete: { reason: "workspace_unavailable" } } },
  ])("preserves authentication admission for %j without loading execution payloads", async failure => {
    const { company, agent } = await fixture();
    const payload = randomBytes(128 * 1024).toString("base64");
    const [run] = await db.insert(heartbeatRuns).values({ companyId: company.id, agentId: agent.id,
      status: "failed", ...failure, contextSnapshot: { prompt: payload }, runnerProfileJson: { prompt: payload }, stdoutExcerpt: payload,
    }).returning();
    const { database, reads } = recordRunReads();
    const deps = callbacks(database);
    await createHeartbeatRunControl(database, deps).releaseIssueExecutionAndPromote(run);
    expect(deps.wakeQueue.releaseIssueExecution).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      companyId: company.id, runId: run.id, suppressImmediateRecovery: isAiAuthenticationBlocked(run),
    }));
    expect(deps.getRun).not.toHaveBeenCalled();
    expect(reads).toHaveLength(2);
    expect(Buffer.byteLength(JSON.stringify(reads))).toBeLessThan(2048);
    const [stored] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run.id));
    expect(stored).toEqual(run);
  });

  it.each(["succeeded", "failed", "timed_out", "cancelled"])("settles shared project turns without task disposition (%s)", async status => {
    const { company, agent } = await fixture();
    const [issue] = await db.insert(issues).values({ companyId: company.id, title: "Project channel",
      originKind: "cosgral_project_conversation", status: "in_progress", assigneeAgentId: agent.id }).returning();
    const [run] = await db.insert(heartbeatRuns).values({ companyId: company.id, agentId: agent.id,
      status, contextSnapshot: { issueId: issue.id } }).returning();
    await db.update(issues).set({ executionRunId: run.id, checkoutRunId: run.id }).where(eq(issues.id, issue.id));
    if (status === "succeeded") await db.insert(issueComments).values({ companyId: company.id, issueId: issue.id,
      authorType: "agent", authorAgentId: agent.id, createdByRunId: run.id, body: "Delegation report" });
    const deps = callbacks(db);
    const control = createHeartbeatRunControl(db, deps);
    await control.releaseIssueExecutionAndPromote(run);
    await control.releaseIssueExecutionAndPromote(run);
    expect(deps.wakeQueue.releaseIssueExecution).toHaveBeenCalledWith(expect.objectContaining({ suppressImmediateRecovery: true }));
    expect((await db.select().from(issues).where(eq(issues.id, issue.id)))[0]).toMatchObject({
      status: "todo", assigneeAgentId: agent.id, checkoutRunId: null,
    });
    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, issue.id));
    expect(comments).toHaveLength(1);
    expect(comments[0].authorType).toBe(status === "succeeded" ? "agent" : "system");
    if (status !== "succeeded") expect(comments[0].body).toContain("Nie udało się");
  });

  it.each(["checkout", "execution"])("preserves a newer project turn's %s ownership", async ownership => {
    const { company, agent } = await fixture();
    const [issue] = await db.insert(issues).values({ companyId: company.id, title: "Project channel",
      originKind: "cosgral_project_conversation", status: "in_progress", assigneeAgentId: agent.id }).returning();
    const [oldRun, newRun] = await db.insert(heartbeatRuns).values([
      { companyId: company.id, agentId: agent.id, status: "succeeded", contextSnapshot: { issueId: issue.id } },
      { companyId: company.id, agentId: agent.id, status: "running", contextSnapshot: { issueId: issue.id } },
    ]).returning();
    await db.update(issues).set(ownership === "checkout" ? { checkoutRunId: newRun.id } : { executionRunId: newRun.id }).where(eq(issues.id, issue.id));
    await createHeartbeatRunControl(db, callbacks(db)).releaseIssueExecutionAndPromote(oldRun);
    expect((await db.select().from(issues).where(eq(issues.id, issue.id)))[0]).toMatchObject({
      status: "in_progress", ...(ownership === "checkout" ? { checkoutRunId: newRun.id } : { executionRunId: newRun.id }),
    });
    expect(await db.select().from(issueComments).where(eq(issueComments.issueId, issue.id))).toHaveLength(0);
  });

  it("shows a missing reply instead of silently treating a successful project run as a report", async () => {
    const { company, agent } = await fixture();
    const [issue] = await db.insert(issues).values({ companyId: company.id, title: "Project channel",
      originKind: "cosgral_project_conversation", status: "in_progress", assigneeAgentId: agent.id }).returning();
    const [run] = await db.insert(heartbeatRuns).values({ companyId: company.id, agentId: agent.id,
      status: "succeeded", contextSnapshot: { issueId: issue.id } }).returning();
    const control = createHeartbeatRunControl(db, callbacks(db));
    await control.releaseIssueExecutionAndPromote(run);
    await control.releaseIssueExecutionAndPromote(run);
    const comments = await db.select().from(issueComments).where(eq(issueComments.issueId, issue.id));
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ authorType: "system", createdByRunId: run.id });
    expect(comments[0].body).toContain("nie zapisał odpowiedzi");
  });

  it("reads the completed identity after post-commit effects and preserves the full record", async () => {
    const { company, agent } = await fixture();
    const [issue] = await db.insert(issues).values({ companyId: company.id, title: "Release destination" }).returning();
    const [run] = await db.insert(heartbeatRuns).values({ companyId: company.id, agentId: agent.id,
      status: "running", contextSnapshot: { issueId: 42, taskId: "", prompt: "retained" },
    }).returning();
    const deps = callbacks(db);
    vi.spyOn(deps, "applyWakeQueuePostCommitEffects").mockImplementationOnce(async () => {
      await db.update(heartbeatRuns).set({ status: "succeeded", contextSnapshot: { issueId: 42, taskId: issue.id, prompt: "retained" } }).where(eq(heartbeatRuns.id, run.id));
    });
    vi.mocked(settleSlackConversation).mockClear();
    await createHeartbeatRunControl(db, deps).releaseIssueExecutionAndPromote(run, { resumeStrandedQueue: true });
    expect(settleSlackConversation).toHaveBeenCalledExactlyOnceWith(db, company.id, issue.id);
    expect(deps.wakeQueue.releaseIssueExecution).toHaveBeenCalledWith(expect.objectContaining({ resumeStrandedQueue: true }));
    expect(deps.getRun).not.toHaveBeenCalled();
  });
});
