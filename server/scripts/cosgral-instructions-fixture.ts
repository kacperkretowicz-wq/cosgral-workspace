// Wyłącznie izolowany fixture odbiorczy. Żadna iniekcja aktora nie trafia do aplikacji.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb, authUsers, companies, projects, agents, issues, companyMemberships, heartbeatRuns } from '@paperclipai/db';
import { startEmbeddedPostgresTestDatabase } from '../src/__tests__/helpers/embedded-postgres.js';
import { workspaceInstructionRoutes } from '../src/routes/workspace-instructions.js';
import { companyRoutes } from '../src/routes/companies.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { heartbeatService } from '../src/services/heartbeat.js';
import { registerServerAdapter, unregisterServerAdapter, type AdapterExecutionContext } from '../src/adapters/index.js';
const database = await startEmbeddedPostgresTestDatabase('cosgral18-live-');
const db = createDb(database.connectionString);
const heartbeat = heartbeatService(db);
const captured = new Map<string, AdapterExecutionContext>();
const release = new Map<string, () => void>();
registerServerAdapter({ type: 'cosgral_instruction_probe', supportsLocalAgentJwt: false,
 execute: async input => {
  captured.set(input.runId, input);
  await new Promise<void>(resolve => release.set(input.runId, resolve));
  await db.update(issues).set({ status: 'done' }).where(eq(issues.id, String(input.context.issueId)));
  return { exitCode: 0, signal: null, timedOut: false, resultJson: {} };
 },
 testEnvironment: async () => ({ adapterType: 'cosgral_instruction_probe', status: 'pass', checks: [], testedAt: new Date().toISOString() }),
});
const app = express(); app.use(express.json());
app.use(async (req, _res, next) => {
 const actor = req.header('x-cosgral-fixture-actor');
 const ids = (await db.select({ id: companies.id }).from(companies)).map(c => c.id);
 req.actor = actor === 'viewer' ? { type: 'board', source: 'session', userId: 'fixture-viewer', companyIds: ids, memberships: ids.map(companyId => ({ companyId, status: 'active', membershipRole: 'viewer' })) }
 : actor === 'outsider' ? { type: 'board', source: 'session', userId: 'fixture-outsider', companyIds: [], memberships: [] }
 : actor === 'agent' ? { type: 'agent', source: 'agent_key', agentId: randomUUID(), companyId: ids[0] }
 : actor === 'anonymous' ? { type: 'none', source: 'none' }
 : { type: 'board', source: 'local_implicit', userId: actor === 'bob' ? 'fixture-bob' : 'fixture-alice', isInstanceAdmin: true };
 next();
});
app.use('/api/companies', companyRoutes(db)); app.use('/api', workspaceInstructionRoutes(db));
// Jawne testowe sterowanie prawdziwym heartbeat. Bez modelu, logowania i poświadczeń.
app.post('/api/fixture/seed', async (req, res) => {
 const companyId = req.body.companyId as string;
 const projectId = randomUUID(), agentId = randomUUID(), issueId = randomUUID();
 await db.insert(authUsers).values(['fixture-alice', 'fixture-bob'].map(id => ({ id, name: id, email: `${id}@example.test`, createdAt: new Date(), updatedAt: new Date() }))).onConflictDoNothing();
 await db.insert(companyMemberships).values(['fixture-alice', 'fixture-bob'].map(principalId => ({ companyId, principalId, principalType: 'user', status: 'active', membershipRole: 'member' }))).onConflictDoNothing();
 await db.insert(projects).values({ id: projectId, companyId, name: 'Instructions project' });
 await db.insert(agents).values({ id: agentId, companyId, name: 'Kontrolowany adapter bez modelu', adapterType: 'cosgral_instruction_probe', status: 'idle', adapterConfig: {}, runtimeConfig: { heartbeat: { enabled: false } } });
 await db.insert(issues).values({ id: issueId, companyId, projectId, title: 'Probe instructions', status: 'todo', description: 'Opis do sprawdzenia wariantów compact.', responsibleUserId: 'fixture-alice', assigneeAgentId: agentId, issueNumber: 1 });
 res.json({ projectId, agentId, issueId });
});
app.post('/api/fixture/run', async (req, res) => {
 await db.update(issues).set({ status: 'todo', responsibleUserId: req.body.userId ?? 'fixture-alice', projectId: req.body.projectId }).where(eq(issues.id, req.body.issueId));
 const run = await heartbeat.wakeup(req.body.agentId, { source: 'on_demand', triggerDetail: 'manual', reason: 'manual', payload: { issueId: req.body.issueId }, contextSnapshot: { issueId: req.body.issueId, paperclipWorkspaceInstructionMarkdown: 'FAŁSZYWA INIEKCJA' } });
 res.json({ runId: run?.id });
});
app.get('/api/fixture/capture/:id', async (req, res) => {
 const input = captured.get(req.params.id);
 const [run] = await db.select({ status: heartbeatRuns.status, error: heartbeatRuns.error }).from(heartbeatRuns).where(eq(heartbeatRuns.id, req.params.id));
 const [savedAgent] = input ? await db.select({ adapterConfig: agents.adapterConfig, runtimeConfig: agents.runtimeConfig }).from(agents).where(eq(agents.id, input.agent.id)) : [];
 const fields = ['paperclipTaskMarkdown', 'paperclipTaskMarkdownAssignment', 'paperclipTaskMarkdownCompact', 'paperclipTaskMarkdownAssignmentCompact'];
 res.json({ ready: Boolean(input), status: run?.status, error: run?.error, fields: Object.fromEntries(fields.map(key => [key, input?.context[key]])), config: savedAgent, permissions: input?.agent.permissions });
});
app.post('/api/fixture/release/:id', async (req, res) => { release.get(req.params.id)?.(); await heartbeat.drainActiveRunExecutions(); res.json({ ok: true }); });
app.use(errorHandler);
const server = app.listen(3197, '127.0.0.1', () => console.log('COSGRAL18_READY'));
let closing = false;
async function close() { if (closing) return; closing = true; server.close(); for (const done of release.values()) done(); await heartbeat.drainActiveRunExecutions(); unregisterServerAdapter('cosgral_instruction_probe'); await db.$client.end(); await database.cleanup(); process.exit(0); }
process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close());
