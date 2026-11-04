import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessStage, main } from './cosgral-e2e-approval.mjs';

function fixture(phase = 'completed') {
  return { phase, marker: 'A-selection', coordinatorId: 'coordinator', workerId: 'worker', unavailableId: 'paused',
    projectId: 'project', conversation: { id: 'conversation', projectId: 'project', assigneeAgentId: 'coordinator', status: 'todo' },
    comments: [{ authorAgentId: 'coordinator', body: 'selection-reason worker paused kompetencje wolny', createdAt: '2026-01-01T00:00:01Z' },
      { authorAgentId: 'coordinator', body: 'complete A-selection TEST-2 ok done', createdAt: '2026-01-01T00:00:04Z' }],
    issues: phase === 'completed' ? [{ id: 'task', identifier: 'TEST-2', title: 'A-selection', projectId: 'project', parentId: 'conversation', assigneeAgentId: 'worker', status: 'done', completedAt: '2026-01-01T00:00:03Z' }] : [],
    childComments: [{ authorAgentId: 'worker', body: 'ok' }], interactions: phase === 'completed' ? [] : [{ id: 'card', resolvedByUserId: phase === 'rejected' ? 'local-board' : null, kind: 'suggest_tasks', title: 'A-selection', status: phase === 'pending' ? 'pending' : 'rejected', resolverPolicy: 'human_only', createdByAgentId: 'coordinator', payload: { defaultParentId: 'conversation', tasks: [{ clientKey: 'A-selection', title: 'A-selection', projectId: 'project', assigneeAgentId: 'worker' }] } }],
    runs: [{ id: 'c1', agentId: 'coordinator', status: 'succeeded', startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:02Z' }, { id: 'w', agentId: 'worker', status: 'succeeded' }, { id: 'c2', agentId: 'coordinator', status: 'succeeded', startedAt: '2026-01-01T00:00:03Z', finishedAt: '2026-01-01T00:00:05Z' }] };
}
test('accepts persisted choice and completed worker/report', () => assert.deepEqual(assessStage(fixture()), []));
for (const [name, mutate] of [
  ['wrong executor', s => s.issues[0].assigneeAgentId = 'paused'],
  ['wrong parent', s => s.issues[0].parentId = 'other'],
  ['wrong project', s => s.issues[0].projectId = 'other'],
  ['duplicate', s => s.issues.push({ ...s.issues[0], id: 'duplicate' })],
  ['missing rationale', s => s.comments.shift()],
  ['premature report', s => s.comments[1].createdAt = '2026-01-01T00:00:02Z'],
  ['operator result', s => s.childComments[0].authorAgentId = null],
  ['failed run', s => s.runs[0].status = 'failed'],
  ['retry', s => s.issues[0].scheduledRetry = { status: 'scheduled_retry' }],
  ['silent verification error', s => s.comments.push({ authorType: 'system', body: 'Błąd tury koordynatora' })],
]) test(`rejects ${name}`, () => { const s = fixture(); mutate(s); assert.ok(assessStage(s).length); });
for (const phase of ['pending', 'rejected']) {
  test(`${phase} card has no executable task`, () => assert.deepEqual(assessStage(fixture(phase)), []));
  test(`${phase} rejects premature task`, () => { const s = fixture(phase); s.issues = fixture().issues; assert.ok(assessStage(s).length); });
}
test('rejects agent-resolvable or wrongly scoped proposal', () => {
  for (const mutate of [s => s.interactions[0].resolverPolicy = 'anyone', s => s.interactions[0].payload.tasks[0].assigneeAgentId = 'paused', s => s.interactions[0].payload.defaultParentId = 'other']) {
    const s = fixture('pending'); mutate(s); assert.ok(assessStage(s).length);
  }
});
test('accepted task must match persisted card receipt, human resolver and decision time', () => {
  const s = fixture(); s.marker = 'B-approve'; s.issues[0].title = s.marker;
  s.comments[1].body = 'complete B-approve TEST-2 ok done';
  const card = fixture('pending').interactions[0]; card.title = s.marker; card.status = 'accepted';
  card.resolvedByUserId = 'local-board'; card.resolvedAt = '2026-01-01T00:00:02Z';
  card.result = { createdTasks: [{ issueId: 'task' }] }; s.interactions = [card];
  assert.deepEqual(assessStage(s), []);
  for (const mutate of [x => x.interactions[0].result.createdTasks[0].issueId = 'other', x => x.interactions[0].resolvedAt = '2026-01-01T00:00:04Z', x => x.interactions[0].resolvedByUserId = null]) {
    const invalid = structuredClone(s); mutate(invalid); assert.ok(assessStage(invalid).length);
  }
});
test('CLI refuses remote origin and prints no HTTP response body', async () => {
  const logs = []; let calls = 0;
  assert.equal(await main(['--api', 'https://example.com', '--codex-home', '/tmp'], { log: s => logs.push(s), fetchImpl: async () => { calls++; } }), 1);
  assert.equal(calls, 0); assert.match(logs.join('\n'), /FAIL/);
  const code = await main(['--api', 'http://127.0.0.1:3197', '--codex-home', '/tmp'], { log: s => logs.push(s), fetchImpl: async () => new Response('secret-response', { status: 500 }) });
  assert.equal(code, 1); assert.ok(!logs.join('\n').includes('secret-response'));
});

async function journey({ earlyTask = false, badReceipt = false, failPause = false, signal = false } = {}) {
  const { rm } = await import('node:fs/promises');
  const configs = [], calls = [], logs = [];
  let clock = 0, marker, phase, decisionAt = null, finalAt = null;
  const known = [];
  const state = () => {
    const s = fixture(phase);
    s.marker = marker;
    const task = { ...fixture().issues[0], id: `task-${marker}`, identifier: `TEST-${marker}`, title: marker };
    s.issues = [...known, ...(phase === 'completed' || earlyTask && phase === 'pending' ? [task] : [])];
    s.comments[1].body = `complete ${marker} ${task.identifier} ok done`;
    if (marker !== 'A-selection') {
      const card = fixture('pending').interactions[0];
      card.title = marker; card.payload.tasks[0].clientKey = marker;
      card.status = phase === 'completed' ? 'accepted' : phase;
      card.resolvedAt = '2026-01-01T00:00:02Z'; card.resolvedByUserId = 'local-board';
      card.result = { createdTasks: phase === 'completed' ? [{ issueId: badReceipt ? 'wrong' : task.id }] : [] }; s.interactions = [card];
    }
    return s;
  };
  const fetchImpl = async (url, options) => {
    const u = new URL(url), path = u.pathname.replace(/^\/api/, '');
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, method: options.method, body, at: clock });
    let result = {}, status = 200;
    if (path === '/health') result = { status: 'ok', deploymentMode: 'local_trusted' };
    else if (path === '/companies' && options.method === 'POST') result = { id: 'company' };
    else if (path === '/companies/company/agents') { configs.push(body); result = { id: ['coordinator', 'paused', 'worker'][configs.length - 1] }; }
    else if (/^\/agents\/(coordinator|paused|worker)$/.test(path) && options.method === 'GET') result = { status: 'idle', lifecycleState: 'ready' };
    else if (path === '/companies/company/projects') result = { id: 'project' };
    else if (path === '/projects/project/conversation') result = { issueId: 'conversation', coordinatorAgentId: 'coordinator', canManageCoordinator: true };
    else if (path === '/issues/conversation/comments' && options.method === 'POST') {
      if (marker && phase === 'completed') known.push(...state().issues.filter(i => !known.some(k => k.id === i.id)));
      marker = body.body.split(':')[0]; phase = marker === 'A-selection' ? 'completed' : 'pending';
      if (signal) process.emit('SIGTERM');
    } else if (/\/interactions\/card\/(accept|reject)$/.test(path)) { decisionAt = clock; phase = path.endsWith('accept') ? 'completed' : 'rejected'; }
    else if (path === '/issues/conversation') result = state().conversation;
    else if (path === '/issues/conversation/comments') result = state().comments;
    else if (path === '/issues/conversation/interactions') result = state().interactions;
    else if (path === '/companies/company/issues') { assert.equal(u.searchParams.get('includeAgentCreatedTasks'), 'true'); result = state().issues; }
    else if (path.startsWith('/issues/task-')) result = path.endsWith('/comments') ? state().childComments : state().issues.find(i => i.id === path.split('/')[2]);
    else if (path === '/companies/company/heartbeat-runs') result = marker ? state().runs.filter(r => r.agentId === u.searchParams.get('agentId')) : [];
    else if (/^\/agents\/[^/]+\/pause$/.test(path)) { if (marker) finalAt = clock; if (failPause && marker) status = 500; }
    else if (!['/companies/company', '/projects/project/workspaces', '/projects/project/conversation/coordinator'].includes(path) && !/^\/agents\/(coordinator|worker)$/.test(path)) throw new Error(`unexpected ${options.method} ${path}`);
    return new Response(JSON.stringify(result), { status });
  };
  let code;
  try {
    code = await main(['--api', 'http://127.0.0.1:3197', '--codex-home', '/tmp', '--timeout-sec', '140'], { fetchImpl, now: () => clock, sleep: async ms => { clock += ms; }, log: s => logs.push(s) });
    for (const config of configs) { assert.equal(config.adapterConfig.model, 'gpt-6.1-sol'); assert.equal(config.adapterConfig.modelReasoningEffort, 'medium'); assert.equal(config.adapterConfig.dangerouslyBypassApprovalsAndSandbox, false); }
  } finally { for (const config of configs) await rm(config.adapterConfig.cwd, { recursive: true, force: true }); }
  return { code, calls, logs, decisionAt, finalAt };
}
test('full journey uses user-only triggers and observes rejection for 75s before cleanup', async () => {
  const r = await journey(); assert.equal(r.code, 0, r.logs.join('\n'));
  assert.ok(r.finalAt - r.decisionAt >= 75000);
  assert.equal(r.calls.filter(c => c.path === '/issues/conversation/comments' && c.method === 'POST').length, 3);
  assert.equal(r.calls.filter(c => /\/interactions\/card\/(accept|reject)$/.test(c.path)).length, 2);
  assert.ok(!r.calls.some(c => /wakeup|\/companies\/company\/issues$/.test(c.path) && c.method === 'POST'));
});
for (const fault of ['earlyTask', 'badReceipt', 'failPause', 'signal']) test(`journey fails on ${fault}`, async () => {
  const r = await journey({ [fault]: true }); assert.equal(r.code, 1); assert.ok(r.logs.at(-1).startsWith('FAIL:'));
  assert.ok(r.calls.some(c => c.path === '/agents/worker/pause'));
});

test('a resolved card must record a human resolver and rejection must have no created-task receipt', () => {
  const s = fixture('rejected');
  s.interactions[0].resolvedByAgentId = 'coordinator';
  assert.ok(assessStage(s).length, 'agent resolution is not a human decision');
  s.interactions[0].resolvedByAgentId = null; s.interactions[0].resolvedByUserId = 'local-board';
  s.interactions[0].result = { createdTasks: [{ issueId: 'unexpected' }] };
  assert.ok(assessStage(s).length, 'rejection cannot retain a created-task receipt');
});
test('concrete API skills and paused graphics alternative are a valid rationale without the word competence', () => {
  const s = fixture(); s.comments[0].body = 'selection-reason worker: testowanie API, walidacja HTTP; 1 wolny slot. paused: grafika, bez testowania API; paused.';
  assert.deepEqual(assessStage(s), []);
});

test('CLI refuses the forbidden b account before contacting the server', async () => {
  let calls = 0;
  assert.equal(await main(['--api', 'http://127.0.0.1:3197', '--codex-home', '/home/box/.codex-b'], { log: () => {}, fetchImpl: async () => { calls++; } }), 1);
  assert.equal(calls, 0);
});
test('HTTP transport errors identify method/path without exposing arbitrary exception text', async () => {
  const logs = [];
  assert.equal(await main(['--api', 'http://127.0.0.1:3197', '--codex-home', '/tmp'], { log: s => logs.push(s), fetchImpl: async () => { throw new Error('secret-transport-detail'); } }), 1);
  assert.match(logs.at(-1), /GET \/health: transport failure/);
  assert.ok(!logs.join('\n').includes('secret-transport-detail'));
});
