import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessDelegation, main } from './cosgral-e2e-delegation.mjs';

const stamp = n => new Date(n * 1000).toISOString();
function evidence() {
  return {
    conversation: { id: 'conversation', status: 'todo', projectId: 'project', assigneeAgentId: 'coordinator' },
    comments: [
      { authorAgentId: 'coordinator', body: 'delegation-started', createdAt: stamp(1) },
      { authorAgentId: 'coordinator', body: 'delegation-complete E2E-2 ok done', createdAt: stamp(5) },
    ],
    issues: [{ id: 'child', identifier: 'E2E-2', projectId: 'project', parentId: 'conversation', assigneeAgentId: 'worker', status: 'done', completedAt: stamp(4) }],
    childComments: [{ authorAgentId: 'worker', body: 'ok', createdAt: stamp(3) }],
    runs: [{ id: 'c1', agentId: 'coordinator', status: 'succeeded', finishedAt: stamp(2) },
      { id: 'w1', agentId: 'worker', status: 'succeeded', finishedAt: stamp(4) },
      { id: 'c2', agentId: 'coordinator', status: 'succeeded', startedAt: stamp(4), finishedAt: stamp(6) }],
    coordinatorId: 'coordinator', workerId: 'worker', projectId: 'project',
  };
}

describe('delegation persisted acceptance', () => {
  it('accepts coordinator acknowledgement, one project child, worker completion and later report', () => {
    assert.deepEqual(assessDelegation(evidence()), []);
  });
  [
    ['no initial coordinator comment', s => { s.comments.shift(); }],
    ['conversation got task disposition', s => { s.conversation.status = 'in_review'; }],
    ['conversation blocked as task', s => { s.conversation.status = 'blocked'; }],
    ['wrong coordinator owner', s => { s.conversation.assigneeAgentId = 'other'; }],
    ['wrong project', s => { s.issues[0].projectId = 'other'; }],
    ['missing parent', s => { s.issues[0].parentId = null; }],
    ['duplicate worker task', s => { s.issues.push({ ...s.issues[0], id: 'extra' }); }],
    ['worker not done', s => { s.issues[0].status = 'in_progress'; }],
    ['operator ok comment', s => { s.childComments[0].authorAgentId = null; }],
    ['premature final report', s => { s.comments[1].createdAt = stamp(2); }],
    ['missing final report', s => { s.comments.pop(); }],
    ['marker-only final report', s => { s.comments[1].body = 'delegation-complete'; }],
    ['report for wrong child', s => { s.comments[1].body = 'delegation-complete E2E-3 ok done'; }],
    ['report missing worker result', s => { s.comments[1].body = 'delegation-complete E2E-2 done'; }],
    ['report missing completion', s => { s.comments[1].body = 'delegation-complete E2E-2 ok'; }],
    ['no coordinator continuation', s => { s.runs.pop(); }],
    ['coordinator run before completion', s => { s.runs[2].startedAt = stamp(2); }],
    ['run overflow', s => { s.runs.push(...Array(6).fill(s.runs[0])); }],
    ['active run', s => { s.runs[0].status = 'running'; }],
    ['scheduled retry', s => { s.issues[0].scheduledRetry = { status: 'scheduled_retry' }; }],
  ].forEach(([name, mutate]) => it(`rejects ${name}`, () => {
    const snapshot = evidence(); mutate(snapshot);
    assert.ok(assessDelegation(snapshot).length > 0);
  }));
});

