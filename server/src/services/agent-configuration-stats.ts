import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { heartbeatRuns, issues, type Db } from '@paperclipai/db';
import type { AgentConfigurationStats } from '@paperclipai/shared/agent-template';
export async function agentConfigurationStats(db: Db, agent: { id: string; companyId: string; status: string; lifecycleState: string }): Promise<AgentConfigurationStats> {
  const scope = and(eq(heartbeatRuns.companyId, agent.companyId), eq(heartbeatRuns.agentId, agent.id));
  const [completed, active, failures] = await Promise.all([
    db.select({ n: count() }).from(issues).where(and(eq(issues.companyId, agent.companyId), eq(issues.assigneeAgentId, agent.id), eq(issues.status, 'done'))),
    db.select({ status: heartbeatRuns.status }).from(heartbeatRuns).where(and(scope, inArray(heartbeatRuns.status, ['running', 'queued', 'scheduled_retry']))).limit(10),
    db.select({ id: heartbeatRuns.id, at: heartbeatRuns.createdAt }).from(heartbeatRuns).where(and(scope, inArray(heartbeatRuns.status, ['failed', 'timed_out']))).orderBy(desc(heartbeatRuns.createdAt)).limit(5),
  ]);
  const state = ['paused', 'terminated'].includes(agent.status) ? 'offline'
    : agent.status === 'error' || agent.lifecycleState === 'error' ? 'error'
    : active.some(r => r.status === 'running') ? 'working'
    : active.length || agent.status === 'pending_approval' || agent.lifecycleState !== 'ready' ? 'waiting' : 'available';
  return { completedTasks: completed[0]?.n ?? 0, state, recentErrors: failures.map(r => ({ id: r.id, at: r.at.toISOString(), message: 'Uruchomienie nie powiodło się. Szczegóły dostępne w uprawnionej historii.' })) };
}
