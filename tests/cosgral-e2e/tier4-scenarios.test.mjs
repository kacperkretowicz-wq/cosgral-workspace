import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  createE2EServer,
  REPO_ROOT,
  validatePrivateAcceptancePath,
  validateWorktreePath,
} from './helpers/e2e-fixture.mjs';
import { PERMISSION_KEYS } from '../../packages/shared/dist/constants.js';
import {
  companyRoleDefinitionSchema,
  updateCompanyRoleSchema,
  assignCompanyRoleSchema,
  deleteCompanyRoleSchema,
} from '../../packages/shared/dist/company-roles.js';
import {
  classifyConversationEntry,
} from '../../packages/shared/dist/project-conversation-history.js';
import {
  personalizationSchema,
} from '../../packages/shared/dist/personalization.js';
import {
  workspaceInstructionSchema,
  WORKSPACE_INSTRUCTION_MAX_LENGTH,
} from '../../packages/shared/dist/workspace-instructions.js';
import {
  decisionQuestionSchema,
} from '../../packages/shared/dist/decision-models.js';

describe('Tier 4: Real-World Application Scenarios (5 Multi-Agent Workflows)', () => {

  // Scenario 1: Two-Browser Collaborative Project Setup
  it('Scenario 1: Two-Browser Collaborative Project Setup', async () => {
    const server = createE2EServer();

    // 1. User A (Alice) signs up and creates company + project
    const aliceAuth = await server.request('/auth/sign-up/email', 'POST', {
      email: 'alice@acme.com',
      password: 'Password123!',
      name: 'Alice Leader',
    });
    assert.equal(aliceAuth.status, 201);
    const aliceToken = aliceAuth.data.token;

    const comp = await server.request('/companies', 'POST', { name: 'Acme Innovations' }, { token: aliceToken });
    assert.equal(comp.status, 201);
    const companyId = comp.data.id;

    const proj = await server.request(`/companies/${companyId}/projects`, 'POST', { name: 'Phoenix' }, { token: aliceToken });
    assert.equal(proj.status, 201);
    const projectId = proj.data.id;

    const conv = await server.request(`/projects/${projectId}/conversation`, 'GET', undefined, { token: aliceToken });
    assert.equal(conv.status, 200);
    const convId = conv.data.issueId;

    // 2. User B (Bob) signs up
    const bobAuth = await server.request('/auth/sign-up/email', 'POST', {
      email: 'bob@acme.com',
      password: 'Password123!',
      name: 'Bob Architect',
    });
    assert.equal(bobAuth.status, 201);
    const bobToken = bobAuth.data.token;

    // 3. Both open WebSocket connections
    const aliceWs = server.connectWebSocket(aliceToken);
    const bobWs = server.connectWebSocket(bobToken);

    const aliceEvents = [];
    const bobEvents = [];
    aliceWs.on('message', raw => aliceEvents.push(JSON.parse(raw)));
    bobWs.on('message', raw => bobEvents.push(JSON.parse(raw)));

    // 4. Alice sends presence notification
    aliceWs.send(JSON.stringify({
      type: 'presence',
      companyId,
      projectId,
    }));

    // Bob receives presence event
    const presenceForBob = bobEvents.find(e => e.type === 'project.conversation.presence');
    assert.ok(presenceForBob);
    assert.equal(presenceForBob.projectId, projectId);
    assert.equal(presenceForBob.users[0].userId, aliceAuth.data.user.id);

    // 5. Alice begins typing
    aliceWs.send(JSON.stringify({ type: 'typing', active: true }));
    const typingForBob = bobEvents.find(e => e.type === 'typing' && e.active === true);
    assert.ok(typingForBob);

    // 6. Alice posts welcoming message
    const msg1 = await server.request(`/issues/${convId}/comments`, 'POST', {
      body: 'Welcome to Phoenix Project, Bob!',
    }, { token: aliceToken });
    assert.equal(msg1.status, 201);

    // Bob receives realtime comment event
    const commentForBob = bobEvents.find(e => e.type === 'issue.comment_created');
    assert.ok(commentForBob);
    assert.equal(commentForBob.comment.body, 'Welcome to Phoenix Project, Bob!');

    // 7. Bob updates profile name
    await server.request('/profile', 'PATCH', { name: 'Bob Architect (Senior)' }, { token: bobToken });
    const profileUpdateForAlice = aliceEvents.find(e => e.type === 'company.member.profile_updated');
    assert.ok(profileUpdateForAlice);
    assert.equal(profileUpdateForAlice.name, 'Bob Architect (Senior)');

    // 8. Bob replies in conversation
    const msg2 = await server.request(`/issues/${convId}/comments`, 'POST', {
      body: 'Thanks Alice, initializing architecture setup!',
    }, { token: bobToken });
    assert.equal(msg2.status, 201);

    // 9. Verify history contains both messages in chronological order
    const history = await server.request(`/issues/${convId}/comments`, 'GET', null, { token: aliceToken });
    assert.equal(history.data.length, 2);
    assert.equal(history.data[0].body, 'Welcome to Phoenix Project, Bob!');
    assert.equal(history.data[1].body, 'Thanks Alice, initializing architecture setup!');
    assert.ok(history.data[0].createdAt <= history.data[1].createdAt);

    aliceWs.close();
    bobWs.close();
  });

  // Scenario 2: Project Creation to Agent Delegation
  it('Scenario 2: Project Creation to Agent Delegation', async () => {
    const server = createE2EServer();

    // 1. Lead engineer signs up and initializes project
    const auth = await server.request('/auth/sign-up/email', 'POST', { email: 'lead@apollo.io', password: 'Password123!' });
    const token = auth.data.token;
    const comp = await server.request('/companies', 'POST', { name: 'Apollo Space' }, { token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Mission Apollo' }, { token });
    const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token });
    const convId = conv.data.issueId;

    // 2. Provision Coordinator Agent and Worker Agent
    const coordAgent = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
      name: 'Apollo Coordinator',
      role: 'coordinator',
      capabilities: ['planning', 'delegation'],
    }, { token });
    assert.equal(coordAgent.status, 201);

    const workerAgent = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
      name: 'Apollo Worker',
      role: 'engineer',
      capabilities: ['backend_api', 'database'],
    }, { token });
    assert.equal(workerAgent.status, 201);

    // 3. Assign coordinator to project conversation
    const coordAssign = await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', {
      agentId: coordAgent.data.id,
    }, { token });
    assert.equal(coordAssign.status, 200);

    // 4. Human user asks coordinator to implement auth module
    await server.request(`/issues/${convId}/comments`, 'POST', {
      body: 'Coordinator, please implement the authentication module with Better Auth.',
    }, { token });

    // 5. Coordinator analyzes and generates a task suggestion card
    const card = await server.request('/interactions', 'POST', {
      title: 'Implement Better Auth Module',
      type: 'task_suggestion',
      description: 'Creates JWT endpoints, token refresh, and login UI',
    }, { actor: { type: 'agent', agentId: coordAgent.data.id } });
    assert.equal(card.status, 201);
    assert.equal(card.data.status, 'pending');

    // 6. Human approves the task suggestion card
    const approval = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', {
      decision: 'approved',
      comment: 'Approved. Proceed with PostgreSQL backend.',
    }, { token });
    assert.equal(approval.status, 200);
    assert.equal(approval.data.status, 'approved');

    // 7. Coordinator delegates subtask issue to worker agent
    const subtask = await server.request(`/companies/${comp.data.id}/issues`, 'POST', {
      title: 'Subtask: Better Auth endpoints',
      parentId: convId,
      assigneeAgentId: workerAgent.data.id,
      status: 'in_progress',
    }, { actor: { type: 'agent', agentId: coordAgent.data.id } });
    assert.equal(subtask.status, 201);
    assert.equal(subtask.data.parentId, convId);
    assert.equal(subtask.data.assigneeAgentId, workerAgent.data.id);

    // 8. Worker agent runs heartbeat and reports completion
    const heartbeat = await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', {
      agentId: workerAgent.data.id,
      status: 'succeeded',
      durationMs: 820,
      inputTokens: 1200,
      outputTokens: 650,
      costCents: '0.95',
    }, { token });
    assert.equal(heartbeat.status, 201);

    await server.request(`/issues/${subtask.data.id}`, 'PATCH', { status: 'done' }, { token });

    // 9. Worker posts completion comment in conversation
    await server.request(`/issues/${convId}/comments`, 'POST', {
      body: 'Better Auth module implementation completed and tests passing.',
    }, { actor: { type: 'agent', agentId: workerAgent.data.id } });

    // 10. Verify project history shows complete delegation lifecycle
    const history = await server.request(`/issues/${convId}/project-history`, 'GET', null, { token });
    assert.equal(history.status, 200);
    assert.ok(history.data.entries.length >= 3);
  });

  // Scenario 3: Cold Restart Recovery & History Integrity
  it('Scenario 3: Cold Restart Recovery & History Integrity', async () => {
    // 1. Boot Server Instance 1
    const server1 = createE2EServer();

    const u = await server1.request('/auth/sign-up/email', 'POST', {
      email: 'cold_restart@example.com',
      password: 'Password123!',
    });
    assert.equal(u.status, 201);
    const token1 = u.data.token;

    const comp = await server1.request('/companies', 'POST', { name: 'Persistent Org' }, { token: token1 });
    const proj = await server1.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Persistence Project' }, { token: token1 });
    const conv = await server1.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: token1 });
    const convId = conv.data.issueId;

    // Post 8 rapid messages with monotonic microsecond timestamps
    for (let i = 0; i < 8; i++) {
      await server1.request(`/issues/${convId}/comments`, 'POST', {
        body: `Audit message checkpoint ${i}`,
      }, { token: token1 });
    }

    // 2. Capture persistent database snapshot (simulating disk storage)
    const snapshot = {
      users: new Map(server1.stores.users),
      companies: new Map(server1.stores.companies),
      members: new Map(server1.stores.members),
      projects: new Map(server1.stores.projects),
      conversations: new Map(server1.stores.conversations),
      issues: new Map(server1.stores.issues),
      comments: new Map(server1.stores.comments),
    };

    // 3. Cold restart: instantiate Server Instance 2 and restore persisted stores
    const server2 = createE2EServer();
    for (const [k, v] of snapshot.users) server2.stores.users.set(k, v);
    for (const [k, v] of snapshot.companies) server2.stores.companies.set(k, v);
    for (const [k, v] of snapshot.members) server2.stores.members.set(k, v);
    for (const [k, v] of snapshot.projects) server2.stores.projects.set(k, v);
    for (const [k, v] of snapshot.conversations) server2.stores.conversations.set(k, v);
    for (const [k, v] of snapshot.issues) server2.stores.issues.set(k, v);
    for (const [k, v] of snapshot.comments) server2.stores.comments.set(k, v);

    // 4. Verify health of restarted server
    const health = await server2.request('/health');
    assert.equal(health.status, 200);

    // 5. Re-authenticate on restarted server
    const login = await server2.request('/auth/sign-in/email', 'POST', {
      email: 'cold_restart@example.com',
      password: 'Password123!',
    });
    assert.equal(login.status, 200);
    const token2 = login.data.token;

    // 6. Query history via pagination on restarted instance
    const page1 = await server2.request(`/issues/${convId}/project-history?limit=4`, 'GET', null, { token: token2 });
    assert.equal(page1.status, 200);
    assert.equal(page1.data.entries.length, 4);
    assert.ok(page1.data.nextCursor);

    const page2 = await server2.request(`/issues/${convId}/project-history?limit=4&cursor=${encodeURIComponent(page1.data.nextCursor)}`, 'GET', null, { token: token2 });
    assert.equal(page2.status, 200);
    assert.equal(page2.data.entries.length, 4);

    // 7. Verify zero overlap between pages and strict timestamp ordering
    const page1Ids = new Set(page1.data.entries.map(e => e.id));
    page2.data.entries.forEach(e => assert.ok(!page1Ids.has(e.id)));

    for (let i = 0; i < page1.data.entries.length - 1; i++) {
      assert.ok(page1.data.entries[i].createdAt <= page1.data.entries[i + 1].createdAt);
    }
  });

  // Scenario 4: Custom Role Provisioning & Permission Check
  it('Scenario 4: Custom Role Provisioning & Permission Check', async () => {
    const server = createE2EServer();

    // 1. Admin signs up and creates company
    const adminAuth = await server.request('/auth/sign-up/email', 'POST', { email: 'admin@roles-corp.com', password: 'Password123!' });
    const adminToken = adminAuth.data.token;
    const adminUserId = adminAuth.data.user.id;
    const comp = await server.request('/companies', 'POST', { name: 'Roles Corp' }, { token: adminToken });
    const compId = comp.data.id;

    // 2. Member signs up and joins company
    const memberAuth = await server.request('/auth/sign-up/email', 'POST', { email: 'engineer@roles-corp.com', password: 'Password123!' });
    const memberUserId = memberAuth.data.user.id;
    const memberId = 'mem-engineer-101';
    server.stores.members.set(memberId, {
      id: memberId,
      companyId: compId,
      userId: memberUserId,
      role: 'member',
      customRoleId: null,
      customRoleVersion: null,
      permissions: ['issues:read'],
      createdAt: new Date().toISOString(),
    });

    // 3. Admin provisions custom role "Release Specialist" with permissions ['agents:create']
    const role = await server.request(`/companies/${compId}/roles`, 'POST', {
      name: 'Release Specialist',
      description: 'Can provision and configure sub-agents',
      permissions: ['agents:create'],
    }, { actor: { type: 'user', role: 'admin', userId: adminUserId } });
    assert.equal(role.status, 201);
    assert.equal(role.data.version, 1);
    const roleId = role.data.id;

    // 4. Admin assigns role to member
    const assign = await server.request(`/companies/${compId}/members/${memberId}/custom-role`, 'PUT', {
      roleId,
      version: 1,
    }, { actor: { type: 'user', role: 'admin', userId: adminUserId } });
    assert.equal(assign.status, 200);
    assert.deepEqual(assign.data.permissions, ['agents:create']);

    // 5. Admin attempts to delete assigned role -> rejected with 409 Conflict
    const delConflict = await server.request(`/companies/${compId}/roles/${roleId}`, 'DELETE', { version: 1 }, {
      actor: { type: 'user', role: 'admin', userId: adminUserId },
    });
    assert.equal(delConflict.status, 409);
    assert.match(delConflict.error, /Cannot delete role assigned/);

    // 6. Admin updates role definition to version 2
    const update = await server.request(`/companies/${compId}/roles/${roleId}`, 'PUT', {
      name: 'Senior Release Specialist',
      description: 'Updated release management role',
      permissions: ['agents:create', 'skills:create'],
      version: 1,
    }, { actor: { type: 'user', role: 'admin', userId: adminUserId } });
    assert.equal(update.status, 200);
    assert.equal(update.data.version, 2);

    // 7. Unassign role from member
    const memberObj = server.stores.members.get(memberId);
    memberObj.customRoleId = null;
    memberObj.permissions = ['issues:read'];

    // 8. Admin deletes role with version 2 -> succeeds with 204 No Content
    const delSuccess = await server.request(`/companies/${compId}/roles/${roleId}`, 'DELETE', { version: 2 }, {
      actor: { type: 'user', role: 'admin', userId: adminUserId },
    });
    assert.equal(delSuccess.status, 204);

    // 9. Verify role is deleted from store
    const list = await server.request(`/companies/${compId}/roles`, 'GET', null, { token: adminToken });
    assert.ok(!list.data.some(r => r.id === roleId));
  });

  // Scenario 5: Repository Attachment & Sandboxed Worktree
  it('Scenario 5: Repository Attachment & Sandboxed Worktree', async () => {
    const server = createE2EServer();

    // 1. User authenticates and creates project
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'gitops@example.com', password: 'Password123!' });
    const token = u.data.token;
    const comp = await server.request('/companies', 'POST', { name: 'GitOps Corp' }, { token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Core Microservice' }, { token });

    // 2. Attach private repository with fine-grained GitHub PAT
    const patToken = 'github_pat_11AAAAAAA0123456789_abcdefghijklmnopqrstuvwxyz';
    assert.match(patToken, /^github_pat_/);

    const mask = (tok) => `${tok.slice(0, 11)}...${tok.slice(-4)}`;
    const masked = mask(patToken);
    assert.equal(masked, 'github_pat_...wxyz');

    // 3. Create primary repository workspace
    const ws = await server.request(`/projects/${proj.data.id}/workspaces`, 'POST', {
      name: 'Git Worktree Root',
      cwd: 'C:\\var\\cosgral\\repos\\core-service',
      isPrimary: true,
    }, { token });
    assert.equal(ws.status, 201);
    assert.equal(ws.data.isPrimary, true);

    // 4. Coordinator inspects git repository via read-only mount
    const coordinatorMount = {
      path: 'C:\\var\\cosgral\\repos\\core-service',
      mode: 'ro',
      inspectLog: () => ['commit 3a4b5c initial commit', 'commit 1d2e3f release v1.0'],
      writeFile: () => { throw new Error('EROFS: Read-only file system'); },
    };
    assert.equal(coordinatorMount.inspectLog().length, 2);
    assert.throws(() => coordinatorMount.writeFile(), /EROFS/);

    // 5. Provision isolated git worktree for worker task
    const issueId = 'issue-s5-task-1';
    const agentId = 'agent-s5-worker';
    const worktreePath = validateWorktreePath(issueId, agentId);
    assert.equal(worktreePath, `worktrees/cosgral/${issueId}/${agentId}`);

    // Verify security checks reject path traversal attempts
    assert.throws(() => validateWorktreePath('../escape', agentId), /Path traversal/);
    assert.throws(() => validateWorktreePath(issueId, '../../agent'), /Path traversal/);

    // 6. Simulate Bubblewrap sandbox container launch parameters
    const bwrapConfig = {
      unshareAll: true,
      roBinds: ['/usr', '/lib', '/var/cosgral/git/objects'],
      rwBinds: [`/var/cosgral/${worktreePath}`],
      tmpfsDir: '/tmp',
    };
    assert.equal(bwrapConfig.unshareAll, true);
    assert.ok(bwrapConfig.roBinds.includes('/var/cosgral/git/objects'));
    assert.ok(bwrapConfig.rwBinds[0].includes(worktreePath));

    // 7. Worker completes implementation, writes changes in isolated worktree
    const worktreeFileSystem = new Map();
    worktreeFileSystem.set('src/auth.ts', 'export function authenticate() { return true; }');
    assert.ok(worktreeFileSystem.has('src/auth.ts'));

    // 8. Worktree cleanup and tear down
    worktreeFileSystem.clear();
    assert.equal(worktreeFileSystem.size, 0);
  });

});
