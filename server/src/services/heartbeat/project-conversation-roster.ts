import { agents, heartbeatRuns, issues, type Db } from "@paperclipai/db";
import { AGENT_DEFAULT_MAX_CONCURRENT_RUNS, PROJECT_CONVERSATION_ORIGIN_KIND } from "@paperclipai/shared";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { accessService } from "../access.js";

/** A prompt projection, never raw adapter configuration or provider credentials. */
export async function projectConversationRoster(db: Db, companyId: string, projectId: string) {
  const [roster, tasks, runs] = await Promise.all([
    db.select({ id: agents.id, name: agents.name, role: agents.role, capabilities: agents.capabilities,
      status: agents.status, reportsTo: agents.reportsTo, adapterType: agents.adapterType,
      model: sql<string | null>`${agents.adapterConfig}->>'model'`,
      configuredConcurrency: sql<unknown>`${agents.runtimeConfig}->'heartbeat'->'maxConcurrentRuns'`,
      budgetMonthlyCents: agents.budgetMonthlyCents, spentMonthlyCents: agents.spentMonthlyCents,
    }).from(agents).where(eq(agents.companyId, companyId)),
    db.select({ agentId: issues.assigneeAgentId, count: sql<number>`count(*)::int` }).from(issues)
      .where(and(eq(issues.companyId, companyId), ne(issues.originKind, PROJECT_CONVERSATION_ORIGIN_KIND), inArray(issues.status, ["todo", "in_progress", "in_review", "blocked"])))
      .groupBy(issues.assigneeAgentId),
    db.select({ agentId: heartbeatRuns.agentId, count: sql<number>`count(*)::int` }).from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.companyId, companyId), inArray(heartbeatRuns.status, ["running", "queued"])))
      .groupBy(heartbeatRuns.agentId),
  ]);
  const access = accessService(db);
  return Promise.all(roster.map(async ({ configuredConcurrency, ...agent }) => {
    const configured = typeof configuredConcurrency === "number" && Number.isFinite(configuredConcurrency)
      ? Math.floor(configuredConcurrency) : AGENT_DEFAULT_MAX_CONCURRENT_RUNS;
    const maxConcurrentRuns = Math.max(1, Math.min(50, configured));
    const activeRuns = runs.find(row => row.agentId === agent.id)?.count ?? 0;
    const projectAccess = (await access.decide({ actor: { type: "agent", companyId, agentId: agent.id },
      action: "project:read", resource: { type: "project", companyId, projectId } })).allowed;
    return { ...agent, activeTaskCount: tasks.find(row => row.agentId === agent.id)?.count ?? 0,
      maxConcurrentRuns, activeRuns, availableSlots: Math.max(0, maxConcurrentRuns - activeRuns), projectAccess,
      runtimeAvailability: agent.adapterType === "codex_local" && process.platform === "linux"
        ? "local_cli_compatible_credentials_unverified" : "unsupported_for_project_conversation",
      providerQuota: "unknown", modelPrice: "unknown" };
  }));
}
export type ProjectConversationRoster = Awaited<ReturnType<typeof projectConversationRoster>>;
