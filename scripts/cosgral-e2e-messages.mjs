#!/usr/bin/env node
// Żywe e2e lokalnego API: delegowanie, wiadomość agent–agent, odpowiedź i cisza po zakończeniu.
import { parseArgs } from 'node:util';
import { isAbsolute, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { redact } from './cosgral-e2e-agent-lifecycle.mjs';

const active = new Set(['queued', 'scheduled_retry', 'running']);
export function assessMessages(s) {
  const errors = [];
  const fail = (condition, message) => { if (condition) errors.push(message); };
  const child = s.children[0];
  fail(s.children.length !== 1 || child?.parentId !== s.conversationId || child?.projectId !== s.projectId || child?.assigneeAgentId !== s.workerId || child?.status !== 'done', 'expected one completed delegated child');
  fail(!s.entries.some(e => e.issueId === child?.id && e.kind === 'task' && e.category === 'tasks' && e.body.includes('Delegowanie')), 'missing classified delegation');
  fail(!s.entries.some(e => e.issueId === child?.id && e.kind === 'task' && e.category === 'tasks' && e.body.includes('done')), 'missing classified status');
  fail(!s.entries.some(e => e.issueId === child?.id && e.category === 'agents' && e.authorAgentId === s.coordinatorId && e.recipientAgentId === s.workerId && e.body.includes('t14-message')), 'missing agent sender/recipient');
  fail(!s.comments.some(c => c.authorAgentId === s.workerId && c.metadata?.recipientAgentId === s.coordinatorId && c.body.includes('t14-reply')), 'missing addressed reply');
  const messages = new Set(s.entries.filter(e => e.issueId === child?.id && e.authorAgentId === s.coordinatorId && e.recipientAgentId === s.workerId && e.body.includes('t14-message')).map(e => e.id));
  fail(!s.runs.some(r => r.agentId === s.workerId && messages.has(r.contextSnapshot?.wakeCommentId)), 'worker was not woken by the addressed message');
  const replies = new Set(s.comments.filter(c => c.authorAgentId === s.workerId && c.body.includes('t14-reply')).map(c => c.id));
  fail(s.runs.some(r => r.contextSnapshot?.wakeCommentId && replies.has(r.contextSnapshot.wakeCommentId)), 'reply caused another comment wake');
  fail(s.runs.length < 2 || s.runs.length > 8 || new Set(s.runs.map(r => r.id)).size !== s.runs.length || s.runs.some(r => r.status !== 'succeeded'), 'failed, active, duplicate or excessive runs');
  fail(s.children.some(c => c.scheduledRetry && c.scheduledRetry.status !== 'cancelled'), 'pending scheduled retry');
  fail(s.entries.some(e => e.kind === 'error' || e.category === 'errors'), 'runtime/system error');
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
    if (values.help) { say('node scripts/cosgral-e2e-messages.mjs --api http://127.0.0.1:3199 --codex-home "$HOME/.codex-c" [--timeout-sec 900]'); return 0; }
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
    company = await request('/companies', 'POST', { name: `COSGRAL messages e2e ${new Date(now()).toISOString()}` }); say(`Company: ${company.id}`);
    await request(`/companies/${company.id}`, 'PATCH', { requireBoardApprovalForNewAgents: false });
    for (const [role, capabilities] of [['coordinator', 'Koordynowanie zadań'], ['api-worker', 'Testowanie API i walidacja odpowiedzi HTTP, integracje backendowe']]) {
      const cwd = await mkdtemp(join(tmpdir(), `cosgral-messages-${role}-`)); dirs.push(cwd);
      execFileSync('git', ['init', '-q'], { cwd });
      execFileSync('git', ['-c', 'user.name=E2E Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd });
      const instructionsFilePath = join(cwd, 'AGENTS.md'); await writeFile(instructionsFilePath, 'Follow the bounded Paperclip messages test instructions.\n');
      agents.push(await request(`/companies/${company.id}/agents`, 'POST', { name: `COSGRAL ${role}`, role: 'general', capabilities, runner: 'legacy', adapterType: 'codex_local', ...(agents.length ? { reportsTo: agents[0].id } : {}), adapterConfig: { engine: 'cli', cwd, instructionsFilePath, model: 'gpt-6.1-sol', modelReasoningEffort: 'medium', dangerouslyBypassApprovalsAndSandbox: false, env: { CODEX_HOME: codexHome }, timeoutSec: Math.min(timeout, 240) }, runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: false, maxConcurrentRuns: 1 } } }));
    }
    for (const agent of agents) {
      let ready = false;
      for (let i = 0; i < 45 && !interrupted; i++) { const state = await request(`/agents/${agent.id}`); if (state.status === 'idle' && state.lifecycleState === 'ready') { ready = true; break; } await sleep(2000); }
      if (!ready) throw new Error(`agent ${agent.id} not ready`);
    }
    project = await request(`/companies/${company.id}/projects`, 'POST', { name: 'Chronologiczna komunikacja agentów t14' });
    await request(`/projects/${project.id}/workspaces`, 'POST', { name: 'Disposable fixture', cwd: dirs[0], isPrimary: true });
    await request(`/projects/${project.id}/conversation/coordinator?companyId=${company.id}`, 'PUT', { agentId: agents[0].id });
    conversation = await request(`/projects/${project.id}/conversation`);
    if (!conversation?.issueId || conversation.coordinatorAgentId !== agents[0].id) throw new Error('unexpected conversation contract');
    const safety = 'Use injected PAPERCLIP_API_URL, PAPERCLIP_API_KEY and PAPERCLIP_RUN_ID with bearer auth and X-Paperclip-Run-Id. Never print secrets or environment. No code changes, commits, manual wake, resume, reopen, polling, waiting, approvals bypass or extra tasks. Use only ordinary authorized APIs. Exit immediately after your instructions. ';
    await writeFile(join(dirs[0], 'AGENTS.md'), `${safety}You coordinate conversation ${conversation.issueId}, project ${project.id}, company ${company.id}, worker ${agents[1].id}. On human message t14-start: select executor using executor-selection, create exactly one child in backlog assigned to that worker, parentId=${conversation.issueId}, projectId=${project.id}, title=t14-worker, idempotencyKey=t14-worker. Then POST a comment to that CHILD with body exactly t14-message (this is an agent-to-agent message). Do not change its status to todo: only the addressed comment may wake the worker. Do not wake anybody manually. Exit. On child completion read persisted result and POST parent comment t14-complete, exit. Never repeat the delegation or message. Never close conversation.\n`);
    await writeFile(join(dirs[1], 'AGENTS.md'), `${safety}On assigned task: checkout if necessary, read its comments, verify t14-message from coordinator ${agents[0].id}. POST /api/issues/${conversation.issueId}/comments with body exactly t14-reply (addressed to coordinator). PATCH own task done. Exit. Do not create any tasks or other comments.\n`);
    for (const a of agents) await request(`/agents/${a.id}`, 'PATCH', { runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1 } } });
    say(`Project: ${project.id}; conversation: ${conversation.issueId}`);
    await request(`/issues/${conversation.issueId}/comments`, 'POST', { body: 't14-start: Deleguj jedno zadanie do wykonawcy, wyślij mu t14-message na jego zadaniu. Wykonawca odpowiada t14-reply w rozmowie i kończy zadanie. Po zakończeniu raport t14-complete. Bez kolejnych delegowań.' });
    const deadline = now() + timeout * 1000;
    let quietSince = null, previous = '', lastErrors = [];
    while (now() < deadline && !interrupted) {
      const children = await request(`/companies/${company.id}/issues?projectId=${project.id}&includeAgentCreatedTasks=true&limit=100`);
      const detailed = await Promise.all(children.filter(c => c.id !== conversation.issueId).map(c => request(`/issues/${c.id}`)));
      const comments = await request(`/issues/${conversation.issueId}/comments`);
      const runs = (await Promise.all(agents.map(a => request(`/companies/${company.id}/heartbeat-runs?agentId=${a.id}&limit=100`)))).flat();
      if (runs.length > 8 || runs.some(r => !active.has(r.status) && r.status !== 'succeeded')) throw new Error('failed or excessive runs');
      const entries = []; let cursor;
      do {
        const page = await request(`/issues/${conversation.issueId}/project-history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
        entries.push(...page.entries); cursor = page.nextCursor;
        if (entries.length > 1000) throw new Error('excessive conversation history');
      } while (cursor);
      const s = { coordinatorId: agents[0].id, workerId: agents[1].id, conversationId: conversation.issueId, projectId: project.id, children: detailed, entries, comments, runs };
      lastErrors = assessMessages(s);
      if (!comments.some(c => c.authorAgentId === agents[0].id && c.body.includes('t14-complete'))) lastErrors.push('missing coordinator completion');
      const signature = JSON.stringify(s);
      if (!lastErrors.length) { if (signature !== previous) quietSince = now(); quietSince ??= now(); if (now() - quietSince >= 75000) { completed = true; break; } } else quietSince = null;
      previous = signature; await sleep(2000);
    }
    if (!completed) throw new Error(`messages: ${interrupted ? 'interrupted' : 'timeout'}; ${lastErrors.join('; ')}`);
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
  if (completed && !failures.length) say("PASS: classified delegation/status, agent sender→recipient, reply persisted; no loop/retry for 75s.");
  return failures.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
