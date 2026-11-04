#!/usr/bin/env node
// Live acceptance test. Creates durable test data; never prints response bodies or credentials.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile, realpath } from 'node:fs/promises';
import { basename, dirname, resolve, relative, isAbsolute } from 'node:path';
import { readPrivateAcceptanceJson as readPrivate, createPrivateAcceptanceFile } from './private-acceptance-file.mjs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const sockets = new Set();
let step = 'arguments';
const pass = message => console.log(`PASS ${message}`);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const repo = fileURLToPath(new URL('../', import.meta.url));
const { WebSocket } = createRequire(new URL('../server/package.json', import.meta.url))('ws');

async function privatePath(path) {
  const parent = await realpath(dirname(path));
  const actual = resolve(parent, basename(path));
  const rel = relative(await realpath(repo), actual);
  check(rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel), 'state and credentials must be outside repository');
  return actual;
}
async function main() {
  const { values } = parseArgs({ options: {
    api: { type: 'string' }, phase: { type: 'string', default: 'prepare' },
    'state-file': { type: 'string' }, 'credentials-file': { type: 'string' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node scripts/cosgral-e2e-two-accounts.mjs --api http://127.0.0.1:3198 --phase prepare|verify-after-restart --state-file /outside/repo/state.json [--credentials-file /outside/repo/credentials.json]');
    return;
  }
  check(values.api && values['state-file'], '--api and --state-file are required');
  check(['prepare', 'verify-after-restart'].includes(values.phase), 'invalid phase');
  const base = new URL(values.api);
  check(['http:', 'https:'].includes(base.protocol) && base.pathname === '/' && !base.username && !base.password && !base.search && !base.hash, '--api must be an origin without credentials/path');
  check(base.protocol === 'https:' || ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'HTTP is allowed only on loopback');
  const api = base.origin;
  const stateFile = await privatePath(resolve(values['state-file']));
  const credentialsFile = await privatePath(resolve(values['credentials-file'] ?? `${stateFile}.credentials.json`));
  check(stateFile !== credentialsFile, 'state and credentials paths must differ');
  let state, credentials;
  const jars = Object.fromEntries(['A', 'B', 'C', 'V'].map(key => [key, new Map()]));
  async function request(who, method, path, body, expected = [200, 201, 202], attempt = 0) {
    let response;
    try {
      response = await fetch(`${api}/api${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Origin: api, 'Content-Type': 'application/json',
          Cookie: [...jars[who]].map(([k, v]) => `${k}=${v}`).join('; ') },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new Error(`HTTP ${method} request failed (network/timeout); response and URL withheld`); }
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const equals = pair.indexOf('=');
      jars[who].set(pair.slice(0, equals), pair.slice(equals + 1));
    }
    if (response.status === 429 && path.startsWith('/auth/') && attempt < 2) {
      const seconds = Number(response.headers.get('retry-after') ?? 11);
      check(Number.isFinite(seconds) && seconds >= 0 && seconds <= 60, 'auth rate limit requires a later retry');
      console.log('INFO auth rate limit: waiting for server Retry-After');
      await response.body?.cancel();
      await new Promise(ok => setTimeout(ok, (seconds + 1) * 1000));
      return request(who, method, path, body, expected, attempt + 1);
    }
    // Invite paths and auth payloads can contain secrets: never include them in errors.
    check(expected.includes(response.status), `HTTP ${method}: expected ${expected.join('/')}, got ${response.status}; check server configuration/permissions`);
    if ([403, 404].includes(response.status)) return null;
    try { return await response.json(); } catch { throw new Error('expected JSON response'); }
  }
  step = 'authenticated health';
  const health = await request('A', 'GET', '/health');
  check(health.deploymentMode === 'authenticated' && health.status === 'ok', 'requires healthy authenticated instance');
  pass(step);
  if (values.phase === 'prepare') {
    const suffix = randomUUID();
    state = { users: Object.fromEntries(['A', 'B', 'C', 'V'].map(key => [key, { email: `cosgral-${key.toLowerCase()}-${suffix}@example.com` }])), commentIds: [] };
    credentials = { api, passwords: Object.fromEntries(['A', 'B', 'C', 'V'].map(key => [key, randomBytes(32).toString('base64url')])) };
    // Exclusive creation: a failed/partial run is inspectable and cannot be silently overwritten.
    await createPrivateAcceptanceFile(stateFile, JSON.stringify(state, null, 2));
    await createPrivateAcceptanceFile(credentialsFile, JSON.stringify(credentials));
    step = 'separate email/password registrations A, B, C, viewer';
    for (const key of Object.keys(state.users)) {
      const result = await request(key, 'POST', '/auth/sign-up/email', {
        name: `COSGRAL E2E ${key}`, email: state.users[key].email, password: credentials.passwords[key],
      });
      check(result.user?.id && result.user.email === state.users[key].email, 'signup identity mismatch');
      state.users[key].id = result.user.id;
      await save();
    }
    await save();
    pass(step);
    step = 'first admin bootstrap (fresh private instance required)';
    await request('A', 'POST', '/bootstrap/claim', {});
    pass(step);
    step = 'company and private project';
    state.companyId = (await request('A', 'POST', '/companies', { name: `COSGRAL two accounts ${suffix}` })).id;
    state.projectId = (await request('A', 'POST', `/companies/${state.companyId}/projects`, { name: 'Shared conversation E2E', visibility: 'private' })).id;
    check(state.companyId && state.projectId, 'missing company/project identity');
    await save();
    pass(step);
    step = 'real invitations, approval and private project access';
    for (const [key, role] of [['B', 'operator'], ['V', 'viewer']]) {
      const invite = await request('A', 'POST', `/companies/${state.companyId}/invites`, { allowedJoinTypes: 'human', humanRole: role });
      check(typeof invite.token === 'string', 'missing invite credential');
      const join = await request(key, 'POST', `/invites/${encodeURIComponent(invite.token)}/accept`, { requestType: 'human' });
      if (join.status === 'pending_approval') await request('A', 'POST', `/companies/${state.companyId}/join-requests/${join.id}/approve`, {});
      else check(join.status === 'approved', 'unexpected join state');
      await request(key, 'GET', `/projects/${state.projectId}/conversation`, undefined, [403, 404]);
      await request('A', 'POST', `/projects/${state.projectId}/access-members`, { subjectType: 'user', subjectId: state.users[key].id });
    }
    pass(step);
    step = 'parallel A/B create: one shared conversation';
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => request(i % 2 ? 'A' : 'B', 'POST', `/projects/${state.projectId}/conversation`, {})));
    check(results[0]?.issueId && results.every(row => row.issueId === results[0].issueId), 'parallel conversation IDs differ');
    state.issueId = results[0].issueId;
    await save();
    await sameConversation();
    pass(step);
    step = 'C denied project conversation and comments';
    for (const method of ['GET', 'POST']) await request('C', method, `/projects/${state.projectId}/conversation`, method === 'POST' ? {} : undefined, [403, 404]);
    await request('C', 'GET', `/issues/${state.issueId}/comments`, undefined, [403, 404]);
    await request('C', 'POST', `/issues/${state.issueId}/comments`, { body: 'Must be denied' }, [403, 404]);
    pass(step);
    step = 'C and anonymous denied company WebSocket';
    await deniedSocket('C');
    await deniedSocket(null);
    pass(step);
    step = 'viewer reads but cannot write';
    check((await request('V', 'GET', `/projects/${state.projectId}/conversation`)).issueId === state.issueId, 'viewer cannot read conversation');
    await request('V', 'POST', `/issues/${state.issueId}/comments`, { body: 'This write must be denied' }, [403, 404]);
    assert.deepEqual(await comments('A'), []);
    pass(step);
    step = 'A writes -> B receives live event <5s';
    const b = await connect('B');
    pass(`${step} (${await liveComment('A', b)} ms)`);
    step = 'B writes -> A receives live event <5s';
    const a = await connect('A');
    pass(`${step} (${await liveComment('B', a)} ms)`);
    step = 'A updates profile -> B receives content-free invalidation and reads the saved profile';
    const profileName = `Updated E2E ${suffix}`;
    const profileImage = 'https://example.test/cosgral-e2e-avatar.png';
    const profileEvent = waitMessage(b, event => event.type === 'activity.logged'
      && event.companyId === state.companyId && event.payload?.action === 'user.profile_updated'
      && event.payload.entityId === state.users.A.id);
    const [, event] = await Promise.all([
      request('A', 'PATCH', '/auth/profile', { name: profileName, image: profileImage }), profileEvent,
    ]);
    check(!JSON.stringify(event).includes(profileName) && !JSON.stringify(event).includes(profileImage), 'profile event contains profile content');
    const directory = await request('B', 'GET', `/companies/${state.companyId}/user-directory`);
    const updatedPerson = directory.users?.find(person => person.principalId === state.users.A.id);
    check(updatedPerson?.user?.name === profileName && updatedPerson.user.image === profileImage, 'second account cannot read updated profile');
    pass(step);
    step = 'B reconnect: ordered complete GET fallback, no duplicates/gaps';
    await close(b);
    const after = state.commentIds.at(-1);
    await addComment('A');
    await addComment('A');
    const reconnected = await connect('B');
    const missing = await request('B', 'GET', `/issues/${state.issueId}/comments?order=asc&after=${after}`);
    assert.deepEqual(missing.map(c => c.id), state.commentIds.slice(-2));
    await history();
    state.preparedThroughCommentId = state.commentIds.at(-1);
    await save();
    pass(`${step} (GAP: WebSocket has no durable replay; GET fallback verified)`);
    await close(reconnected);
    await close(a);
  } else {
    step = 'load private state and credentials';
    state = await readPrivate(stateFile);
    credentials = await readPrivate(credentialsFile);
    check(credentials.api === api, 'credentials belong to another API origin');
    check(state.preparedThroughCommentId && state.commentIds?.includes(state.preparedThroughCommentId) && state.issueId && state.commentIds?.length >= 4 && state.users?.A?.id && state.users?.B?.id, 'prepare incomplete');
    pass(step);
    step = 'A/B fresh login after server restart';
    for (const key of ['A', 'B']) {
      const result = await request(key, 'POST', '/auth/sign-in/email', { email: state.users[key].email, password: credentials.passwords[key] });
      check(result.user?.id === state.users[key].id, 'login identity mismatch');
    }
    pass(step);
    step = 'same conversation ID and exact history after restart';
    await sameConversation();
    await history();
    pass(step);
    step = 'new comment after restart reaches B via WebSocket <5s';
    const b = await connect('B');
    const elapsed = await liveComment('A', b);
    await history();
    await close(b);
    pass(`${step} (${elapsed} ms)`);
  }
  step = 'agent configuration A/B live synchronization';
  await agentConfigCheck();
  pass(step);
  step = 'project presence join/leave, typing and authorization';
  await presenceCheck();
  pass(step);
  pass(`${values.phase}: all assertions passed; test data retained`);

  async function agentConfigCheck() {
    // Disabled process agent: this scenario exercises saved config and live reads, never a model.
    if (!state.configAgentId) {
      const row = await request('A', 'POST', `/companies/${state.companyId}/agents`, {
        name: 'Config sync probe', role: 'engineer', adapterType: 'process',
        adapterConfig: { command: 'true' }, runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: false, maxConcurrentRuns: 1 } },
      });
      state.configAgentId = row.id; await save();
      await request('A', 'POST', `/agents/${row.id}/pause`, {});
    }
    const a = await connect('A'); const b = await connect('B');
    try {
      for (const [writer, reader, ws, concurrency] of [['A', 'B', b, 2], ['B', 'A', a, 3]]) {
        const changed = waitMessage(ws, event => event.type === 'activity.logged' && event.payload?.action === 'agent.updated' && event.payload?.entityId === state.configAgentId);
        const name = `Config sync ${writer} ${randomUUID()}`;
        const before = Date.now();
        await request(writer, 'PATCH', `/agents/${state.configAgentId}`, {
          name, capabilities: 'Configuration synchronization test', appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: writer === 'A' ? 'deep-tide' : 'coral-mint' }, budgetMonthlyCents: 1200,
          adapterConfig: { command: 'true', model: `config-test-${writer}` },
          runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: false, maxConcurrentRuns: concurrency } },
        });
        const event = await changed;
        check(Date.now() - before < 5000, 'agent config event took >=5s');
        check(!Object.hasOwn(event.payload, 'details') && !Object.hasOwn(event.payload, 'adapterConfig'), 'WS must only carry invalidation identity');
        const saved = await request(reader, 'GET', `/agents/${state.configAgentId}`);
        check(saved.name === name && saved.appearance?.paletteId === (writer === 'A' ? 'deep-tide' : 'coral-mint') && saved.adapterConfig?.model === `config-test-${writer}` && saved.budgetMonthlyCents === 1200 && saved.runtimeConfig?.heartbeat?.maxConcurrentRuns === concurrency, 'second account read stale agent configuration');
      }
      if (values.phase === 'prepare') {
        await request('C', 'GET', `/agents/${state.configAgentId}`, undefined, [403, 404]);
        await request('V', 'PATCH', `/agents/${state.configAgentId}`, { name: 'denied' }, [403, 404]);
      }
    } finally { await close(a); await close(b); }
  }
  async function presenceCheck() {
    const originalIds = (await comments('A')).map(row => row.id);
    const isPresence = event => event.type === 'project.conversation.presence' && event.projectId === state.projectId && event.companyId === state.companyId;
    const present = (event, key) => event.users?.find(user => user.userId === state.users[key].id);
    const a = socket('A', true);
    await waitMessage(a, event => isPresence(event) && present(event, 'A'));
    const joined = waitMessage(a, event => isPresence(event) && present(event, 'B'));
    const b = socket('B', true);
    await Promise.all([joined, waitMessage(b, event => isPresence(event) && present(event, 'A') && present(event, 'B'))]);
    const typing = waitMessage(b, event => isPresence(event) && present(event, 'A')?.typingUntil > Date.now());
    const sentAt = Date.now();
    a.send(JSON.stringify({ type: 'typing', active: true }));
    const frame = await typing;
    const expires = present(frame, 'A').typingUntil;
    check(expires >= sentAt + 4500 && expires <= Date.now() + 5100, 'typing must expire around five seconds');
    const stopped = waitMessage(b, event => isPresence(event) && present(event, 'A')?.typingUntil === 0);
    a.send(JSON.stringify({ type: 'typing', active: false }));
    await stopped;
    const left = waitMessage(a, event => isPresence(event) && !present(event, 'B'));
    await close(b); await left;
    // An ungraceful disconnect must also remove presence.
    const bAgain = socket('B', true);
    await waitMessage(bAgain, event => isPresence(event) && present(event, 'B'));
    const disconnected = waitMessage(a, event => isPresence(event) && !present(event, 'B'));
    bAgain.terminate(); await disconnected;
    await deniedSocket(null, true);
    if (values.phase === 'prepare') await deniedSocket('C', true);
    assert.deepEqual((await comments('A')).map(row => row.id), originalIds);
    await close(a);
  }
  async function save() { await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 }); }
  async function sameConversation() {
    for (const key of ['A', 'B']) check((await request(key, 'GET', `/projects/${state.projectId}/conversation`)).issueId === state.issueId, 'shared conversation changed');
  }
  async function comments(key) { return request(key, 'GET', `/issues/${state.issueId}/comments?order=asc`); }
  async function history() {
    for (const key of ['A', 'B']) {
      const rows = await comments(key);
      assert.deepEqual(rows.map(row => row.id), state.commentIds);
      check(new Set(rows.map(row => row.id)).size === rows.length, 'duplicate comments');
      rows.forEach((row, index) => {
        check(row.body === `COSGRAL E2E message ${index + 1}`, 'comment content/order changed');
        check(row.authorUserId === state.users[index === 1 ? 'B' : 'A'].id, 'comment author mismatch');
      });
    }
  }
  async function addComment(key) {
    const row = await request(key, 'POST', `/issues/${state.issueId}/comments`, { body: `COSGRAL E2E message ${state.commentIds.length + 1}`, clientRequestId: randomUUID() });
    check(row.id && row.authorUserId === state.users[key].id, 'comment receipt mismatch');
    state.commentIds.push(row.id);
    await save();
    return row;
  }
  function socket(key, presence = false) {
    const url = new URL(`/api/companies/${state.companyId}/events/ws`, api);
    if (presence) url.searchParams.set('projectConversation', state.projectId);
    url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url, { origin: api, handshakeTimeout: 5000,
      headers: key ? { Cookie: [...jars[key]].map(([k, v]) => `${k}=${v}`).join('; ') } : {} });
    sockets.add(ws);
    ws.on('error', () => {}); // Error details may contain request headers; report sanitized failure below.
    ws.once('close', () => sockets.delete(ws));
    return ws;
  }
  async function connect(key) {
    const ws = socket(key);
    // A subscription ACK is a server-side barrier, avoiding an upgrade/subscribe race.
    const ready = waitMessage(ws, event => event.type === 'live.subscribed' && event.revision === 1);
    ws.once('open', () => ws.send(JSON.stringify({ type: 'live.interests', version: 1, revision: 1, runIds: [] })));
    await ready;
    return ws;
  }
  function waitMessage(ws, predicate) {
    return new Promise((resolveMessage, reject) => {
      const timer = setTimeout(() => finish(new Error('WebSocket event/ACK timeout (5s)')), 5000);
      const onMessage = data => { try { const event = JSON.parse(data.toString()); if (predicate(event)) finish(null, event); } catch { finish(new Error('invalid WebSocket JSON')); } };
      const onClose = () => finish(new Error('WebSocket closed before expected event'));
      const onError = () => finish(new Error('WebSocket connection failed'));
      function finish(error, event) {
        clearTimeout(timer); ws.off('message', onMessage); ws.off('close', onClose); ws.off('error', onError);
        if (error) reject(error); else resolveMessage(event);
      }
      ws.on('message', onMessage); ws.once('close', onClose); ws.once('error', onError);
    });
  }
  async function liveComment(key, ws) {
    const start = performance.now();
    const received = waitMessage(ws, event => event.type === 'activity.logged' && event.companyId === state.companyId && event.payload?.action === 'issue.comment_added' && event.payload.entityId === state.issueId);
    // Attach rejection handlers immediately, including when POST fails first.
    const [row] = await Promise.all([addComment(key), received]);
    const elapsed = performance.now() - start;
    check(elapsed < 5000, 'live delivery took >=5s');
    check((await comments(key === 'A' ? 'B' : 'A')).some(c => c.id === row.id), 'live invalidation missing persisted comment');
    return Math.ceil(elapsed);
  }
  async function deniedSocket(key, presence = false) {
    const ws = socket(key, presence);
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => finish(new Error('unauthorized WS timed out instead of rejecting')), 5500);
      function finish(error) { clearTimeout(timer); ws.terminate(); error ? fail(error) : ok(); }
      ws.once('open', () => finish(new Error('unauthorized WS admitted')));
      ws.once('unexpected-response', (_req, response) => { response.resume(); finish([403, 404].includes(response.statusCode) ? null : new Error('unexpected WS rejection status')); });
      ws.once('error', () => finish(new Error('WS network error is not authorization proof')));
    });
  }
  async function close(ws) {
    await new Promise(ok => { const timer = setTimeout(() => { ws.terminate(); ok(); }, 1000); ws.once('close', () => { clearTimeout(timer); ok(); }); ws.close(); });
  }
}
main().catch(error => {
  // AssertionError details include response data. Only expose our static diagnostics.
  console.error(`FAIL ${step}: ${error instanceof assert.AssertionError ? 'ordered IDs/history assertion failed' : error.code ? `operation failed (${error.code})` : error.message}`);
  process.exitCode = 1;
}).finally(() => { for (const ws of sockets) ws.terminate(); });
