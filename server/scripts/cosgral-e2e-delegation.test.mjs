import { describe, expect, it, vi } from 'vitest';
import { assessDelegation, main } from '../../scripts/cosgral-e2e-delegation.mjs';

const stamp = n => new Date(n * 1000).toISOString();
function evidence() {
  return {
    conversation: { id: 'conversation', status: 'in_review', projectId: 'project', assigneeAgentId: 'coordinator' },
    comments: [
      { authorAgentId: 'coordinator', body: 'delegation-started', createdAt: stamp(1) },
      { authorAgentId: 'coordinator', body: 'delegation-complete worker ok done', createdAt: stamp(5) },
    ],
    issues: [{ id: 'child', projectId: 'project', parentId: 'conversation', assigneeAgentId: 'worker', status: 'done', completedAt: stamp(4) }],
    childComments: [{ authorAgentId: 'worker', body: 'ok', createdAt: stamp(3) }],
    runs: [{ id: 'c1', agentId: 'coordinator', status: 'succeeded', finishedAt: stamp(2) },
      { id: 'w1', agentId: 'worker', status: 'succeeded', finishedAt: stamp(4) },
      { id: 'c2', agentId: 'coordinator', status: 'succeeded', startedAt: stamp(4), finishedAt: stamp(6) }],
    coordinatorId: 'coordinator', workerId: 'worker', projectId: 'project',
  };
}

describe('delegation persisted acceptance', () => {
  it('accepts coordinator acknowledgement, one project child, worker completion and later report', () => {
    expect(assessDelegation(evidence())).toEqual([]);
  });
  it.each([
    ['no initial coordinator comment', s => { s.comments.shift(); }],
    ['missing conversation disposition', s => { s.conversation.status = 'in_progress'; }],
    ['wrong coordinator owner', s => { s.conversation.assigneeAgentId = 'other'; }],
    ['wrong project', s => { s.issues[0].projectId = 'other'; }],
    ['missing parent', s => { s.issues[0].parentId = null; }],
    ['duplicate worker task', s => { s.issues.push({ ...s.issues[0], id: 'extra' }); }],
    ['worker not done', s => { s.issues[0].status = 'in_progress'; }],
    ['operator ok comment', s => { s.childComments[0].authorAgentId = null; }],
    ['premature final report', s => { s.comments[1].createdAt = stamp(2); }],
    ['missing final report', s => { s.comments.pop(); }],
    ['no coordinator continuation', s => { s.runs.pop(); }],
    ['coordinator run before completion', s => { s.runs[2].startedAt = stamp(2); }],
    ['run overflow', s => { s.runs.push(...Array(6).fill(s.runs[0])); }],
    ['active run', s => { s.runs[0].status = 'running'; }],
    ['scheduled retry', s => { s.issues[0].scheduledRetry = { status: 'scheduled_retry' }; }],
  ])('rejects %s', (_name, mutate) => {
    const snapshot = evidence(); mutate(snapshot);
    expect(assessDelegation(snapshot).length).toBeGreaterThan(0);
  });
});

async function journey({ mutate = () => {}, failTrigger = false, signal = false, failPause = false, growingRuns = false, dropAgentCreatedFlag = false } = {}) {
  const { tmpdir } = await import('node:os');
  const { rm, access, readFile } = await import('node:fs/promises');
  const calls = [], configs = [], output = [];
  let clock = 0, triggered = false, polls = 0;
  const fetchImpl = vi.fn(async (url, options) => {
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
    } else if (path === '/companies/company/projects') result = { id: 'project' };
    else if (path === '/projects/project/conversation/coordinator') {
      expect(options.method).toBe('PUT'); expect(body).toEqual({ agentId: 'coordinator' });
      expect(requestUrl.search).toBe('?companyId=company');
    } else if (path === '/projects/project/conversation') {
      result = options.method === 'GET' ? null : { issueId: 'conversation', identifier: 'E2E-1', coordinatorAgentId: 'coordinator', canManageCoordinator: true };
    } else if (path === '/issues/conversation/comments' && options.method === 'POST') {
      triggered = true;
      if (signal) process.emit('SIGTERM');
      if (failTrigger) { status = 409; result = { error: 'DO-NOT-ECHO-SECRET' }; }
    } else if (path === '/issues/conversation') { polls++; result = current.conversation; }
    else if (path === '/issues/conversation/comments') result = current.comments;
    else if (path === '/companies/company/issues') {
      expect(requestUrl.searchParams.get('includeAgentCreatedTasks')).toBe('true');
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
  });
  let code;
  try {
    code = await main(['--api', 'http://127.0.0.1:3199', '--codex-home', tmpdir(), '--timeout-sec', '100'], {
      fetchImpl, now: () => clock, sleep: async ms => { clock += ms; }, log: line => output.push(line),
    });
    for (const config of configs) {
      expect(config.adapterType).toBe('codex_local');
      expect(config.adapterConfig).toMatchObject({ model: 'gpt-6.1-sol', modelReasoningEffort: 'low',
        dangerouslyBypassApprovalsAndSandbox: false, env: { CODEX_HOME: tmpdir() } });
      expect(config.adapterConfig.extraArgs).toBeUndefined();
      await access(`${config.adapterConfig.cwd}/.git`);
    }
    if (configs.length === 2) {
      expect(configs[1].reportsTo).toBe('coordinator');
      expect(configs[0].adapterConfig.cwd).not.toBe(configs[1].adapterConfig.cwd);
      const instructions = await readFile(configs[0].adapterConfig.instructionsFilePath, 'utf8');
      expect(instructions).toContain('parentId=conversation');
      expect(instructions).toContain('idempotencyKey=delegation-e2e:conversation:worker:v1');
      expect(instructions.match(/status in_review/g)).toHaveLength(2);
    }
  } finally {
    for (const config of configs) await rm(config.adapterConfig.cwd, { recursive: true, force: true });
  }
  return { code, calls, output: output.join('\n'), clock };
}

