import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessParallel, main } from './cosgral-e2e-parallel.mjs';
const fixture = () => ({
  coordinatorId: 'coordinator', workerIds: ['w1', 'w2'], conversationId: 'chat', projectId: 'project',
  children: ['w1', 'w2'].map((worker, i) => ({ id: `child${i}`, parentId: 'chat', projectId: 'project', assigneeAgentId: worker, status: 'done', completedAt: '2026-11-04T01:00:09Z', executionWorkspaceId: `space${i}` })),
  workspaces: [0, 1].map(i => ({ id: `space${i}`, providerType: 'git_worktree', cwd: `/tmp/worktree${i}` })),
  sourceCwds: ['/tmp/source'],
  comments: [{ authorAgentId: 'coordinator', body: 't15-complete', createdByRunId: 'final' }, ...['w1', 'w2'].map(w => ({ authorAgentId: 'coordinator', body: `Dobór wykonawcy: Worker (${w}). referencyjny koszt; otwarte zadania` }))],
  runs: [
    { id: 'r0', agentId: 'coordinator', status: 'succeeded', startedAt: '2026-11-04T01:00:00Z', finishedAt: '2026-11-04T01:00:03Z' },
    ...['w1', 'w2'].map((w, i) => ({ id: `worker${i}`, agentId: w, issueId: `child${i}`, status: 'succeeded', startedAt: '2026-11-04T01:00:02Z', finishedAt: '2026-11-04T01:00:10Z' })),
    { id: 'final', agentId: 'coordinator', status: 'succeeded', startedAt: '2026-11-04T01:00:11Z', finishedAt: '2026-11-04T01:00:15Z', contextSnapshot: { wakeReason: 'issue_children_completed' } },
  ],
});
test('akceptuje dwa zakończone równoległe dzieci z izolacją i jednym raportem', () => assert.deepEqual(assessParallel(fixture()), []));
for (const [name, change] of [
  ['jedno dziecko', s => s.children.pop()],
  ['inny projekt', s => { s.children[0].projectId = 'other'; }],
  ['inny rodzic', s => { s.children[0].parentId = 'other'; }],
  ['ten sam wykonawca', s => { s.children[1].assigneeAgentId = 'w1'; }],
  ['niedokończone', s => { s.children[1].status = 'in_progress'; }],
  ['ten sam workspace', s => { s.children[1].executionWorkspaceId = 'space0'; }],
  ['ten sam katalog', s => { s.workspaces[1].cwd = s.workspaces[0].cwd; }],
  ['katalog źródłowy', s => { s.workspaces[0].cwd = '/tmp/source'; }],
  ['brak worktree', s => { s.workspaces[0].providerType = 'local'; }],
  ['brak workspace', s => { s.workspaces = []; }],
  ['brak powodu wyboru', s => { s.comments.pop(); }],
  ['powtórzony raport', s => { s.comments.push(s.comments[0]); }],
  ['raport poza runem zakończenia', s => { s.comments[0].createdByRunId = 'r0'; }],
  ['brak daty zakończenia dziecka', s => { delete s.children[0].completedAt; }],
  ['brak raportu', s => { s.comments.shift(); }],
  ['błędny autor raportu', s => { s.comments[0].authorAgentId = 'w1'; }],
  ['przedwczesny raport', s => { s.runs[3].startedAt = '2026-11-04T01:00:05Z'; }],
  ['brak wake zakończenia', s => { s.runs[3].contextSnapshot = {}; }],
  ['sekwencyjne runy', s => { s.runs[2].startedAt = '2026-11-04T01:00:10Z'; }],
  ['brak powiązania runu', s => { s.runs[1].issueId = 'other'; }],
  ['retry', s => { s.children[0].scheduledRetry = { status: 'scheduled' }; }],
  ['błąd runu', s => { s.runs[1].status = 'failed'; }],
  ['nadmiar runów', s => { s.runs.push({ id: 'extra', status: 'succeeded' }); }],
  ['powtórzony run', s => { s.runs[2].id = s.runs[1].id; }],
]) test(`odrzuca: ${name}`, () => { const s = fixture(); change(s); assert.ok(assessParallel(s).length); });
test('help bez API/modelu', async () => assert.equal(await main(['--help'], { fetchImpl: () => { throw Error('forbidden'); }, log: () => {} }), 0));
test('odrzuca zdalne API przed połączeniem', async () => assert.equal(await main(['--api', 'https://example.com', '--codex-home', '/tmp/unused'], { fetchImpl: () => { throw Error('forbidden'); }, log: () => {} }), 1));
