#!/usr/bin/env node
// Real local_trusted API journey. No synthetic task results or explicit worker wake.
import { parseArgs } from 'node:util';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { redact } from './cosgral-e2e-agent-lifecycle.mjs';

const active = new Set(['queued', 'scheduled_retry', 'running']);
const maxRuns = 6;
const time = value => Date.parse(value ?? '');
const retryPending = issue => issue.scheduledRetry && issue.scheduledRetry.status !== 'cancelled';
export function assessDelegation({ conversation, comments, issues, childComments, runs, coordinatorId, workerId, projectId }) {
  const reasons = [];
  if (conversation.assigneeAgentId !== coordinatorId || conversation.projectId !== projectId)
    reasons.push('conversation coordinator/project mismatch');
  if (conversation.status !== 'in_review') reasons.push('conversation missing in_review disposition');
  const children = issues.filter(i => i.assigneeAgentId === workerId);
  const child = children[0];
  if (children.length !== 1 || child?.parentId !== conversation.id || child?.projectId !== projectId)
    reasons.push('expected exactly one worker task with conversation parent and project');
  const initial = comments.find(c => c.authorAgentId === coordinatorId && c.body?.includes('delegation-started'));
  const final = comments.find(c => c.authorAgentId === coordinatorId && c.body?.includes('delegation-complete'));
  if (!initial || !Number.isFinite(time(initial.createdAt)) || time(initial.createdAt) >= time(child?.completedAt))
    reasons.push('missing initial coordinator comment before worker completion');
  if (child?.status !== 'done' || !Number.isFinite(time(child?.completedAt))) reasons.push('worker task not completed');
  if (!childComments.some(c => c.authorAgentId === workerId && c.body?.trim() === 'ok'))
    reasons.push('missing persisted worker ok comment');
  if (!final || !Number.isFinite(time(final.createdAt)) || !(time(final.createdAt) > time(child?.completedAt)))
    reasons.push('missing coordinator final report after worker completion');
  const coordinatorRuns = runs.filter(r => r.agentId === coordinatorId);
  const workerRuns = runs.filter(r => r.agentId === workerId);
  if (runs.length > maxRuns || coordinatorRuns.length < 2 || workerRuns.length < 1)
    reasons.push('run count outside bounds (coordinator >=2, worker >=1, total <=6)');
  if (!coordinatorRuns.some(r => time(r.startedAt) >= time(child?.completedAt)
    && time(r.finishedAt) >= time(final?.createdAt)))
    reasons.push('missing coordinator continuation run after child completion');
  if (new Set(runs.map(r => r.id)).size !== runs.length) reasons.push('duplicate run IDs');
  if (runs.some(r => r.status !== 'succeeded')) reasons.push('unsuccessful or active run');
  if ([conversation, ...issues].some(retryPending)) reasons.push('pending scheduled retry');
  return reasons;
}