describe('mocked real CLI journey', () => {
  it('uses normal comment, assignment and completion wakes and waits 75s before cleanup', async () => {
    const result = await journey();
    expect(result.code).toBe(0);
    expect(result.clock).toBeGreaterThanOrEqual(75_000);
    expect(result.output).toContain('PASS:');
    const writes = result.calls.filter(c => ['POST', 'PATCH', 'PUT'].includes(c.method));
    expect(writes.some(c => c.path.endsWith('/wakeup'))).toBe(false);
    expect(writes.some(c => c.path === '/companies/company/issues')).toBe(false);
    expect(writes.filter(c => c.path === '/issues/conversation/comments')).toHaveLength(1);
    expect(writes.find(c => c.path === '/issues/conversation/comments').body.body).toContain("Poproś wykonawcę o zapisanie komentarza 'ok' w zadaniu i zamknięcie go.");
    expect(result.calls.find(c => c.path === '/companies/company/issues').query).toBe('?projectId=project&includeAgentCreatedTasks=true&limit=100');
    expect(writes.filter(c => c.path.endsWith('/pause'))).toHaveLength(2);
    expect(result.calls.findIndex(c => c.path === '/issues/child/comments')).toBeLessThan(result.calls.findIndex(c => c.path.endsWith('/pause')));
  });
  it.each([
    ['wrong parent', s => { s.issues[0].parentId = null; }],
    ['missing worker ok', s => { s.childComments = []; }],
    ['premature coordinator report', s => { if (s.comments[1]) s.comments[1].createdAt = stamp(2); }],
    ['pending retry', s => { s.issues[0].scheduledRetry = { status: 'scheduled_retry' }; }],
  ])('fails independent evidence for %s after trigger', async (_name, mutate) => {
    const result = await journey({ mutate });
    expect(result.code).toBe(1);
    expect(result.output).toContain('FAIL:');
    expect(result.calls.some(c => c.path === '/issues/conversation/comments' && c.method === 'POST')).toBe(true);
    expect(result.calls.filter(c => c.path.endsWith('/pause'))).toHaveLength(2);
  });
  it('fails when agent-created tasks are hidden by the default list filter', async () => {
    const result = await journey({ dropAgentCreatedFlag: true });
    expect(result.code).toBe(1);
    expect(result.output).toContain('expected exactly one worker task');
    expect(result.calls.some(c => c.path === '/issues/child/comments')).toBe(false);
  });
  it('does not expose arbitrary error bodies and still reads evidence and pauses both agents', async () => {
    const result = await journey({ failTrigger: true });
    expect(result.code).toBe(1);
    expect(result.output).toContain('HTTP 409');
    expect(result.output).not.toContain('DO-NOT-ECHO-SECRET');
    expect(result.calls.some(c => c.path === '/issues/child/comments')).toBe(true);
    expect(result.calls.filter(c => c.path.endsWith('/pause'))).toHaveLength(2);
    expect(result.calls.some(c => c.path === '/heartbeat-runs/w1/cancel')).toBe(true);
  });
  it('cleans up active work after a signal even when coordinator pause fails', async () => {
    const result = await journey({ signal: true, failPause: true });
    expect(result.code).toBe(1);
    expect(result.output).toContain('interrupted by signal');
    expect(result.calls.some(c => c.path === '/agents/worker/pause')).toBe(true);
    expect(result.calls.some(c => c.path === '/heartbeat-runs/w1/cancel')).toBe(true);
  });
  it('fails immediately on excessive runs and cancels queued runs', async () => {
    const result = await journey({ growingRuns: true });
    expect(result.code).toBe(1);
    expect(result.clock).toBe(0);
    expect(result.output).toContain('run bound exceeded');
    expect(result.calls.some(c => c.path === '/heartbeat-runs/extra/cancel')).toBe(true);
  });
});
