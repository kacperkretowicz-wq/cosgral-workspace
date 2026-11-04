#!/usr/bin/env node
// Real HTTP + disposable PostgreSQL. No login, model or production actor injection.
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { localOrigin } from './cosgral-e2e-agent-config.mjs';
export async function main() {
 const origin = localOrigin('http://127.0.0.1:3197');
 const net = await import('node:net');
 await new Promise((resolve, reject) => { const p = net.createServer(); p.once('error', reject); p.listen(3197, '127.0.0.1', () => p.close(resolve)); });
 const home = await mkdtemp(join(tmpdir(), 'cosgral18-home-'));
 const child = spawn('pnpm', ['--filter', '@paperclipai/server', 'exec', 'tsx', 'scripts/cosgral-instructions-fixture.ts'], { env: { ...process.env, PAPERCLIP_HOME: home, PORT: '3197', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
 child.stderr.on('data', () => {});
 const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
 process.once('SIGINT', stop); process.once('SIGTERM', stop);
 async function req(path, method = 'GET', body, actor = 'alice', expected = 200) {
  const r = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-cosgral-fixture-actor': actor }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  assert.equal(r.status, expected, `${method}: HTTP ${r.status}`);
  return r.json();
 }
 try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('fixture startup timeout')), 90000); child.once('exit', () => { clearTimeout(timer); reject(new Error('fixture exited')); }); child.stdout.on('data', data => { if (data.toString().includes('COSGRAL18_READY')) { clearTimeout(timer); resolve(); } }); });
  const company = await req('/companies', 'POST', { name: 't18 instructions' }, 'alice', 201);
  const fixture = await req('/fixture/seed', 'POST', { companyId: company.id });
  const base = `/companies/${company.id}/instructions`;
  const scopes = ['company', `projects/${fixture.projectId}`, 'me'];
  for (const [i, scope] of scopes.entries()) {
   await req(`${base}/${scope}`, 'PUT', { text: `Wskazówka początkowa ${i}` });
   assert.equal((await req(`${base}/${scope}`)).text, `Wskazówka początkowa ${i}`);
   await req(`${base}/${scope}`, 'PUT', { text: 'Zmiana widza' }, 'viewer', 403);
  }
  assert.equal((await req(`${base}/me`, 'GET', undefined, 'bob')).text, '');
  for (const actor of ['agent', 'anonymous']) await req(`${base}/company`, 'PUT', { text: 'brak dostępu' }, actor, 403);
  await req(`${base}/company`, 'GET', undefined, 'outsider', 404);
  for (const text of ['x'.repeat(8001), 'api_key=synthetic-test-value', 'Bearer synthetic-test-value']) await req(`${base}/company`, 'PUT', { text }, 'alice', 400);
  await req(`${base}/me`, 'PUT', { text: 'OK', userId: 'fixture-bob' }, 'alice', 400);
  async function start(userId = 'fixture-alice', projectId = fixture.projectId, target = fixture) {
   const { runId } = await req('/fixture/run', 'POST', { ...target, userId, projectId });
   assert(runId, 'run admitted');
   for (let attempt = 0; attempt < 200; attempt++) {
    const capture = await req(`/fixture/capture/${runId}`);
    if (capture.ready) return { runId, capture };
    assert(!['failed', 'blocked', 'cancelled'].includes(capture.status), `run ${capture.status}: ${capture.error}`);
    await new Promise(resolve => setTimeout(resolve, 100));
   }
   throw new Error('adapter dispatch timeout');
  }
  const first = await start();
  assert.equal(first.capture.status, 'running');
  for (const text of Object.values(first.capture.fields)) {
   for (let i = 0; i < 3; i++) assert(text.includes(`Wskazówka początkowa ${i}`));
   assert(!text.includes('FAŁSZYWA INIEKCJA'));
  }
  for (const [i, scope] of scopes.entries()) await req(`${base}/${scope}`, 'PUT', { text: `Wskazówka kolejna ${i}` });
  const active = await req(`/fixture/capture/${first.runId}`);
  assert.deepEqual(active.fields, first.capture.fields, 'active run is immutable');
  await req(`/fixture/release/${first.runId}`, 'POST');
  assert.equal((await req(`/fixture/capture/${first.runId}`)).status, 'succeeded');
  const second = await start();
  for (const text of Object.values(second.capture.fields)) for (let i = 0; i < 3; i++) assert(text.includes(`Wskazówka kolejna ${i}`));
  assert.deepEqual(second.capture.permissions, first.capture.permissions, 'instructions do not grant permissions');
  assert.deepEqual(second.capture.config, first.capture.config, 'instructions do not change adapter config');
  await req(`/fixture/release/${second.runId}`, 'POST');
  assert.equal((await req(`/fixture/capture/${second.runId}`)).status, 'succeeded');
  await req(`${base}/me`, 'PUT', { text: 'Wskazówka Boba' }, 'bob');
  const bob = await start('fixture-bob', null);
  for (const text of Object.values(bob.capture.fields)) {
   assert(text.includes('Wskazówka kolejna 0'));
   assert(text.includes('Wskazówka Boba'));
   assert(!text.includes('Wskazówka kolejna 1'));
   assert(!text.includes('Wskazówka kolejna 2'));
  }
  await req(`/fixture/release/${bob.runId}`, 'POST');
  assert.equal((await req(`/fixture/capture/${bob.runId}`)).status, 'succeeded');
  const otherCompany = await req('/companies', 'POST', { name: 't18 isolated company' }, 'alice', 201);
  const other = await req('/fixture/seed', 'POST', { companyId: otherCompany.id });
  const isolated = await start('fixture-alice', other.projectId, other);
  for (const text of Object.values(isolated.capture.fields)) { assert(!text.includes('Wskazówka kolejna')); assert(!text.includes('Wskazówka Boba')); }
  await req(`/fixture/release/${isolated.runId}`, 'POST');
  assert.equal((await req(`/fixture/capture/${isolated.runId}`)).status, 'succeeded');
  console.log('PASS t18: HTTP save → real heartbeat → controlled adapter; company/project/person, all 4 markdown variants, active run unchanged, next run updated, isolation, viewer denied, credentials/length rejected, no model.');
 } finally {
  const exited = new Promise(resolve => child.once('exit', resolve)); stop();
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 10000))]);
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
 }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(error => { console.error('FAIL t18 instructions (response bodies suppressed):', error.message.split('\n')[0]); process.exitCode = 1; });