async function journey({ mutate = () => {}, failTrigger = false, signal = false, failPause = false, growingRuns = false, dropAgentCreatedFlag = false } = {}) {
  const { tmpdir } = await import('node:os');
  const { rm, access, readFile } = await import('node:fs/promises');
  const calls = [], configs = [], output = [];
  let clock = 0, triggered = false, polls = 0;
  const readinessReads = new Map();
  const fetchImpl = async (url, options) => {
    const requestUrl = new URL(url);
    const path = requestUrl.pathname.replace(/^\/api/, '');
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, query: requestUrl.search, method: options.method, body });
    let result = {};
    let status = 200;
    const current = evidence();
    // Before the trigger no agent work exists. The mocked server then advances
    // acknowledgement -> worker -> completion wake, independently of script writes.
    if (triggered && polls < 2) {
      current.comments.pop(); current.issues[0].status = 'todo';
      current.issues[0].completedAt = null; current.childComments = [];
      current.runs = [current.runs[0], { ...current.runs[1], status: 'running' }];
    }
    mutate(current);
    if (path === '/health') result = { status: 'ok', deploymentMode: 'local_trusted' };
    else if (path === '/companies' && options.method === 'POST') result = { id: 'company' };
    else if (path === '/companies/company/agents') {
      configs.push(body); result = { id: configs.length === 1 ? 'coordinator' : 'worker' };
    } else if (/^\/agents\/(coordinator|worker)$/.test(path) && options.method === 'GET') {
      const reads = (readinessReads.get(path) ?? 0) + 1;
      readinessReads.set(path, reads);
      result = reads === 1 ? { status: 'paused', lifecycleState: 'verifying' } : { status: 'idle', lifecycleState: 'ready' };
    } else if (path === '/companies/company/projects') result = { id: 'project' };
    else if (path === '/projects/project/conversation/coordinator') {
      assert.equal(options.method, 'PUT'); assert.deepEqual(body, { agentId: 'coordinator' });
      assert.equal(requestUrl.search, '?companyId=company');
    } else if (path === '/projects/project/conversation') {
      result = options.method === 'GET' ? null : { issueId: 'conversation', identifier: 'E2E-1', coordinatorAgentId: 'coordinator', canManageCoordinator: true };
    } else if (path === '/issues/conversation/comments' && options.method === 'POST') {
      triggered = true;
      if (signal) process.emit('SIGTERM');
      if (failTrigger) { status = 409; result = { error: 'DO-NOT-ECHO-SECRET' }; }
    } else if (path === '/issues/conversation') { polls++; result = current.conversation; }
    else if (path === '/issues/conversation/comments') result = current.comments;
    else if (path === '/companies/company/issues') {
      assert.equal(requestUrl.searchParams.get('includeAgentCreatedTasks'), 'true');
      result = !dropAgentCreatedFlag && requestUrl.searchParams.get('includeAgentCreatedTasks') === 'true' ? current.issues : [];
    }
    else if (path === '/issues/child') result = current.issues[0];
    else if (path === '/issues/child/comments') result = current.childComments;
    else if (path === '/companies/company/heartbeat-runs') {
      const agentId = new URL(url).searchParams.get('agentId');
      result = current.runs.filter(r => r.agentId === agentId);
      if (growingRuns && agentId === 'worker') result.push(...Array(5).fill({ id: 'extra', agentId, status: 'queued' }));
    } else if (path === '/agents/coordinator/pause' && failPause) status = 500;
    else if (!/^\/companies\/company$|^\/agents\/(coordinator|worker)(\/pause)?$|^\/heartbeat-runs\/[^/]+\/cancel$/.test(path))
      throw new Error(`Unexpected mock request ${options.method} ${path}`);
    return new Response(JSON.stringify(result), { status });
  };
  let code;
  try {
    code = await main(['--api', 'http://127.0.0.1:3199', '--codex-home', tmpdir(), '--timeout-sec', '100'], {
      fetchImpl, now: () => clock, sleep: async ms => { clock += ms; }, log: line => output.push(line),
    });
    for (const config of configs) {
      assert.equal(config.adapterType, 'codex_local');
      assert.partialDeepStrictEqual(config.adapterConfig, { model: 'gpt-6.1-sol', modelReasoningEffort: 'low',
        dangerouslyBypassApprovalsAndSandbox: false, env: { CODEX_HOME: tmpdir() } });
      assert.equal(config.adapterConfig.extraArgs, undefined);
      await access(`${config.adapterConfig.cwd}/.git`);
    }
    if (configs.length === 2) {
      assert.equal(configs[1].reportsTo, 'coordinator');
      assert.notEqual(configs[0].adapterConfig.cwd, configs[1].adapterConfig.cwd);
      const instructions = await readFile(configs[0].adapterConfig.instructionsFilePath, 'utf8');
      assert.ok(instructions.includes('parentId=conversation'));
      assert.ok(instructions.includes('idempotencyKey=delegation-e2e:conversation:worker:v1'));
      assert.ok(instructions.includes('Do not change the conversation status'));
      assert.ok(!instructions.includes('with status in_review'));
    }
  } finally {
    for (const config of configs) await rm(config.adapterConfig.cwd, { recursive: true, force: true });
  }
  return { code, calls, output: output.join('\n'), clock };
}

