import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessMessages, main } from './cosgral-e2e-messages.mjs';
const fixture = () => ({
  coordinatorId: 'coordinator', workerId: 'worker', conversationId: 'chat', projectId: 'project',
  children: [{ id: 'child', parentId: 'chat', projectId: 'project', assigneeAgentId: 'worker', status: 'done' }],
  entries: [
    { id: 'created', issueId: 'child', kind: 'task', category: 'tasks', body: 'Delegowanie' },
    { id: 'done', issueId: 'child', kind: 'task', category: 'tasks', body: 'Zmiana statusu · done' },
    { id: 'message', issueId: 'child', kind: 'comment', category: 'agents', authorAgentId: 'coordinator', recipientAgentId: 'worker', body: 't14-message' },
  ],
  comments: [{ id: 'reply', authorAgentId: 'worker', metadata: { recipientAgentId: 'coordinator' }, body: 't14-reply' }],
  runs: [{ id: 'r1', agentId: 'coordinator', status: 'succeeded' }, { id: 'r2', agentId: 'worker', status: 'succeeded', contextSnapshot: { wakeCommentId: 'message' } }],
});
test('accepts delegated real message evidence', () => assert.deepEqual(assessMessages(fixture()), []));
for (const [name, change] of [
  ['recipient', s => { s.entries[2].recipientAgentId = 'other'; }],
  ['sender', s => { s.entries[2].authorAgentId = 'other'; }],
  ['category', s => { s.entries[2].category = 'humans'; }],
  ['delegation', s => { s.entries.shift(); }],
  ['status', s => { s.entries.splice(1, 1); }],
  ['reply', s => { s.comments = []; }],
  ['wrong project', s => { s.children[0].projectId = 'other'; }],
  ['excessive runs', s => { s.runs = Array.from({ length: 9 }, (_, i) => ({ id: String(i), status: 'succeeded' })); }],
  ['missing message wake', s => { delete s.runs[1].contextSnapshot; }],
  ['wrong message wake', s => { s.runs[1].contextSnapshot.wakeCommentId = 'other'; }],
  ['reply loop', s => { s.runs[0].contextSnapshot = { wakeCommentId: 'reply' }; }],
  ['failed runtime', s => { s.runs[0].status = 'failed'; }],
  ['pending wake', s => { s.runs[0].status = 'queued'; }],
  ['retry', s => { s.children[0].scheduledRetry = { status: 'scheduled' }; }],
  ['system error', s => { s.entries.push({ kind: 'error', category: 'errors' }); }],
]) test(`rejects ${name}`, () => { const s = fixture(); change(s); assert.ok(assessMessages(s).length); });
test('help does not call API or model', async () => assert.equal(await main(['--help'], { fetchImpl: () => { throw Error('network forbidden'); }, log: () => {} }), 0));
test('rejects remote origin before API', async () => assert.equal(await main(['--api', 'https://example.com', '--codex-home', '/tmp/unused'], { fetchImpl: () => { throw Error('network forbidden'); }, log: () => {} }), 1));