// Dependency seams keep mock tests fast; the CLI always uses real HTTP and time.
export async function main(args = process.argv.slice(2), { fetchImpl = fetch, now = Date.now, sleep = delay, log = console.log } = {}) {
  let api, company, project, conversation;
  const agents = [];
  let runs = [], reasons = [], interrupted = false, observed = false;
  const abort = () => { interrupted = true; };
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const say = message => log(redact(message));
  async function request(path, method = 'GET', body) {
    const response = await fetchImpl(`${api}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
    return response.json();
  }
  const listRuns = async () => (await Promise.all(agents.map(agent => request(
    `/companies/${company.id}/heartbeat-runs?agentId=${agent.id}&limit=100`,
  )))).flat();
  const snapshot = async () => {
    const current = await request(`/issues/${conversation.issueId}`);
    const comments = await request(`/issues/${conversation.issueId}/comments`);
    const issues = await request(`/companies/${company.id}/issues?projectId=${project.id}&includeAgentCreatedTasks=true&limit=100`);
    // List the entire project so a duplicate or wrongly parented worker task fails.
    const children = issues.filter(i => i.assigneeAgentId === agents[1].id);
    const child = children.length === 1 ? await request(`/issues/${children[0].id}`) : null;
    const childComments = child ? await request(`/issues/${child.id}/comments`) : [];
    runs = await listRuns();
    return { conversation: current, comments,
      issues: issues.map(i => i.id === child?.id ? child : i), childComments, runs,
      coordinatorId: agents[0].id, workerId: agents[1].id, projectId: project.id };
  };
  try {
    const { values } = parseArgs({ args, options: {
      api: { type: 'string' }, 'codex-home': { type: 'string' },
      'timeout-sec': { type: 'string', default: '420' }, help: { type: 'boolean' },
    } });
    if (values.help) {
      say('node scripts/cosgral-e2e-delegation.mjs --api http://127.0.0.1:3199 --codex-home /absolute/codex/home [--timeout-sec 420]');
      return 0;
    }
    const url = new URL(values.api);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/')
      throw new Error('--api requires a local HTTP origin without credentials');
    api = url.origin;
    const codexHome = values['codex-home'];
    if (!codexHome || !isAbsolute(codexHome)) throw new Error('--codex-home requires an absolute path');
    await access(codexHome); // Never inspect or copy credentials.
    const timeout = Number(values['timeout-sec']);
    if (!Number.isFinite(timeout) || timeout < 90 || timeout > 1800) throw new Error('--timeout-sec: range 90–1800');
    const health = await request('/health');
    if (health.status !== 'ok' || health.deploymentMode !== 'local_trusted') throw new Error('healthy local_trusted server required');
    company = await request('/companies', 'POST', { name: `COSGRAL delegation e2e ${new Date(now()).toISOString()}` });
    say(`Company: ${company.id}`);
    await request(`/companies/${company.id}`, 'PATCH', { requireBoardApprovalForNewAgents: false });
    const dirs = [];
    for (const role of ['coordinator', 'worker']) {
      if (interrupted) throw new Error('interrupted');
      const cwd = await mkdtemp(join(tmpdir(), `cosgral-e2e-${role}-`));
      dirs.push(cwd);
      execFileSync('git', ['init', '-q'], { cwd });
      const instructionsFilePath = join(cwd, 'AGENTS.md');
      await writeFile(instructionsFilePath, 'Follow the bounded Paperclip delegation e2e instructions.\n');
      agents.push(await request(`/companies/${company.id}/agents`, 'POST', {
        name: `COSGRAL delegation ${role}`, role: 'general', adapterType: 'codex_local', runner: 'legacy',
        ...(role === 'worker' ? { reportsTo: agents[0].id } : {}),
        adapterConfig: { engine: 'cli', cwd, instructionsFilePath, model: 'gpt-6.1-sol', modelReasoningEffort: 'low',
          dangerouslyBypassApprovalsAndSandbox: false, env: { CODEX_HOME: codexHome }, timeoutSec: Math.min(timeout, 180) },
        runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: false, maxConcurrentRuns: 1 } },
      }));
    }
    project = await request(`/companies/${company.id}/projects`, 'POST', { name: 'Delegation e2e' });
    await request(`/projects/${project.id}/conversation/coordinator?companyId=${company.id}`, 'PUT', { agentId: agents[0].id });
    const existing = await request(`/projects/${project.id}/conversation`);
    conversation = existing ?? await request(`/projects/${project.id}/conversation`, 'POST', {});
    if (!conversation.issueId || conversation.coordinatorAgentId !== agents[0].id || conversation.canManageCoordinator !== true)
      throw new Error('unexpected project conversation contract');
    const safety = 'Use injected PAPERCLIP_API_URL, PAPERCLIP_API_KEY and PAPERCLIP_RUN_ID. Use Authorization Bearer and X-Paperclip-Run-Id for all writes. Use the Paperclip skill and scoped task checkout. Never print credentials or environment, change code, commit, push, start other agents, or poll/wait for another agent. Persist results through the API; a text-only response is insufficient.';
    await writeFile(join(dirs[0], 'AGENTS.md'), `${safety}\nThis is a project conversation owned via assigneeAgentId, not personal chat mode. On the user delegation request, first POST a comment containing exactly the marker delegation-started on issue ${conversation.issueId}. Then create exactly one todo task with POST /api/companies/${company.id}/issues, assigneeAgentId=${agents[1].id}, projectId=${project.id}, parentId=${conversation.issueId}, idempotencyKey=delegation-e2e:${conversation.issueId}:worker:v1. Describe the worker action: POST comment exactly ok on its own task and PATCH its own task status done. Do not manually wake the worker; assignment wakes it. After the initial handoff response, PATCH /api/issues/${conversation.issueId} with status in_review, then return immediately. Do not mark the conversation done or blocked. On the automatic child-completion wake, read the child and its comments; only after verifying done and worker-authored ok, POST a final conversation comment containing delegation-complete plus the child identifier and confirmed ok/done. After the final response, PATCH /api/issues/${conversation.issueId} with status in_review again, then exit. Do not create another task.\n`);
    await writeFile(join(dirs[1], 'AGENTS.md'), `${safety}\nOn your assigned task, checkout if necessary, POST /api/issues/{yourTaskId}/comments with {"body":"ok"}, then PATCH /api/issues/{yourTaskId} with {"status":"done"}. Exit immediately. Do not comment on the parent, create tasks or manually wake the coordinator.\n`);
    for (const agent of agents) await request(`/agents/${agent.id}`, 'PATCH', {
      runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1 } },
    });
    if (interrupted) throw new Error('interrupted');
    // This operator comment is the only trigger: normal assignment and completion
    // wake paths must perform all subsequent work, without script intervention.
    await request(`/issues/${conversation.issueId}/comments`, 'POST', {
      body: `Poproś wykonawcę o zapisanie komentarza 'ok' w zadaniu i zamknięcie go. Wykonawca: ${agents[1].id}. Potwierdź przekazanie znacznikiem delegation-started, a po zakończeniu pracy wykonawcy zapisz raport ze znacznikiem delegation-complete.`,
    });
    say(`Project: ${project.id}; conversation: ${conversation.identifier ?? conversation.issueId}; agents: ${agents.map(a => a.id).join(', ')}`);
    const deadline = now() + timeout * 1000;
    let settledSince = null, previous = '';
    while (now() < deadline && !interrupted) {
      const state = await snapshot();
      if (runs.length > maxRuns) throw new Error('run bound exceeded');
      const signature = JSON.stringify(state);
      const failures = assessDelegation(state);
      if (!failures.length) {
        if (signature !== previous) settledSince = now();
        settledSince ??= now();
        if (now() - settledSince >= 75_000) { observed = true; break; }
      } else settledSince = null;
      previous = signature;
      await sleep(2000);
    }
    if (interrupted) reasons.push('interrupted by signal');
    if (!observed) reasons.push(`timeout/incomplete 75s retry observation within ${timeout}s`);
  } catch (error) {
    reasons.push(error instanceof TypeError ? 'argument or HTTP connection error' : error.message);
  } finally {
    // Capture independent evidence BEFORE cleanup; pause/cancel cannot create PASS.
    if (conversation && agents.length === 2) {
      try { reasons.push(...assessDelegation(await snapshot())); }
      catch (error) { reasons.push(`final evidence: ${error.message}`); }
    }
    // Attempt every cleanup independently, even if an earlier pause/cancel fails.
    for (const agent of agents) {
      try { await request(`/agents/${agent.id}/pause`, 'POST', {}); }
      catch (error) { reasons.push(`pause ${agent.id}: ${error.message}`); }
    }
    for (const agent of agents) {
      try {
        const remaining = await request(`/companies/${company.id}/heartbeat-runs?agentId=${agent.id}&limit=100`);
        for (const run of remaining.filter(r => active.has(r.status))) {
          try { await request(`/heartbeat-runs/${run.id}/cancel`, 'POST', {}); }
          catch (error) { reasons.push(`cancel ${run.id}: ${error.message}`); }
        }
      } catch (error) { reasons.push(`cleanup runs ${agent.id}: ${error.message}`); }
    }
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
  say(reasons.length ? `FAIL: ${[...new Set(reasons)].join('; ')}` : 'PASS: coordinator → worker → coordinator persisted; bounded successful runs; no retries for 75s.');
  return reasons.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
