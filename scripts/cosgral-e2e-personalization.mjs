#!/usr/bin/env node
// Real HTTP + disposable PostgreSQL. No login, model or production actor injection.
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { localOrigin } from './cosgral-e2e-agent-config.mjs';
export function validatePreference(value) {
 assert(['light', 'dark', 'system'].includes(value.theme));
 assert(['cosgral', 'violet', 'ocean', 'amber'].includes(value.accent));
 assert(Number.isInteger(value.sidebarWidth) && value.sidebarWidth >= 208 && value.sidebarWidth <= 420);
 assert(Number.isInteger(value.conversationWidth) && value.conversationWidth >= 240 && value.conversationWidth <= 520);
 assert.equal(typeof value.detailsOpen, 'boolean');
 assert(Object.values(value.views).every(v => ['chat', 'table', 'workflow'].includes(v)));
 return value;
}
export async function main() {
 const origin = localOrigin('http://127.0.0.1:3197');
 const net = await import('node:net');
 await new Promise((resolve, reject) => { const p = net.createServer(); p.once('error', reject); p.listen(3197, '127.0.0.1', () => p.close(resolve)); });
 const home = await mkdtemp(join(tmpdir(), 'cosgral17-home-'));
 const child = spawn('pnpm', ['--filter', '@paperclipai/server', 'exec', 'tsx', 'scripts/cosgral-personalization-fixture.ts'], { env: { ...process.env, PAPERCLIP_HOME: home, PORT: '3197', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
 child.stderr.on('data', () => {});
 const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
 process.once('SIGINT', stop); process.once('SIGTERM', stop);
 async function req(path, method = 'GET', body, actor = 'alice', expected = 200) {
  const r = await fetch(`${origin}/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-cosgral-fixture-actor': actor }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  assert.equal(r.status, expected, `${method}: HTTP ${r.status}`);
  return r.json();
 }
 try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('fixture startup timeout')), 90000); child.once('exit', () => { clearTimeout(timer); reject(new Error('fixture exited')); }); child.stdout.on('data', data => { if (data.toString().includes('COSGRAL17_READY')) { clearTimeout(timer); resolve(); } }); });
  const company = await req('/companies', 'POST', { name: 't17 preferences' }, 'alice', 201);
  const path = `/companies/${company.id}/workspace-preferences/me/personalization`;
  const get = '/workspace-preferences/me/personalization';
  const original = validatePreference(await req(get));
  const next = { ...original, theme: 'dark', accent: 'violet', sidebarWidth: 320, conversationWidth: 400, detailsOpen: true, views: { [`${company.id}:project`]: 'workflow' } };
  await req(path, 'PUT', next);
  assert.deepEqual(validatePreference(await req(get)), next);
  assert.deepEqual(validatePreference(await req(get, 'GET', undefined, 'bob')), original);
  await req(path, 'PUT', { ...next, userId: 'fixture-bob' }, 'alice', 400);
  await req(path, 'PUT', { ...next, sidebarWidth: 9000 }, 'alice', 400);
  await req(path, 'PUT', next, 'outsider', 403);
  // Viewers may customize their own presentation, never another person's.
  await req(path, 'PUT', { ...next, accent: 'ocean' }, 'viewer');
  assert.equal((await req(get, 'GET', undefined, 'viewer')).accent, 'ocean');
  assert.deepEqual(await req(get), next);
  console.log('PASS t17: preferences persisted, isolated users, strict validation, foreign company denied, viewer self-service; no models.');
 } finally {
  const exited = new Promise(resolve => child.once('exit', resolve)); stop();
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 10000))]);
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
 }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(() => { console.error('FAIL t17 personalization (response bodies suppressed)'); process.exitCode = 1; });
