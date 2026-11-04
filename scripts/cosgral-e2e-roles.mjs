#!/usr/bin/env node
// HTTP + tymczasowy PostgreSQL; bez rejestracji, sekretów i modeli.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { localOrigin } from './cosgral-e2e-agent-config.mjs';
export async function main() {
 const origin = localOrigin('http://127.0.0.1:3197');
 await new Promise((resolve, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(3197, '127.0.0.1', () => probe.close(resolve)); });
 const home = await mkdtemp(join(tmpdir(), 'cosgral19-home-'));
 const child = spawn('pnpm', ['--filter', '@paperclipai/server', 'exec', 'tsx', 'scripts/cosgral-roles-fixture.ts'], { env: { ...process.env, PAPERCLIP_HOME: home, PORT: '3197', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
 child.stderr.on('data', () => {});
 const exited = new Promise(resolve => child.once('exit', resolve));
 const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
 process.once('SIGINT', stop); process.once('SIGTERM', stop);
 async function req(path, method = 'GET', body, actor = 'admin', expected = 200) {
  const response = await fetch(`${origin}${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-cosgral-fixture-actor': actor }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, expected, `${method} ${path}: ${response.status}`);
  return response.json();
 }
 try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('fixture startup timeout')), 90000); child.once('error', reject); child.once('exit', () => { clearTimeout(timer); reject(new Error('fixture exited')); }); child.stdout.on('data', data => { if (data.toString().includes('COSGRAL19_READY')) { clearTimeout(timer); resolve(); } }); });
  const { companyId, otherId, memberId, agentMemberId } = await req('/fixture');
  const base = `/api/companies/${companyId}/roles`;
  const input = { name: 'Własny wykonawca', description: 'Istniejące uprawnienie Paperclip', permissions: ['agents:create'] };
  const role = await req(base, 'POST', input, 'admin', 201);
  assert.equal(role.version, 1);
  assert.deepEqual((await req(base, 'GET', undefined, 'viewer')).map(r => r.name), [input.name]);
  for (const actor of ['viewer', 'limited', 'scoped', 'agent', 'anonymous', 'outsider']) await req(base, 'POST', { ...input, name: actor }, actor, actor === 'outsider' ? 404 : 403);
  await req(`/api/companies/${otherId}/roles`, 'GET', undefined, 'admin', 404);
  await req(base, 'POST', { ...input, permissions: ['root:all'] }, 'admin', 400);
  for (const id of [memberId, agentMemberId]) {
   const path = `/api/companies/${companyId}/members/${id}/custom-role`;
   for (const actor of ['limited', 'scoped']) await req(path, 'PUT', { roleId: role.id, version: 1 }, actor, 403);
   const receipt = await req(path, 'PUT', { roleId: role.id, version: 1 });
   assert.equal(receipt.memberId, id); assert.deepEqual(receipt.permissions, input.permissions);
  }
  assert.deepEqual(await req('/fixture/permissions'), { user: true, agent: true });
  const edited = await req(`${base}/${role.id}`, 'PUT', { name: 'Bez grantów', description: 'Nowa wersja', permissions: [], version: 1 });
  assert.equal(edited.version, 2);
  assert.deepEqual(await req('/fixture/permissions'), { user: true, agent: true });
  const applyPath = `/api/companies/${companyId}/members/${memberId}/custom-role`;
  await req(applyPath, 'PUT', { roleId: role.id, version: 1 }, 'admin', 409);
  await req(applyPath, 'PUT', { roleId: role.id, version: 2 });
  assert.deepEqual(await req('/fixture/permissions'), { user: false, agent: true });
  console.log('PASS t19: HTTP/DB, definicja i wersje, użytkownik + agent, rzeczywiste granty Paperclip, ACL/izolacja/brak eskalacji, bez modeli.');
 } finally {
  stop();
  let timer;
  await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 10000); })]); clearTimeout(timer);
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  await rm(home, { recursive: true, force: true });
 }
 await new Promise((resolve, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(3197, '127.0.0.1', () => probe.close(resolve)); });
 console.log('PASS t19: serwer zakończony, port 3197 wolny.');
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(error => { console.error(`FAIL t19: ${error.message}`); process.exitCode = 1; });
