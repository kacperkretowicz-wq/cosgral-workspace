import { describe, it, expect } from 'vitest';
import { exportAgentTemplate, instantiateAgentTemplate, agentTemplateSchema } from '@paperclipai/shared/agent-template';
describe('portable agent configuration', () => {
 it('exports only the allowlist and never runtime bindings or tool configuration', () => {
  const template = exportAgentTemplate({ name: 'Worker', role: 'general', capabilities: 'Tests', adapterConfig: { model: 'model-a', modelReasoningEffort: 'medium', promptTemplate: 'Do not reveal SECRET', env: { KEY: 'SECRET' }, apiKey: 'SECRET', cwd: '/private', mcpServers: [{ token: 'SECRET' }] }, runtimeConfig: { aiConnection: { id: 'SECRET' }, heartbeat: { maxConcurrentRuns: 2 } }, permissions: { canCreateAgents: false, canCreateSkills: false, arbitrary: 'SECRET' }, budgetMonthlyCents: 500 });
  expect(JSON.stringify(template)).not.toMatch(/SECRET|env|cwd|apiKey|mcpServers|aiConnection/);
  expect(template).toMatchObject({ model: 'model-a', maxConcurrentRuns: 2, budgetMonthlyCents: 500 });
  expect(agentTemplateSchema.safeParse({ ...template, env: {} }).success).toBe(false);
 });
 it('requires fresh target project authority, disables waking and never installs declarations', () => {
  const template = exportAgentTemplate({ name: 'Worker', role: 'general', adapterConfig: {}, runtimeConfig: {}, permissions: {} });
  const input = instantiateAgentTemplate({ ...template, tools: ['MCP: review'] }, 'process', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
  expect(input.runtimeConfig.heartbeat.wakeOnDemand).toBe(false);
  expect(input.permissions.authorizationPolicy.trustBoundary.projectIds).toEqual(['22222222-2222-4222-8222-222222222222']);
  expect(input.permissions.trustPreset).toBe('low_trust_review');
  expect(input.adapterConfig).not.toHaveProperty('mcpServers');
 });
});

import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll } from 'vitest';
import { createDb, companies, agents, issues, heartbeatRuns, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS } from '@paperclipai/db';
import { startEmbeddedPostgresTestDatabase } from './helpers/embedded-postgres.js';
import { agentConfigurationStats } from '../services/agent-configuration-stats.js';
import { eq } from 'drizzle-orm';
describe('database-backed agent stats', () => {
 let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
 let db: ReturnType<typeof createDb>;
 beforeAll(async () => { database = await startEmbeddedPostgresTestDatabase('cosgral16-stats-'); db = createDb(database.connectionString); }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
 afterAll(async () => { await db?.$client.end(); await database?.cleanup(); });
 it('counts done tasks once, redacts errors and computes all five states from persisted facts', async () => {
  const companyId = randomUUID();
  await db.insert(companies).values({ id: companyId, name: 'Stats', issuePrefix: 'T16' });
  const [agent, other] = await db.insert(agents).values([{ companyId, name: 'Worker' }, { companyId, name: 'Other' }]).returning();
  await db.insert(issues).values([{ companyId, title: 'Done', status: 'done', assigneeAgentId: agent!.id, issueNumber: 1 }, { companyId, title: 'Other', status: 'done', assigneeAgentId: other!.id, issueNumber: 2 }, { companyId, title: 'Open', status: 'todo', assigneeAgentId: agent!.id, issueNumber: 3 }]);
  await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, status: 'failed', error: 'Bearer PRIVATE_SECRET /home/private' });
  const stats = await agentConfigurationStats(db, agent!);
  expect(stats.completedTasks).toBe(1); expect(stats.state).toBe('available');
  expect(stats.recentErrors).toHaveLength(1); expect(JSON.stringify(stats)).not.toMatch(/PRIVATE_SECRET|Bearer|\/home/);
  const [queued] = await db.insert(heartbeatRuns).values({ companyId, agentId: agent!.id, status: 'queued' }).returning();
  expect((await agentConfigurationStats(db, agent!)).state).toBe('waiting');
  await db.update(heartbeatRuns).set({ status: 'running' }).where(eq(heartbeatRuns.id, queued!.id));
  expect((await agentConfigurationStats(db, agent!)).state).toBe('working');
  expect((await agentConfigurationStats(db, { ...agent!, status: 'error' })).state).toBe('error');
  expect((await agentConfigurationStats(db, { ...agent!, status: 'paused' })).state).toBe('offline');
 });
});

import express from 'express';
import request from 'supertest';
import { agentRoutes } from '../routes/agents.js';
import { errorHandler } from '../middleware/error-handler.js';
describe('template HTTP authorization', () => {
 let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
 let db: ReturnType<typeof createDb>;
 beforeAll(async () => { database = await startEmbeddedPostgresTestDatabase('cosgral16-api-'); db = createDb(database.connectionString); }, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
 afterAll(async () => { await db?.$client.end(); await database?.cleanup(); });
 it('hides foreign agents and blocks viewers, agent actors and unknown template fields', async () => {
  const companyId = randomUUID();
  await db.insert(companies).values({ id: companyId, name: 'Template ACL', issuePrefix: 'A16' });
  const [source] = await db.insert(agents).values({ companyId, name: 'Source', adapterConfig: { model: 'safe', env: { PRIVATE: 'DO_NOT_EXPORT' } } }).returning();
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.actor = req.header('x-actor') === 'agent' ? { type: 'agent', source: 'agent_jwt', companyId, agentId: source!.id }
    : { type: 'board', source: 'session', userId: 'viewer', companyIds: req.header('x-actor') === 'outsider' ? [] : [companyId], memberships: [{ companyId, membershipRole: 'viewer', status: 'active' }] }; next(); });
  app.use('/api', agentRoutes(db)); app.use(errorHandler);
  expect((await request(app).get(`/api/agents/${source!.id}/config-template`).set('x-actor', 'outsider')).status).toBe(404);
  expect((await request(app).get(`/api/agents/${source!.id}/config-stats`).set('x-actor', 'outsider')).status).toBe(404);
  for (const actor of ['viewer', 'agent']) expect((await request(app).post(`/api/companies/${companyId}/agents/from-template`).set('x-actor', actor).send({})).status).toBe(403);
 });
});
