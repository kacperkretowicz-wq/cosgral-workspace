#!/usr/bin/env node
// REST contracts: packages/shared/src/validators/{company,agent,project,issue}.ts
// Routes: server/src/routes/{companies,agents,projects,issues}.ts
import { parseArgs } from 'node:util';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const active = new Set(['queued', 'scheduled_retry', 'running']);
const terminal = new Set(['succeeded', 'interrupted', 'failed', 'cancelled', 'timed_out']);
export function assessLifecycle({ issue, comments, runs, agentId }) {
  const reasons = [];
  if (issue.status !== 'done') reasons.push(`status zadania=${issue.status}, wymagany done`);
  if (!comments.some(c => c.authorAgentId === agentId && /\bok\b/i.test(c.body ?? '')))
    reasons.push('brak komentarza ok autorstwa testowego agenta');
  if (runs.length < 1 || runs.length > 2) reasons.push(`liczba runów=${runs.length}, wymagane 1–2`);
  if (runs.some(r => !terminal.has(r.status))) reasons.push('run nadal aktywny');
  if (issue.scheduledRetry && issue.scheduledRetry.status !== 'cancelled') reasons.push('oczekujące ponowienie zadania');
  return reasons;
}

// Server already redacts stored logs; this is an additional output boundary.
export function redact(value) {
  return String(value)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]')
    .replace(/\bBearer\s+[^\s"'\\]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-|pcp_|ghp_|github_pat_)[A-Za-z0-9_-]+/g, '[KEY REDACTED]')
    .replace(/((?:[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)|access_token|refresh_token|authorization)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,}]+)/gi, '$1[REDACTED]')
    .replace(/[\u001b\u009b][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export async function main(args = process.argv.slice(2)) {
  let api, agent, company, issue;
  let runs = [], reasons = [], interrupted = false;
  const abort = () => { interrupted = true; };
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const say = message => console.log(redact(message));
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${api}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    // Do not echo arbitrary error bodies (may contain configuration/credentials).
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
    return response.json();
  }
  const listRuns = () => request(`/companies/${company.id}/heartbeat-runs?agentId=${agent.id}&limit=100`);
  try {
    const { values } = parseArgs({ args, options: {
      api: { type: 'string' }, 'codex-home': { type: 'string' },
      'timeout-sec': { type: 'string', default: '300' }, help: { type: 'boolean' },
    } });
    if (values.help) {
      say('node scripts/cosgral-e2e-agent-lifecycle.mjs --api http://127.0.0.1:3199 --codex-home /absolute/codex/home [--timeout-sec 300]');
      return 0;
    }
    const url = new URL(values.api);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/')
      throw new Error('--api wymaga lokalnego adresu HTTP bez ścieżki i poświadczeń');
    api = url.origin;
    const codexHome = values['codex-home'];
    if (!codexHome || !isAbsolute(codexHome)) throw new Error('--codex-home wymaga ścieżki bezwzględnej');
    await access(codexHome); // Never read/copy auth.json.
    const timeout = Number(values['timeout-sec']);
    if (!Number.isFinite(timeout) || timeout < 10 || timeout > 1800) throw new Error('--timeout-sec: zakres 10–1800');
    const health = await request('/health');
    if (health.status !== 'ok' || health.deploymentMode !== 'local_trusted')
      throw new Error('wymagany zdrowy serwer local_trusted');
    const cwd = await mkdtemp(join(tmpdir(), 'cosgral-e2e-work-'));
    // Codex refuses to run outside a git repository (hello probe fails otherwise).
    execFileSync('git', ['init', '-q'], { cwd });
    company = await request('/companies', 'POST', { name: `COSGRAL e2e ${new Date().toISOString()}` });
    say(`Firma: ${company.id}`);
    await request(`/companies/${company.id}`, 'PATCH', { requireBoardApprovalForNewAgents: false });
    agent = await request(`/companies/${company.id}/agents`, 'POST', {
      name: 'COSGRAL lifecycle probe', role: 'general', adapterType: 'codex_local', runner: 'legacy',
      adapterConfig: { engine: 'cli', cwd, model: 'gpt-5.6-terra',
        dangerouslyBypassApprovalsAndSandbox: false, env: { CODEX_HOME: codexHome },
        timeoutSec: Math.min(timeout, 180), },
      runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: false, maxConcurrentRuns: 1 } },
    });
    say(`Agent: ${agent.id}; sandbox włączony; model gpt-5.6-terra`);
    const project = await request(`/companies/${company.id}/projects`, 'POST', { name: 'Lifecycle e2e' });
    say(`Projekt: ${project.id}`);
    // Suppress assignment wake until the single explicit wake below.
    issue = await request(`/companies/${company.id}/issues`, 'POST', {
      title: 'Lifecycle e2e: komentarz ok i done', status: 'todo', projectId: project.id, assigneeAgentId: agent.id,
      description: 'Użyj skilla Paperclip i wstrzykniętych PAPERCLIP_API_URL, PAPERCLIP_API_KEY oraz PAPERCLIP_RUN_ID. Sprawdź GET /agents/me, wykonaj checkout tego zadania jako bieżący agent, dodaj komentarz dokładnie "ok" i ustaw status done przez API. Dla mutacji użyj X-Paperclip-Run-Id. Nie drukuj tokenów ani środowiska, nie zmieniaj plików i nie uruchamiaj innych agentów. Nie wystarczy odpowiedź tekstowa: zapisz komentarz i status przez API.',
    });
    say(`Zadanie: ${issue.identifier ?? issue.id} (${issue.id})`);
    await request(`/agents/${agent.id}`, 'PATCH', {
      runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1 } },
    });
    const wake = await request(`/agents/${agent.id}/wakeup`, 'POST', {
      source: 'on_demand', triggerDetail: 'manual', reason: 'cosgral_lifecycle_e2e',
      payload: { issueId: issue.id }, idempotencyKey: `cosgral-e2e-${issue.id}`,
    });
    if (!wake.id) throw new Error('wake pominięty: brak ID runu');
    say(`Wake: ${wake.id}`);
    const deadline = Date.now() + timeout * 1000;
    let settledSince = null, previous = '';
    while (Date.now() < deadline && !interrupted) {
      runs = await listRuns();
      const current = await request(`/issues/${issue.id}`);
      const state = runs.map(r => `${r.id}:${r.status}`).join(', ');
      if (state !== previous) {
        say(`Runy: ${state || 'brak'}`);
        previous = state;
        settledSince = null;
      }
      if (runs.length > 2) throw new Error('przekroczony limit dwóch runów');
      if (runs.length && runs.every(r => terminal.has(r.status))) {
        settledSince ??= Date.now();
        // Observe beyond both ordinary retry delays (30/60s), including done.
        if (Date.now() - settledSince >= 75_000 && (!current.scheduledRetry || current.scheduledRetry.status === 'cancelled')) break;
      } else settledSince = null;
      await delay(2000);
    }
    if (interrupted) reasons.push('przerwano sygnałem');
    if (Date.now() >= deadline) reasons.push(`timeout po ${timeout}s (w tym obserwacja retry)`);
  } catch (error) {
    reasons.push(error instanceof TypeError ? 'błąd argumentów lub połączenia HTTP' : error.message);
  } finally {
    // Independent evidence, before pausing/cancelling: cleanup cannot manufacture PASS.
    if (issue && agent && company) {
      try {
        const finalIssue = await request(`/issues/${issue.id}`);
        const comments = await request(`/issues/${issue.id}/comments`);
        runs = await listRuns();
        reasons.push(...assessLifecycle({ issue: finalIssue, comments, runs, agentId: agent.id }));
        const finalAgent = await request(`/agents/${agent.id}`);
        say(`Gotowość agenta: ${finalAgent.lifecycleState ?? 'unknown'}; ${finalAgent.lifecycleError ?? 'bez błędu lifecycle'}`);
        say(`Odczyt końcowy: status=${finalIssue.status}; komentarze=${comments.length}; runy=${runs.length}`);
      } catch (error) { reasons.push(`odczyt końcowy: ${error.message}`); }
    }
    if (agent) {
      try {
        await request(`/agents/${agent.id}/pause`, 'POST', {});
        runs = await listRuns();
        for (const run of runs.filter(r => active.has(r.status)))
          await request(`/heartbeat-runs/${run.id}/cancel`, 'POST', {});
        if (runs.length > 2) reasons.push(`po wstrzymaniu wykryto ${runs.length} runów`);
        say('Agent wstrzymany; dane testowe zachowane do inspekcji.');
      } catch (error) { reasons.push(`sprzątanie: ${error.message}`); }
    }
    for (const run of runs.slice(0, 2)) {
      say(`Log runu ${run.id}:`);
      try {
        const offset = Math.max(0, (run.logBytes ?? 0) - 16384);
        const log = await request(`/heartbeat-runs/${run.id}/log?offset=${offset}&limitBytes=16384&alignStartToRecord=true`);
        say((log.content ?? '').split('\n').filter(Boolean).slice(-12).join('\n') || '(pusty)');
      } catch (error) { say(`Log niedostępny: ${error.message}`); }
    }
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
  say(reasons.length ? `FAIL: ${[...new Set(reasons)].join('; ')}` : 'PASS: API potwierdza done, komentarz agenta i 1–2 zakończone runy po obserwacji retry.');
  return reasons.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
