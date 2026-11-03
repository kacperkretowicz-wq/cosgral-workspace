import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLifecycle, redact } from './cosgral-e2e-agent-lifecycle.mjs';

const snapshot = {
  issue: { status: 'done', assigneeAgentId: 'agent' },
  comments: [{ authorAgentId: 'agent', body: 'ok' }],
  runs: [{ status: 'succeeded' }], agentId: 'agent',
};
test('requires independently persisted completion, agent comment and at most two settled runs', () => {
  assert.deepEqual(assessLifecycle(snapshot), []);
  for (const change of [
    { issue: { status: 'in_progress' } },
    { comments: [{ authorUserId: 'operator', body: 'ok' }] },
    { comments: [{ authorAgentId: 'other', body: 'ok' }] },
    { runs: [] },
    { runs: [{ status: 'running' }] },
    { runs: [{ status: 'scheduled_retry' }] },
    { runs: [{ status: 'unknown' }] },
    { runs: Array(3).fill({ status: 'succeeded' }) },
    { issue: { status: 'done', scheduledRetry: { status: 'scheduled_retry' } } },
  ]) assert.ok(assessLifecycle({ ...snapshot, ...change }).length > 0);
});
test('redacts JWTs, bearer tokens, credential assignments and provider keys from logs', () => {
  const secrets = ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.signature', 'sk-testABCDEFGHIJK', 'private-value'];
  const result = redact(`${secrets[0]} Bearer ${secrets[1]} PAPERCLIP_API_KEY=${secrets[2]} {"access_token":"${secrets[2]}"}`);
  for (const secret of secrets) assert.ok(!result.includes(secret));
});

test('CLI reports wake failure, reads independent evidence and pauses agent without crashing', async () => {
  const { createServer } = await import('node:http');
  const { spawn } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const calls = [];
  let config;
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    calls.push(`${req.method} ${req.url}`);
    let result = {};
    if (req.url === '/api/health') result = { status: 'ok', deploymentMode: 'local_trusted' };
    else if (req.url === '/api/companies' && req.method === 'POST') result = { id: 'company' };
    else if (req.url === '/api/companies/company/agents') { config = JSON.parse(text); result = { id: 'agent' }; }
    else if (req.url === '/api/companies/company/projects') result = { id: 'project' };
    else if (req.url === '/api/companies/company/issues') result = { id: 'issue' };
    else if (req.url === '/api/agents/agent/wakeup') { res.statusCode = 409; result = { error: 'secret-server-error-must-not-be-echoed' }; }
    else if (req.url === '/api/issues/issue') result = { status: 'todo' };
    else if (req.url === '/api/issues/issue/comments') result = [];
    else if (req.url.includes('heartbeat-runs?')) result = [];
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const child = spawn(process.execPath, [new URL('./cosgral-e2e-agent-lifecycle.mjs', import.meta.url).pathname,
      '--api', `http://127.0.0.1:${server.address().port}`, '--codex-home', tmpdir()], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const code = await new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', reject); });
    assert.equal(code, 1);
    assert.match(output, /FAIL:.*HTTP 409/);
    assert.ok(!output.includes('secret-server-error-must-not-be-echoed'));
    assert.ok(calls.includes('GET /api/issues/issue'));
    assert.ok(calls.includes('GET /api/issues/issue/comments'));
    assert.ok(calls.indexOf('GET /api/issues/issue') < calls.indexOf('POST /api/agents/agent/pause'));
    assert.equal(config.adapterType, 'codex_local');
    assert.equal(config.adapterConfig.dangerouslyBypassApprovalsAndSandbox, false);
    assert.equal(config.adapterConfig.extraArgs, undefined);
    assert.equal(config.adapterConfig.env.CODEX_HOME, tmpdir());
    assert.equal(config.adapterConfig.model, 'gpt-5.6-terra');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
