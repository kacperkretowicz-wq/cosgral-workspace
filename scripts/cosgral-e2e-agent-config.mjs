#!/usr/bin/env node
// No models/logins. Exercises real production HTTP routes with explicit test actors.
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const keys = new Set(['version', 'name', 'role', 'description', 'model', 'reasoning', 'instructions', 'maxConcurrentRuns', 'budgetMonthlyCents', 'permissions', 'tools']);
export function validateTemplate(t) {
 assert.equal(t.version, 1);
 assert(Object.keys(t).every(k => keys.has(k)), 'unexpected template field');
 assert(!JSON.stringify(t).includes('COSGRAL16_PRIVATE_SENTINEL'), 'secret leaked');
 return t;
}
export function localOrigin(value) {
 const u = new URL(value);
 assert(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname) && u.port === '3197' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash, 'only local fixture port 3197 allowed');
 return u.origin;
}
export async function main() {
 const api = localOrigin('http://127.0.0.1:3197');
 // Never attach to an existing service, even if its health endpoint is absent.
 const net = await import('node:net');
 await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(3197, '127.0.0.1', () => probe.close(resolve)); });
 const home = await mkdtemp(join(tmpdir(), 'cosgral16-home-'));
 const child = spawn('pnpm', ['--filter', '@paperclipai/server', 'exec', 'tsx', 'scripts/cosgral-agent-config-fixture.ts'], { env: { ...process.env, PAPERCLIP_HOME: home, PORT: '3197', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
 // Output may contain server diagnostics. Never forward it or raw response bodies.
 child.stderr.on('data', () => {});
 const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
 process.once('SIGINT', stop); process.once('SIGTERM', stop);
 async function request(path, method = 'GET', body, actor, expected = 200) {
  const r = await fetch(`${api}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { 'x-cosgral-fixture-actor': actor } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  assert.equal(r.status, expected, `${method} ${path}: unexpected HTTP ${r.status}`);
  const data = await r.json();
  assert(!JSON.stringify(data).includes('COSGRAL16_PRIVATE_SENTINEL'), 'secret in response');
  return data;
 }
 try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('fixture startup timeout')), 90000); child.once('exit', () => { clearTimeout(timer); reject(new Error('fixture exited before ready')); }); child.stdout.on('data', data => { if (data.toString().includes('COSGRAL16_READY')) { clearTimeout(timer); resolve(); } }); });
  const first = await request('/companies', 'POST', { name: 't16 source' }, undefined, 201);
  const second = await request('/companies', 'POST', { name: 't16 destination' }, undefined, 201);
  for (const c of [first, second]) await request(`/companies/${c.id}`, 'PATCH', { requireBoardApprovalForNewAgents: false });
  const p1 = await request(`/companies/${first.id}/projects`, 'POST', { name: 'Source' }, undefined, 201);
  const p2 = await request(`/companies/${second.id}/projects`, 'POST', { name: 'Destination' }, undefined, 201);
  const source = await request(`/companies/${first.id}/agents`, 'POST', { name: 'Template worker', role: 'general', adapterType: 'process', runner: 'legacy', adapterConfig: { model: 'model-before', env: { COSGRAL_TEST_KEY: 'COSGRAL16_PRIVATE_SENTINEL' } }, runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: false, maxConcurrentRuns: 2 } }, permissions: { canCreateAgents: false, canCreateSkills: false }, budgetMonthlyCents: 500 }, undefined, 201);
  console.log('Source created');
  const template = validateTemplate(await request(`/agents/${source.id}/config-template`));
  assert.equal(template.model, 'model-before'); assert.equal(template.maxConcurrentRuns, 2);
  const input = { template, adapterType: 'process', projectId: p2.id };
  const copy = await request(`/companies/${second.id}/agents/from-template`, 'POST', input, undefined, 201);
  assert.equal(copy.companyId, second.id); assert.equal(copy.adapterConfig.model, template.model);
  assert.equal(copy.runtimeConfig.heartbeat.wakeOnDemand, false);
  assert.deepEqual(copy.permissions.authorizationPolicy.trustBoundary.projectIds, [p2.id]);
  await request(`/companies/${second.id}/agents/from-template`, 'POST', input, 'viewer', 403);
  await request(`/agents/${source.id}/config-template`, 'GET', undefined, 'outsider', 404);
  await request(`/agents/${source.id}/config-stats`, 'GET', undefined, 'outsider', 404);
  await request(`/companies/${second.id}/agents/from-template`, 'POST', { ...input, projectId: p1.id }, undefined, 404);
  await request(`/companies/${second.id}/agents/from-template`, 'POST', { ...input, template: { ...template, env: {} } }, undefined, 422);
  console.log('Template import and ACL passed');
  const stats = await request(`/agents/${copy.id}/config-stats`);
  assert.equal(stats.completedTasks, 0); assert.equal(stats.recentErrors.length, 0); assert(['available', 'waiting', 'offline'].includes(stats.state), 'unconfigured agent state must not imply work');
  await request(`/agents/${copy.id}/pause`, 'POST', {});
  assert.equal((await request(`/agents/${copy.id}/config-stats`)).state, 'offline');
  console.log('PASS t16: templates, cross-company/project import, allowlist, viewer, isolation, stats/offline; no model runs.');
 } finally {
  stop();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 10000))]);
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
 }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(error => { console.error('FAIL t16: ' + String(error.message).split('\n')[0].replace(/COSGRAL16_PRIVATE_SENTINEL/g, '[redacted]')); process.exitCode = 1; });