describe('mocked real CLI journey', () => {
  it('uses normal comment, assignment and completion wakes and waits 75s before cleanup', async () => {
    const result = await journey();
    assert.equal(result.code, 0);
    assert.ok(result.clock >= 75_000);
    assert.ok(result.output.includes('PASS:'));
    const writes = result.calls.filter(c => ['POST', 'PATCH', 'PUT'].includes(c.method));
    assert.equal(writes.some(c => c.path.endsWith('/wakeup')), false);
    assert.equal(writes.some(c => c.path === '/companies/company/issues'), false);
    assert.equal(writes.filter(c => c.path === '/issues/conversation/comments').length, 1);
    assert.ok(writes.find(c => c.path === '/issues/conversation/comments').body.body.includes("Poproś wykonawcę o zapisanie komentarza 'ok' w zadaniu i zamknięcie go."));
    assert.equal(result.calls.find(c => c.path === '/companies/company/issues').query, '?projectId=project&includeAgentCreatedTasks=true&limit=100');
    assert.equal(writes.filter(c => c.path.endsWith('/pause')).length, 2);
    assert.ok(result.calls.findIndex(c => c.path === '/issues/child/comments') < result.calls.findIndex(c => c.path.endsWith('/pause')));
  });
  [
    ['wrong parent', s => { s.issues[0].parentId = null; }],
    ['missing worker ok', s => { s.childComments = []; }],
    ['premature coordinator report', s => { if (s.comments[1]) s.comments[1].createdAt = stamp(2); }],
    ['pending retry', s => { s.issues[0].scheduledRetry = { status: 'scheduled_retry' }; }],
  ].forEach(([name, mutate]) => it(`fails independent evidence for ${name} after trigger`, async () => {
    const result = await journey({ mutate });
    assert.equal(result.code, 1);
    assert.ok(result.output.includes('FAIL:'));
    assert.equal(result.calls.some(c => c.path === '/issues/conversation/comments' && c.method === 'POST'), true);
    assert.equal(result.calls.filter(c => c.path.endsWith('/pause')).length, 2);
  }));
  it('fails when agent-created tasks are hidden by the default list filter', async () => {
    const result = await journey({ dropAgentCreatedFlag: true });
    assert.equal(result.code, 1);
    assert.ok(result.output.includes('expected exactly one worker task'));
    assert.equal(result.calls.some(c => c.path === '/issues/child/comments'), false);
  });
  it('does not expose arbitrary error bodies and still reads evidence and pauses both agents', async () => {
    const result = await journey({ failTrigger: true });
    assert.equal(result.code, 1);
    assert.ok(result.output.includes('HTTP 409'));
    assert.ok(!result.output.includes('DO-NOT-ECHO-SECRET'));
    assert.equal(result.calls.some(c => c.path === '/issues/child/comments'), true);
    assert.equal(result.calls.filter(c => c.path.endsWith('/pause')).length, 2);
    assert.equal(result.calls.some(c => c.path === '/heartbeat-runs/w1/cancel'), true);
  });
  it('cleans up active work after a signal even when coordinator pause fails', async () => {
    const result = await journey({ signal: true, failPause: true });
    assert.equal(result.code, 1);
    assert.ok(result.output.includes('interrupted by signal'));
    assert.equal(result.calls.some(c => c.path === '/agents/worker/pause'), true);
    assert.equal(result.calls.some(c => c.path === '/heartbeat-runs/w1/cancel'), true);
  });
  it('fails immediately on excessive runs and cancels queued runs', async () => {
    const result = await journey({ growingRuns: true });
    assert.equal(result.code, 1);
    assert.equal(result.clock, 4000); // Only the two readiness waits; no delegation polling.
    assert.ok(result.output.includes('run bound exceeded'));
    assert.equal(result.calls.some(c => c.path === '/heartbeat-runs/extra/cancel'), true);
  });
});
