#!/usr/bin/env node
// Real local_trusted journey: only user comments and human card decisions trigger work.
import { parseArgs } from 'node:util';
import { isAbsolute, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { redact } from './cosgral-e2e-agent-lifecycle.mjs';

const active = new Set(['queued', 'scheduled_retry', 'running']);
const stamp = v => Date.parse(v ?? '');
export function assessStage(s) {
  const errors = [];
  const fail = (condition, message) => { if (condition) errors.push(message); };
  fail(s.conversation.projectId !== s.projectId || s.conversation.assigneeAgentId !== s.coordinatorId || s.conversation.status !== 'todo', 'conversation not settled with correct owner/project');
  fail(s.runs.length > 12 || new Set(s.runs.map(r => r.id)).size !== s.runs.length || s.runs.some(r => r.status !== 'succeeded'), 'unsuccessful/active or excessive runs');
  fail(s.runs.some(r => r.agentId === s.unavailableId), 'unavailable executor ran');
  fail([s.conversation, ...s.issues].some(i => i.scheduledRetry && i.scheduledRetry.status !== 'cancelled'), 'pending scheduled retry');
  fail(s.comments.some(c => c.authorType === 'system' && /^Błąd/.test(c.body)), 'system verification error');
  const children = s.issues.filter(i => i.title?.includes(s.marker));
  const cards = s.interactions.filter(i => i.title?.includes(s.marker));
  if (s.marker !== 'A-selection' || s.phase !== 'completed') {
    const card = cards[0];
    fail(cards.length !== 1 || card?.kind !== 'suggest_tasks' || card?.resolverPolicy !== 'human_only' || card?.createdByAgentId !== s.coordinatorId, 'missing unique human-only coordinator proposal');
    fail(card?.payload?.defaultParentId !== s.conversation.id || card?.payload?.tasks?.length !== 1 || card.payload.tasks.some(t => t.projectId !== s.projectId || t.assigneeAgentId !== s.workerId), 'proposal has wrong task scope/executor');
    fail(card?.status !== (s.phase === 'completed' ? 'accepted' : s.phase), 'card decision not persisted');
    if (s.phase !== 'pending') {
      fail(!card?.resolvedByUserId || Boolean(card?.resolvedByAgentId), 'decision not recorded as human resolution');
      if (s.phase === 'rejected') fail(Boolean(card?.result?.createdTasks?.length), 'rejected card has created-task receipt');
    }
    if (s.phase === 'completed') {
      fail(card?.result?.createdTasks?.length !== 1 || card.result.createdTasks[0].issueId !== children[0]?.id, 'accepted receipt does not match created task');
      fail(!Number.isFinite(stamp(card?.resolvedAt)) || stamp(card?.resolvedAt) > stamp(children[0]?.completedAt), 'missing decision before completion');
    }
  }
  if (s.phase !== 'completed') {
    fail(children.length !== 0, 'executable task created before approval or after rejection');
    return errors;
  }
  const child = children[0];
  fail(children.length !== 1 || child?.projectId !== s.projectId || child?.parentId !== s.conversation.id || child?.assigneeAgentId !== s.workerId, 'expected one correctly assigned project child');
  fail(child?.status !== 'done' || !Number.isFinite(stamp(child?.completedAt)), 'worker task not done');
  fail(!s.childComments.some(c => c.authorAgentId === s.workerId && c.body?.trim() === 'ok'), 'missing worker-authored ok');
  const report = s.comments.find(c => c.authorAgentId === s.coordinatorId && c.body?.includes(`complete ${s.marker}`) && c.body.includes(child?.identifier ?? child?.id) && /\bok\b/.test(c.body) && /\bdone\b/.test(c.body) && stamp(c.createdAt) > stamp(child?.completedAt));
  fail(!report, 'missing verified final coordinator report');
  fail(!s.runs.some(r => r.agentId === s.coordinatorId && stamp(r.startedAt) >= stamp(child?.completedAt) && stamp(r.finishedAt) >= stamp(report?.createdAt)), 'missing coordinator completion continuation');
  if (s.marker === 'A-selection') fail(!s.comments.some(c => c.authorAgentId === s.coordinatorId && c.body?.includes('selection-reason') && c.body.includes(s.workerId) && c.body.includes(s.unavailableId) && /kompetenc|capabil|rol|testowan|walidac|\bAPI\b/i.test(c.body) && /paused|wstrzym|woln|slot|obciąż/i.test(c.body) && stamp(c.createdAt) < stamp(child?.completedAt)), 'missing capability/availability selection rationale');
  return errors;
}

export async function main(args = process.argv.slice(2), { fetchImpl = fetch, now = Date.now, sleep = delay, log = console.log } = {}) {
  let api, company, project, conversation, interrupted = false;
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
    if (values.help) { say('node scripts/cosgral-e2e-approval.mjs --api http://127.0.0.1:3199 --codex-home "$HOME/.codex-c" [--timeout-sec 900]'); return 0; }
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
    company = await request('/companies', 'POST', { name: `COSGRAL approval e2e ${new Date(now()).toISOString()}` }); say(`Company: ${company.id}`);
    await request(`/companies/${company.id}`, 'PATCH', { requireBoardApprovalForNewAgents: false });
    for (const [role, capabilities] of [['coordinator', 'Koordynowanie zadań'], ['designer', 'Grafika, ilustracje, branding; bez testowania API'], ['api-worker', 'Testowanie API i walidacja odpowiedzi HTTP, integracje backendowe']]) {
      const cwd = await mkdtemp(join(tmpdir(), `cosgral-approval-${role}-`)); dirs.push(cwd);
      execFileSync('git', ['init', '-q'], { cwd });
      execFileSync('git', ['-c', 'user.name=E2E Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd });
      const instructionsFilePath = join(cwd, 'AGENTS.md'); await writeFile(instructionsFilePath, 'Follow the bounded Paperclip approval test instructions.\n');
      agents.push(await request(`/companies/${company.id}/agents`, 'POST', { name: `COSGRAL ${role}`, role: 'general', capabilities, runner: 'legacy', adapterType: 'codex_local', ...(agents.length ? { reportsTo: agents[0].id } : {}), adapterConfig: { engine: 'cli', cwd, instructionsFilePath, model: 'gpt-6.1-sol', modelReasoningEffort: 'medium', dangerouslyBypassApprovalsAndSandbox: false, env: { CODEX_HOME: codexHome }, timeoutSec: Math.min(timeout, 240) }, runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: false, maxConcurrentRuns: 1 } } }));
    }
    for (const agent of agents) {
      let ready = false;
      for (let i = 0; i < 45 && !interrupted; i++) { const state = await request(`/agents/${agent.id}`); if (state.status === 'idle' && state.lifecycleState === 'ready') { ready = true; break; } await sleep(2000); }
      if (!ready) throw new Error(`agent ${agent.id} not ready`);
    }
    await request(`/agents/${agents[1].id}/pause`, 'POST', {});
    project = await request(`/companies/${company.id}/projects`, 'POST', { name: 'Approval and executor selection e2e' });
    await request(`/projects/${project.id}/workspaces`, 'POST', { name: 'Disposable fixture repository', cwd: dirs[0], isPrimary: true });
    await request(`/projects/${project.id}/conversation/coordinator?companyId=${company.id}`, 'PUT', { agentId: agents[0].id });
    conversation = await request(`/projects/${project.id}/conversation`) ?? await request(`/projects/${project.id}/conversation`, 'POST', {});
    if (!conversation.issueId || conversation.coordinatorAgentId !== agents[0].id || !conversation.canManageCoordinator) throw new Error('unexpected conversation contract');
    const safety = 'Use the Paperclip skill and injected PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_RUN_ID; bearer auth and X-Paperclip-Run-Id for writes. Never print credentials/environment, change code, commit/push, poll/wait for another agent, or manually wake agents. Persist all effects via API. ';
    await writeFile(join(dirs[0], 'AGENTS.md'), `${safety}\nYou coordinate project conversation ${conversation.issueId}, company ${company.id}, project ${project.id}. Never change the conversation status. Each user request has a distinct marker A-selection, B-approve or C-reject. Use that marker in each task title and proposal title/clientKey and stable idempotency keys. Select the executor yourself from the supplied roster using capabilities and current availability. Before delegation or proposal, post a comment with selection-reason, the chosen UUID, alternative UUID and concrete capability/availability reasons in Polish. For A-selection create exactly one todo project task with parentId=${conversation.issueId}, assigned to the suitable available executor. For B-approve and C-reject use the existing suggest_tasks interaction API, human_only, payload version 1, defaultParentId=${conversation.issueId}, one draft with clientKey/title/description/projectId/assigneeAgentId. Do not create executable tasks yourself for those requests; only human acceptance may create them. Describe worker work: validate GET /api/health status ok, POST comment exactly ok on own task, PATCH own task done, exit. Return immediately after handoff/proposal. On rejection read persisted result, acknowledge with rejected C-reject, and never create a task for it. On acceptance do not duplicate the automatically created task. On automatic child completion, verify task done and worker-authored ok, then POST conversation comment containing complete <marker> plus child identifier and confirmed ok done. Exit immediately, without delegating again.\n`);
    for (const dir of dirs.slice(1)) await writeFile(join(dir, 'AGENTS.md'), `${safety}\nOn assigned task checkout if necessary, GET /api/health and verify status ok, POST /api/issues/{ownTaskId}/comments with body exactly ok, PATCH own task status done. Exit. Never create tasks or comment on parent.\n`);
    for (const agent of [agents[0], agents[2]]) await request(`/agents/${agent.id}`, 'PATCH', { runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1 } } });
    say(`Project: ${project.id}; conversation: ${conversation.issueId}; coordinator: ${agents[0].id}; paused designer: ${agents[1].id}; available API worker: ${agents[2].id}`);
    const deadline = now() + timeout * 1000;
    let allowedTaskIds = new Set();
    async function snapshot(marker, phase) {
      const current = await request(`/issues/${conversation.issueId}`);
      const issues = await request(`/companies/${company.id}/issues?projectId=${project.id}&includeAgentCreatedTasks=true&limit=100`);
      const tasks = issues.filter(i => i.id !== conversation.issueId);
      // Catch extra/wrongly titled work, including work assigned to the paused alternative.
      if (tasks.some(i => !allowedTaskIds.has(i.id) && !i.title?.includes(marker))) throw new Error('unexpected executable task outside current request');
      const selected = tasks.filter(i => i.title?.includes(marker));
      const detailed = await Promise.all(selected.map(i => request(`/issues/${i.id}`)));
      const childComments = (await Promise.all(selected.map(i => request(`/issues/${i.id}/comments`)))).flat();
      const runs = (await Promise.all(agents.map(a => request(`/companies/${company.id}/heartbeat-runs?agentId=${a.id}&limit=100`)))).flat();
      if (runs.length > 12 || runs.some(r => !active.has(r.status) && r.status !== 'succeeded')) throw new Error('failed or excessive run');
      return { marker, phase, projectId: project.id, coordinatorId: agents[0].id, unavailableId: agents[1].id, workerId: agents[2].id, conversation: current, issues: tasks.map(i => detailed.find(d => d.id === i.id) ?? i), childComments, comments: await request(`/issues/${conversation.issueId}/comments`), interactions: await request(`/issues/${conversation.issueId}/interactions`), runs };
    }
    async function waitFor(marker, phase, quietMs) {
      let since = null, previous = '', lastErrors = [];
      while (now() < deadline && !interrupted) {
        const s = await snapshot(marker, phase);
        if (phase !== 'completed' && s.issues.some(i => i.title?.includes(marker))) throw new Error(`${marker}: task exists without approval`);
        lastErrors = assessStage(s);
        const signature = JSON.stringify(s);
        if (!lastErrors.length) { if (signature !== previous) since = now(); since ??= now(); if (now() - since >= quietMs) return s; } else since = null;
        previous = signature; await sleep(2000);
      }
      throw new Error(`${marker}/${phase}: ${interrupted ? 'interrupted' : 'timeout'}; ${lastErrors.join('; ')}`);
    }
    await request(`/issues/${conversation.issueId}/comments`, 'POST', { body: 'A-selection: Wybierz samodzielnie odpowiedniego dostępnego wykonawcę do testu API: sprawdź GET /api/health (status ok), zapisz komentarz ok i zakończ zadanie. Zapisz uzasadnienie doboru kompetencji i obciążenia w rozmowie. Deleguj teraz, bez dodatkowej zgody.' });
    let s = await waitFor('A-selection', 'completed', 5000); allowedTaskIds = new Set(s.issues.map(i => i.id)); say('PASS A: executor chosen with capability/availability rationale; worker done; coordinator reported.');
    for (const [marker, decision] of [['B-approve', 'accept'], ['C-reject', 'reject']]) {
      await request(`/issues/${conversation.issueId}/comments`, 'POST', { body: `${marker}: Zaproponuj osobne zadanie testowania GET /api/health z komentarzem ok i zakończeniem zadania. Wybierz właściwego wykonawcę. Utwórz kartę propozycji i POCZEKAJ NA MOJĄ ZGODĘ. Nie twórz zadania przed zatwierdzeniem.` });
      s = await waitFor(marker, 'pending', 10000);
      const card = s.interactions.find(i => i.title?.includes(marker));
      say(`PASS ${marker}: pending human-only card ${card.id}; no task before decision (10s).`);
      await request(`/issues/${conversation.issueId}/interactions/${card.id}/${decision}`, 'POST', decision === 'accept' ? { selectedClientKeys: [card.payload.tasks[0].clientKey] } : { reason: 'E2E: odrzucam propozycję, nie wykonuj jej.' });
      s = await waitFor(marker, decision === 'accept' ? 'completed' : 'rejected', decision === 'accept' ? 5000 : 75000);
      allowedTaskIds = new Set(s.issues.map(i => i.id));
      say(decision === 'accept' ? 'PASS B: accepted receipt → assigned worker done → coordinator report.' : 'PASS C: rejected card; no task; no retries for 75s.');
    }
  } catch (error) { failures.push(error instanceof TypeError ? 'argument or HTTP connection error' : error.message); }
  finally {
    for (const agent of agents) {
      try { await request(`/agents/${agent.id}/pause`, 'POST', {}); } catch { failures.push(`cleanup pause ${agent.id} failed`); }
    }
    for (const agent of agents) {
      try {
        const runs = await request(`/companies/${company.id}/heartbeat-runs?agentId=${agent.id}&limit=100`);
        for (const run of runs.filter(r => active.has(r.status))) { try { await request(`/heartbeat-runs/${run.id}/cancel`, 'POST', {}); } catch { failures.push(`cleanup cancel ${run.id} failed`); } }
      } catch { failures.push(`cleanup runs ${agent.id} failed`); }
    }
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
  }
  say(failures.length ? `FAIL: ${[...new Set(failures)].join('; ')}` : 'PASS: live executor selection, human acceptance and rejection; persisted evidence; bounded successful runs.');
  return failures.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
