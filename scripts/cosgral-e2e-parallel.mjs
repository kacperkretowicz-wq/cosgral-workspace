#!/usr/bin/env node
// Żywy odbiór równoległości. W t15 przygotowany, bez odbioru z modelem.
// T15b dodaje limit dzieci i barierę zakończeń; żywy odbiór nadal wymagany.
import { parseArgs } from 'node:util';
import { isAbsolute, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { redact } from './cosgral-e2e-agent-lifecycle.mjs';

const active = new Set(['queued', 'scheduled_retry', 'running']);
export function assessParallel(s) {
  const errors = [];
  const fail = (condition, message) => { if (condition) errors.push(message); };
  fail(s.children.length !== 2 || s.children.some(c => c.parentId !== s.conversationId || c.projectId !== s.projectId || c.status !== 'done'), 'wymagane dwa zakończone dzieci w projekcie i rozmowie');
  fail(new Set(s.children.map(c => c.assigneeAgentId)).size !== 2 || s.children.some(c => !s.workerIds.includes(c.assigneeAgentId)), 'wymagani różni wykonawcy');
  fail(new Set(s.children.map(c => c.executionWorkspaceId)).size !== 2, 'współdzielony workspace');
  const workspaces = s.children.map(c => s.workspaces.find(w => w.id === c.executionWorkspaceId));
  fail(workspaces.some(w => !w?.cwd || w.providerType !== 'git_worktree' || s.sourceCwds.includes(w.cwd)) || new Set(workspaces.map(w => w?.cwd)).size !== 2, 'brak osobnych świeżych worktree');
  for (const worker of s.workerIds) fail(!s.comments.some(c => c.authorAgentId === s.coordinatorId && c.body.includes(`(${worker})`) && c.body.includes('Dobór wykonawcy:') && c.body.includes('referencyjny koszt') && c.body.includes('otwarte zadania')), 'brak zapisanego uzasadnienia doboru');
  const finalComments = s.comments.filter(c => c.authorAgentId === s.coordinatorId && c.body.trim() === 't15-complete');
  fail(finalComments.length !== 1, 'wymagany jeden raport końcowy');
  fail(s.runs.filter(r => r.agentId === s.coordinatorId).length !== 2, 'wymagane tylko dwa runy koordynatora');
  fail(s.runs.length !== 4 || new Set(s.runs.map(r => r.id)).size !== s.runs.length || s.runs.some(r => r.status !== 'succeeded'), 'wymagane cztery udane runy bez ponowień');
  const workers = s.children.map(c => s.runs.find(r => r.agentId === c.assigneeAgentId && (r.issueId ?? r.contextSnapshot?.issueId) === c.id));
  const starts = workers.map(r => Date.parse(r?.startedAt));
  const finishes = workers.map(r => Date.parse(r?.finishedAt));
  fail(workers.length !== 2 || [...starts, ...finishes].some(t => !Number.isFinite(t)) || Math.max(...starts) >= Math.min(...finishes), 'brak rzeczywiście równoległych runów dzieci');
  const reports = s.runs.filter(r => r.agentId === s.coordinatorId && r.contextSnapshot?.wakeReason === 'issue_children_completed');
  fail(reports.length !== 1 || !Number.isFinite(Date.parse(reports[0]?.startedAt)) || s.children.some(c => !Number.isFinite(Date.parse(c.completedAt))) || Date.parse(reports[0]?.startedAt) < Math.max(...s.children.map(c => Date.parse(c.completedAt))), 'wake raportu przed zakończeniem dzieci lub wielokrotny wake');
  fail(finalComments.length !== 1 || reports.length !== 1 || finalComments[0]?.createdByRunId !== reports[0]?.id, 'raport nie pochodzi z runu zakończenia dzieci');
  fail(s.children.some(c => c.scheduledRetry && c.scheduledRetry.status !== 'cancelled'), 'oczekujące retry');
  return errors;
}

export async function main(args = process.argv.slice(2), { fetchImpl = fetch, now = Date.now, sleep = delay, log = console.log } = {}) {
  let api, company, project, conversation, interrupted = false, completed = false;
  const agents = [], dirs = [], failures = [];
  const say = s => log(redact(s));
  const abort = () => { interrupted = true; };
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  async function request(path, method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(`${api}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000), redirect: 'error' });
    } catch (error) {
      throw new Error(`${method} ${path}: transport failure${error?.name === 'TimeoutError' ? ' (60s timeout)' : ''}`);
    }
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
    return response.json();
  }
  try {
    const { values } = parseArgs({ args, options: { api: { type: 'string' }, 'codex-home': { type: 'string' }, 'timeout-sec': { type: 'string', default: '900' }, help: { type: 'boolean' } } });
    if (values.help) { say('node scripts/cosgral-e2e-parallel.mjs --api http://127.0.0.1:3199 --codex-home "$HOME/.codex-c" [--timeout-sec 900]'); return 0; }
    const url = new URL(values.api);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('--api requires a local HTTP origin without credentials');
    api = url.origin;
    const codexHome = values['codex-home'];
    if (!codexHome || !isAbsolute(codexHome) || basename(codexHome) === '.codex-b') throw new Error('--codex-home requires an absolute authorized account path (never b)');
    await access(codexHome); // No credential reads, copies or output.
    const timeout = Number(values['timeout-sec']);
    if (!Number.isFinite(timeout) || timeout < 120 || timeout > 1800) throw new Error('--timeout-sec: range 120–1800');
    const health = await request('/health');
    if (health.status !== 'ok' || health.deploymentMode !== 'local_trusted') throw new Error('healthy local_trusted server required');
    company = await request('/companies', 'POST', { name: `COSGRAL parallel e2e ${new Date(now()).toISOString()}` }); say(`Company: ${company.id}`);
    await request(`/companies/${company.id}`, 'PATCH', { requireBoardApprovalForNewAgents: false });
    for (const [role, capabilities] of [['coordinator', 'Koordynowanie zadań'], ['cheap-worker', 'Testowanie API'], ['expensive-worker', 'Testowanie API']]) {
      const cwd = await mkdtemp(join(tmpdir(), `cosgral-parallel-${role}-`)); dirs.push(cwd);
      execFileSync('git', ['init', '-q'], { cwd });
      execFileSync('git', ['-c', 'user.name=E2E Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd });
      const instructionsFilePath = join(cwd, 'AGENTS.md'); await writeFile(instructionsFilePath, 'Follow the bounded Paperclip parallel test instructions.\n');
      agents.push(await request(`/companies/${company.id}/agents`, 'POST', { name: `COSGRAL ${role}`, role: 'general', capabilities, runner: 'legacy', adapterType: 'codex_local', ...(agents.length ? { reportsTo: agents[0].id } : {}), adapterConfig: { engine: 'cli', cwd, instructionsFilePath, model: role === 'expensive-worker' ? 'gpt-6-astra' : 'gpt-6.1-sol', modelReasoningEffort: 'medium', dangerouslyBypassApprovalsAndSandbox: false, env: { CODEX_HOME: codexHome }, timeoutSec: Math.min(timeout, 240) }, runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: false, maxConcurrentRuns: 1 } } }));
    }
    for (const agent of agents) {
      let ready = false;
      for (let i = 0; i < 45 && !interrupted; i++) { const state = await request(`/agents/${agent.id}`); if (state.status === 'idle' && state.lifecycleState === 'ready') { ready = true; break; } await sleep(2000); }
      if (!ready) throw new Error(`agent ${agent.id} not ready`);
    }
    project = await request(`/companies/${company.id}/projects`, 'POST', { name: 'Odbiór równoległości t15' });
    await request(`/projects/${project.id}/workspaces`, 'POST', { name: 'Disposable fixture', cwd: dirs[0], isPrimary: true });
    await request(`/projects/${project.id}/conversation/coordinator?companyId=${company.id}`, 'PUT', { agentId: agents[0].id });
    conversation = await request(`/projects/${project.id}/conversation`);
    if (!conversation?.issueId || conversation.coordinatorAgentId !== agents[0].id) throw new Error('unexpected conversation contract');
    const safety = 'Use injected PAPERCLIP_API_URL, PAPERCLIP_API_KEY and PAPERCLIP_RUN_ID with bearer auth and X-Paperclip-Run-Id. Never print secrets or environment. No code changes, commits, manual wake, resume, reopen, polling, waiting or extra tasks. Preserve sandbox and approval policy. Use only ordinary authorized APIs. Exit immediately after your instructions. ';
    // Syntetyczne obciążenie poza projektem odbioru, bez uruchamiania zadania.
    await request(`/companies/${company.id}/issues`, 'POST', { title: 't15-existing-load', assigneeAgentId: agents[2].id, status: 'backlog' });
    await writeFile(join(dirs[0], 'AGENTS.md'), `${safety}You coordinate conversation ${conversation.issueId}, project ${project.id}, company ${company.id}. On t15-start select executor for title Testowanie API using executor-selection (no override); expect worker ${agents[1].id}. Create a child backlog for it with title t15-cheap, parentId=${conversation.issueId}, projectId=${project.id}, idempotencyKey=t15-cheap. Select a second executor using preferredAgentId=${agents[2].id}, record the explicit override and create a second child backlog with title t15-expensive and idempotencyKey=t15-expensive. Both tasks: GET health, save ok comment and mark own task done. Then change BOTH children to todo in this turn; do not wait for the first. Exit. On child completion read both children. When both are done, post exactly one conversation comment t15-complete and exit. Never repeat delegation or report; never close conversation.\n`);
    for (const dir of dirs.slice(1)) await writeFile(join(dir, 'AGENTS.md'), `${safety}On assigned task checkout if necessary, GET /api/health and verify status ok, POST /api/issues/{ownTaskId}/comments with body exactly ok, PATCH own task done. Exit. Do not comment on parent, create tasks or manually wake anyone.\n`);
    for (const a of agents) await request(`/agents/${a.id}`, 'PATCH', { runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1 } } });
    say(`Project: ${project.id}; conversation: ${conversation.issueId}`);
    await request(`/issues/${conversation.issueId}/comments`, 'POST', { body: 't15-start: Utwórz w tej samej turze dwa niezależne równoległe zadania Testowanie API dla dwóch różnych wykonawców. Wybierz najpierw tańszego, do drugiego zadania jawnie wskaż droższego. Każdy ma własny świeży worktree. Po obu done jeden raport t15-complete, bez dalszych zadań.' });
    const deadline = now() + timeout * 1000;
    let quietSince = null, previous = '', lastErrors = [];
    while (now() < deadline && !interrupted) {
      const children = await request(`/companies/${company.id}/issues?projectId=${project.id}&includeAgentCreatedTasks=true&limit=100`);
      const detailed = await Promise.all(children.filter(c => c.id !== conversation.issueId).map(c => request(`/issues/${c.id}`)));
      const comments = await request(`/issues/${conversation.issueId}/comments`);
      const runs = (await Promise.all(agents.map(a => request(`/companies/${company.id}/heartbeat-runs?agentId=${a.id}&limit=100`)))).flat();
      if (runs.length > 4 || runs.some(r => !active.has(r.status) && r.status !== 'succeeded')) throw new Error('failed or excessive runs');
      const workspaceIds = [...new Set(detailed.map(c => c.executionWorkspaceId).filter(Boolean))];
      const workspaces = await Promise.all(workspaceIds.map(id => request(`/execution-workspaces/${id}`)));
      const s = { coordinatorId: agents[0].id, workerIds: agents.slice(1).map(a => a.id), conversationId: conversation.issueId, projectId: project.id, children: detailed, workspaces, sourceCwds: dirs, comments, runs };
      lastErrors = assessParallel(s);
      const signature = JSON.stringify(s);
      if (!lastErrors.length) { if (signature !== previous) quietSince = now(); quietSince ??= now(); if (now() - quietSince >= 75000) { completed = true; break; } } else quietSince = null;
      previous = signature; await sleep(2000);
    }
    if (!completed) throw new Error(`parallel: ${interrupted ? 'interrupted' : 'timeout'}; ${lastErrors.join('; ')}`);
  } catch (error) { failures.push(error instanceof TypeError ? 'argument or HTTP connection error' : error.message); }
  finally {
    for (const a of agents) {
      try { await request(`/agents/${a.id}/pause`, 'POST', {}); } catch { failures.push('cleanup pause failed'); }
    }
    for (const a of agents) {
      try {
        const runs = await request(`/companies/${company.id}/heartbeat-runs?agentId=${a.id}&limit=100`);
        for (const r of runs.filter(r => active.has(r.status))) await request(`/heartbeat-runs/${r.id}/cancel`, 'POST', {});
      } catch { failures.push('cleanup cancel failed'); }
    }
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
    // Retain disposable repositories and company as inspectable evidence, as in approval e2e.
    if (failures.length) say(`FAIL: ${[...new Set(failures)].join('; ')}`);
  }
  if (completed && !failures.length) say("PASS: dwa równoległe dzieci, różni wykonawcy/worktree, dobór w rozmowie, jeden raport, cztery runy, cisza przez 75s.");
  return failures.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
