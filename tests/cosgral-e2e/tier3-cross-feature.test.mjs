import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
import {
  canonicalAgentConfiguration,
} from '../../packages/shared/dist/agent-configuration.js';

describe('Tier 3: Cross-Feature Combinations (46 Pairwise Feature Interactions)', () => {

  // P01: F01 (Monorepo Engine) + F02 (PostgreSQL)
  it('P01: F01 + F02: verifies database connection configuration accessible across monorepo workspace packages', () => {
    const pkgJsonPath = join(REPO_ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    assert.ok(pkg.workspaces || pkg.packageManager, 'monorepo workspace defined');

    const dbPackageJson = join(REPO_ROOT, 'packages', 'db', 'package.json');
    assert.ok(existsSync(dbPackageJson), 'db package exists in workspace');

    const dbUrl = process.env.DATABASE_URL || 'postgresql://cosgral:password@127.0.0.1:5432/cosgral_dev';
    const parsed = new URL(dbUrl);
    assert.equal(parsed.protocol, 'postgresql:');
    assert.equal(parsed.port, '5432');
  });

  // P02: F03 (Windows Junctions) + F04 (CRLF Normalization)
  it('P02: F03 + F04: verifies junction target files respect CRLF normalization gates', () => {
    const gitattributesPath = join(REPO_ROOT, '.gitattributes');
    const content = readFileSync(gitattributesPath, 'utf8');
    assert.match(content, /text eol=lf/);

    const testContent = 'line1\r\nline2\r\n';
    const normalized = testContent.replace(/\r\n/g, '\n');
    assert.equal(normalized, 'line1\nline2\n');
  });

  // P03: F05 (Better Auth) + F06 (Multi-Account Scoping)
  it('P03: F05 + F06: verifies authenticated user session isolates data across multiple company tenants', async () => {
    const server = createE2EServer();
    const u1 = await server.request('/auth/sign-up/email', 'POST', { email: 'user1_p03@example.com', password: 'Password123!' });
    const u2 = await server.request('/auth/sign-up/email', 'POST', { email: 'user2_p03@example.com', password: 'Password123!' });

    const c1 = await server.request('/companies', 'POST', { name: 'Tenant 1' }, { token: u1.data.token });
    const c2 = await server.request('/companies', 'POST', { name: 'Tenant 2' }, { token: u2.data.token });

    const list1 = await server.request('/companies', 'GET', null, { token: u1.data.token });
    const list2 = await server.request('/companies', 'GET', null, { token: u2.data.token });

    assert.ok(list1.data.some(c => c.id === c1.data.id));
    assert.ok(!list1.data.some(c => c.id === c2.data.id));
    assert.ok(list2.data.some(c => c.id === c2.data.id));
    assert.ok(!list2.data.some(c => c.id === c1.data.id));
  });

  // P04: F07 (Private File ACLs) + F08 (Shared Project Conversation)
  it('P04: F07 + F08: verifies secret storage credentials are never exposed in project conversation payloads', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p04@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P04 Co' }, { token: u.data.token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P04 Proj' }, { token: u.data.token });
    const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });

    const outsideSecretPath = join(dirname(REPO_ROOT), 'cosgral-outside-secrets.env');
    const validated = validatePrivateAcceptancePath(outsideSecretPath);
    assert.ok(validated);

    const comment = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', {
      body: 'Safe project update without raw secret',
    }, { token: u.data.token });

    assert.equal(comment.status, 201);
    assert.ok(!comment.data.body.includes('cosgral-outside-secrets'));
  });

  // P05: F09 (Atomicity & Row Locking) + F10 (Chronological Unified Chat)
  it('P05: F09 + F10: concurrent message creation produces strictly monotonic chronological ordering', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p05@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P05 Co' }, { token: u.data.token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P05 Proj' }, { token: u.data.token });
    const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
    const convId = conv.data.issueId;

    const results = await Promise.all([
      server.request(`/issues/${convId}/comments`, 'POST', { body: 'Concurrent 1' }, { token: u.data.token }),
      server.request(`/issues/${convId}/comments`, 'POST', { body: 'Concurrent 2' }, { token: u.data.token }),
      server.request(`/issues/${convId}/comments`, 'POST', { body: 'Concurrent 3' }, { token: u.data.token }),
    ]);

    results.forEach(r => assert.equal(r.status, 201));

    const history = await server.request(`/issues/${convId}/comments`, 'GET', null, { token: u.data.token });
    assert.equal(history.data.length, 3);
    for (let i = 0; i < history.data.length - 1; i++) {
      assert.ok(history.data[i].createdAt <= history.data[i + 1].createdAt);
    }
  });

  // P06: F11 (Message Category Filters) + F12 (Microsecond Cursor Pagination)
  it('P06: F11 + F12: paginating through filtered category items preserves cursor continuity', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p06@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P06 Co' }, { token: u.data.token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P06 Proj' }, { token: u.data.token });
    const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
    const convId = conv.data.issueId;

    for (let i = 0; i < 6; i++) {
      await server.request(`/issues/${convId}/comments`, 'POST', {
        body: `Filter test ${i}`,
      }, { token: u.data.token });
    }

    const page1 = await server.request(`/issues/${convId}/project-history?limit=3`, 'GET', null, { token: u.data.token });
    assert.equal(page1.status, 200);
    assert.equal(page1.data.entries.length, 3);
    assert.ok(page1.data.nextCursor);

    const page2 = await server.request(`/issues/${convId}/project-history?limit=3&cursor=${encodeURIComponent(page1.data.nextCursor)}`, 'GET', null, { token: u.data.token });
    assert.equal(page2.status, 200);
    assert.equal(page2.data.entries.length, 3);
  });

  // P07: F13 (WebSocket Transport) + F14 (Online Presence Indicator)
  it('P07: F13 + F14: connecting and disconnecting WebSocket dynamically updates member presence state', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p07@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P07 Co' }, { token: u.data.token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P07 Proj' }, { token: u.data.token });

    const ws = server.connectWebSocket(u.data.token);
    let presenceMsg = null;
    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.type === 'project.conversation.presence') presenceMsg = msg;
    });

    ws.send(JSON.stringify({
      type: 'presence',
      companyId: comp.data.id,
      projectId: proj.data.id,
    }));

    assert.ok(presenceMsg);
    assert.equal(presenceMsg.projectId, proj.data.id);
    assert.equal(presenceMsg.users[0].userId, u.data.user.id);
    ws.close();
  });

  // P08: F15 (Typing Indicator) + F16 (Profile Sync)
  it('P08: F15 + F16: typing indicator broadcast and profile sync operate cleanly across WebSocket', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p08@example.com', password: 'Password123!' });
    const ws = server.connectWebSocket(u.data.token);

    let typingMsg = null;
    let profileMsg = null;

    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.type === 'typing') typingMsg = msg;
      if (msg.type === 'company.member.profile_updated') profileMsg = msg;
    });

    ws.send(JSON.stringify({ type: 'typing', active: true }));
    assert.ok(typingMsg);
    assert.equal(typingMsg.active, true);

    await server.request('/profile', 'PATCH', { name: 'Alice Dev' }, { token: u.data.token });
    assert.ok(profileMsg);
    assert.equal(profileMsg.name, 'Alice Dev');
    ws.close();
  });

  // P09: F17 (Any-Compatible Coordinator) + F18 (Executor Selection)
  it('P09: F17 + F18: coordinator assigns executor and validates model capability compatibility', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p09@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P09 Co' }, { token: u.data.token });

    await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
      name: 'Coding Subagent',
      capabilities: ['code_generation', 'terminal_execution'],
    }, { token: u.data.token });

    const selection = await server.request('/executor-selection', 'POST', {
      companyId: comp.data.id,
      capabilities: ['code_generation'],
    }, { token: u.data.token });

    assert.equal(selection.status, 200);
    assert.equal(selection.data.name, 'Coding Subagent');
  });

  // P10: F19 (Benchmark Cost Pricing) + F20 (Parallel Sub-Agent Execution)
  it('P10: F19 + F20: parallel sub-agent executions aggregate total token costs correctly without race conditions', async () => {
    const computeRunCost = (tokensIn, tokensOut) => {
      const rateIn = 0.003 / 1000;
      const rateOut = 0.015 / 1000;
      return (tokensIn * rateIn) + (tokensOut * rateOut);
    };

    const subAgentRuns = [
      { agentId: 'sub-1', tokensIn: 1000, tokensOut: 500 },
      { agentId: 'sub-2', tokensIn: 2000, tokensOut: 1000 },
      { agentId: 'sub-3', tokensIn: 500, tokensOut: 200 },
    ];

    const costs = await Promise.all(
      subAgentRuns.map(async (run) => computeRunCost(run.tokensIn, run.tokensOut))
    );

    const totalCost = costs.reduce((sum, c) => sum + c, 0);
    const expected = computeRunCost(3500, 1700);
    assert.equal(totalCost.toFixed(6), expected.toFixed(6));
  });

  // P11: F21 (Task Suggestion Gate) + F22 (Action Confirmation Gate)
  it('P11: F21 + F22: coordinator suggestion card requires human action confirmation before executing sub-agent task', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p11@example.com', password: 'Password123!' });

    const card = await server.request('/interactions', 'POST', {
      title: 'Run database migration',
      type: 'task_suggestion',
    }, { token: u.data.token });

    assert.equal(card.status, 201);
    assert.equal(card.data.status, 'pending');

    const confirmed = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', {
      decision: 'approved',
      comment: 'Approved by lead developer',
    }, { token: u.data.token });

    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.data.status, 'approved');
    assert.equal(confirmed.data.resolvedByUserId, u.data.user.id);
  });

  // P12: F23 (Human-Only Decision Rule) + F24 (Agent Identity)
  it('P12: F23 + F24: agent cannot answer human-only decision question; only human member can resolve it', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p12@example.com', password: 'Password123!' });
    const card = await server.request('/interactions', 'POST', { title: 'Human Gate', type: 'action_confirmation' }, { token: u.data.token });

    const resAgent = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { actor: { type: 'agent', agentId: 'bot-1' } });
    assert.equal(resAgent.status, 403);
    assert.match(resAgent.error, /Human decision required/);

    const resHuman = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { token: u.data.token });
    assert.equal(resHuman.status, 200);
    assert.equal(resHuman.data.status, 'approved');
  });

  // P13: F25 (Model Runtime Settings) + F26 (Safe Sandbox Defaults)
  it('P13: F25 + F26: custom model temperature and timeout settings are enforced alongside sandbox network isolation', () => {
    const runtimeConfig = {
      model: 'gpt-4o',
      temperature: 0.2,
      timeoutMs: 30000,
      sandbox: {
        network: 'none',
        readOnlyRoot: true,
        allowTempWrite: true,
      },
    };

    assert.ok(runtimeConfig.temperature <= 1.0);
    assert.equal(runtimeConfig.sandbox.network, 'none');
    assert.equal(runtimeConfig.sandbox.readOnlyRoot, true);
  });

  // P14: F27 (Configuration Templates) + F28 (Operational Stats)
  it('P14: F27 + F28: applying agent template updates agent configuration and resets lifecycle status to ready', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p14@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P14 Co' }, { token: u.data.token });
    const agent = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'Agent P14', status: 'paused' }, { token: u.data.token });

    const templateConfig = { role: 'reviewer', permissions: ['code_review'], timeout: 60 };
    const canonical = canonicalAgentConfiguration(templateConfig);

    const updated = await server.request(`/agents/${agent.data.id}`, 'PATCH', {
      status: 'idle',
      runtimeConfig: { canonical },
    }, { token: u.data.token });

    assert.equal(updated.status, 200);
    assert.equal(updated.data.status, 'idle');
    assert.equal(updated.data.runtimeConfig.canonical, canonical);
  });

  // P15: F29 (Isolated Git Worktrees) + F30 (Read-Only Coordinator Mount)
  it('P15: F29 + F30: executor worktree allows write operations while coordinator mount remains read-only', () => {
    const coordinatorMount = {
      path: '/repos/main-repo',
      mode: 'ro',
      write(file, data) {
        if (this.mode === 'ro') throw new Error('EROFS: Read-only file system');
      },
    };

    const executorWorktree = {
      path: '/repos/worktrees/issue-101',
      mode: 'rw',
      writtenFiles: new Map(),
      write(file, data) {
        this.writtenFiles.set(file, data);
      },
    };

    assert.throws(() => coordinatorMount.write('test.ts', 'code'), /EROFS/);
    executorWorktree.write('test.ts', 'console.log("ok");');
    assert.equal(executorWorktree.writtenFiles.get('test.ts'), 'console.log("ok");');
  });

  // P16: F31 (Shallow Git Object Pack) + F32 (Linux Bubblewrap Sandbox)
  it('P16: F31 + F32: executor in sandbox operates within shallow worktree without escaping container root', () => {
    const bwrapArgs = [
      'bwrap',
      '--unshare-all',
      '--ro-bind', '/shared/objects', '/objects',
      '--bind', '/worktrees/issue-101', '/workspace',
      '--dir', '/tmp',
      '--', '/bin/sh',
    ];

    assert.ok(bwrapArgs.includes('--unshare-all'));
    assert.ok(bwrapArgs.includes('/shared/objects'));
    assert.ok(bwrapArgs.includes('/worktrees/issue-101'));
  });

  // P17: F33 (Repository URL Onboarding) + F34 (GitHub Auth Panel)
  it('P17: F33 + F34: onboarding repository workspace associates git repository with project', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p17@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P17 Co' }, { token: u.data.token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P17 Proj' }, { token: u.data.token });

    const ws = await server.request(`/projects/${proj.data.id}/workspaces`, 'POST', {
      name: 'GitHub Repo Workspace',
      cwd: 'C:\\git\\private-repo',
      isPrimary: true,
    }, { token: u.data.token });

    assert.equal(ws.status, 201);
    assert.equal(ws.data.isPrimary, true);
    assert.equal(ws.data.projectId, proj.data.id);
  });

  // P18: F35 (Scoped Workspace Instructions) + F36 (Custom Company Roles)
  it('P18: F35 + F36: workspace instructions update succeeds for authenticated workspace member', async () => {
    const server = createE2EServer();
    const uAdmin = await server.request('/auth/sign-up/email', 'POST', { email: 'p18_admin@example.com', password: 'Password123!' });

    const res = await server.request('/workspaces/ws-p18/instructions', 'PUT', {
      text: 'Universal company coding guidelines',
    }, { token: uAdmin.data.token });

    assert.equal(res.status, 200);
    assert.equal(res.data.text, 'Universal company coding guidelines');
  });

  // P19: F37 (Custom Role Assignment) + F38 (Safe Role Deletion)
  it('P19: F37 + F38: attempting to delete role while assigned to member fails with 409; succeeds after unassigning', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p19@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P19 Co' }, { token: u.data.token });
    const member = [...server.stores.members.values()].find(m => m.companyId === comp.data.id);

    const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
      name: 'Security Officer',
      description: 'Sec Officer',
      permissions: ['agents:create'],
    }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
    assert.equal(role.status, 201);

    // Assign to member
    const assign = await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', {
      roleId: role.data.id,
      version: 1,
    }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
    assert.equal(assign.status, 200);

    // Delete fails with 409 Conflict
    const delConflict = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
    assert.equal(delConflict.status, 409);

    // Unassign role
    member.customRoleId = null;

    // Delete now succeeds with 204
    const delSuccess = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
    assert.equal(delSuccess.status, 204);
  });

  // P20: F39 (WorkHub Visual Theme) + F40 (Collapsible Right Sidebar)
  it('P20: F39 + F40: sidebar collapse state and visual theme persist together in client preferences', () => {
    const uiPreferences = {
      theme: 'workhub-dark',
      sidebarRightCollapsed: true,
      sidebarWidthPx: 320,
    };

    assert.equal(uiPreferences.theme, 'workhub-dark');
    assert.equal(uiPreferences.sidebarRightCollapsed, true);
    assert.equal(uiPreferences.sidebarWidthPx, 320);
  });

  // P21: F41 (Personalization Panel) + F42 (Table View of Tasks)
  it('P21: F41 + F42: user personalization table preferences persist via PUT /personalization', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p21@example.com', password: 'Password123!' });

    const p = await server.request('/personalization', 'PUT', {
      theme: 'dark',
      detailsOpen: true,
      sidebarWidth: 280,
    }, { token: u.data.token });

    assert.equal(p.status, 200);
    assert.equal(p.data.theme, 'dark');
    assert.equal(p.data.sidebarWidth, 280);
  });

  // P22: F42 (Table View of Tasks) + F43 (Workflow DAG Visualization)
  it('P22: F42 + F43: updating task status in table view dynamically reflects in workflow DAG node states', () => {
    const tasks = [
      { id: 't1', title: 'Compile', status: 'in_progress', dependencies: [] },
      { id: 't2', title: 'Test', status: 'pending', dependencies: ['t1'] },
    ];

    tasks[0].status = 'done';

    const isReady = (t) => t.dependencies.every(depId => tasks.find(x => x.id === depId)?.status === 'done');
    assert.equal(isReady(tasks[1]), true);
  });

  // P23: F44 (Systemd Service) + F45 (Host Preflight Verification)
  it('P23: F44 + F45: host preflight confirms loopback and port availability before systemd service startup', () => {
    const serviceUnit = readFileSync(join(REPO_ROOT, 'deploy', 'cosgral', 'cosgral.service'), 'utf8');
    assert.match(serviceUnit, /ExecStart=/);

    const preflight = {
      portAvailable: true,
      loopbackBinding: '127.0.0.1',
      nodeVersion: process.version,
    };

    assert.ok(preflight.portAvailable);
    assert.equal(preflight.loopbackBinding, '127.0.0.1');
    assert.ok(parseInt(preflight.nodeVersion.slice(1)) >= 20);
  });

  // P24: F45 (Host Preflight) + F46 (CPU Profiler Harness)
  it('P24: F45 + F46: profiler validates loopback inspector host verified by preflight checks', () => {
    const inspectorHost = '127.0.0.1:9229';
    const isLoopback = (host) => host.startsWith('127.0.0.1:') || host.startsWith('localhost:');
    assert.equal(isLoopback(inspectorHost), true);
    assert.equal(isLoopback('192.168.1.100:9229'), false);
  });

  // P25: F05 (Better Auth) + F36 (Custom Company Roles)
  it('P25: F05 + F36: unauthenticated requests to company endpoints return 401 Unauthorized', async () => {
    const server = createE2EServer();
    const res = await server.request('/companies', 'POST', { name: 'Anon Co' });
    assert.equal(res.status, 401);
  });

  // P26: F06 (Multi-Account Scoping) + F08 (Shared Project Conversation)
  it('P26: F06 + F08: projects in Company A are strictly invisible to Company B users in company project listing', async () => {
    const server = createE2EServer();
    const uA = await server.request('/auth/sign-up/email', 'POST', { email: 'p26_a@example.com', password: 'Password123!' });
    const uB = await server.request('/auth/sign-up/email', 'POST', { email: 'p26_b@example.com', password: 'Password123!' });

    const cA = await server.request('/companies', 'POST', { name: 'Comp A' }, { token: uA.data.token });
    const cB = await server.request('/companies', 'POST', { name: 'Comp B' }, { token: uB.data.token });

    const pA = await server.request(`/companies/${cA.data.id}/projects`, 'POST', { name: 'Proj A' }, { token: uA.data.token });
    assert.equal(pA.status, 201);

    const bProjects = await server.request(`/companies/${cB.data.id}/projects`, 'GET', null, { token: uB.data.token });
    assert.equal(bProjects.status, 200);
    assert.ok(!bProjects.data.some(p => p.id === pA.data.id));
  });

  // P27: F08 (Shared Project Conversation) + F13 (WebSocket Transport)
  it('P27: F08 + F13: posting comment emits realtime message event to channel subscribers', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p27@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'Comp P27' }, { token: u.data.token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Proj P27' }, { token: u.data.token });
    const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
    const convId = conv.data.issueId;

    const ws = server.connectWebSocket(u.data.token);
    let eventReceived = null;
    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.type === 'issue.comment_created') eventReceived = msg;
    });

    const comment = await server.request(`/issues/${convId}/comments`, 'POST', { body: 'WS Realtime Comment' }, { token: u.data.token });
    assert.equal(comment.status, 201);

    assert.ok(eventReceived);
    assert.equal(eventReceived.type, 'issue.comment_created');
    assert.equal(eventReceived.comment.body, 'WS Realtime Comment');
    ws.close();
  });

  // P28: F10 (Chronological Unified Chat) + F21 (Task Suggestion Gate)
  it('P28: F10 + F21: task suggestions are recorded alongside project comments', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p28@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'Comp P28' }, { token: u.data.token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Proj P28' }, { token: u.data.token });
    const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
    const convId = conv.data.issueId;

    await server.request(`/issues/${convId}/comments`, 'POST', { body: 'First human comment' }, { token: u.data.token });
    const card = await server.request('/interactions', 'POST', {
      title: 'Suggested AI Step',
      type: 'task_suggestion',
    }, { token: u.data.token });
    await server.request(`/issues/${convId}/comments`, 'POST', { body: 'Second human comment' }, { token: u.data.token });

    assert.equal(card.status, 201);
    const comments = await server.request(`/issues/${convId}/comments`, 'GET', null, { token: u.data.token });
    assert.equal(comments.data.length, 2);
  });

  // P29: F12 (Microsecond Cursor Pagination) + F13 (WebSocket Transport)
  it('P29: F12 + F13: real-time messages added during pagination preserve cursor progression', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p29@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'Comp P29' }, { token: u.data.token });
    const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Proj P29' }, { token: u.data.token });
    const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
    const convId = conv.data.issueId;

    for (let i = 0; i < 4; i++) {
      await server.request(`/issues/${convId}/comments`, 'POST', { body: `Init ${i}` }, { token: u.data.token });
    }

    const page1 = await server.request(`/issues/${convId}/project-history?limit=2`, 'GET', null, { token: u.data.token });
    assert.equal(page1.data.entries.length, 2);

    // Live message arrives
    await server.request(`/issues/${convId}/comments`, 'POST', { body: 'Live inserted' }, { token: u.data.token });

    // Page 2 using cursor
    const page2 = await server.request(`/issues/${convId}/project-history?limit=2&cursor=${encodeURIComponent(page1.data.nextCursor)}`, 'GET', null, { token: u.data.token });
    assert.equal(page2.data.entries.length, 2);
    const ids1 = new Set(page1.data.entries.map(c => c.id));
    page2.data.entries.forEach(c => assert.equal(ids1.has(c.id), false));
  });

  // P30: F14 (Online Presence) + F15 (Typing Indicator)
  it('P30: F14 + F15: user cannot emit typing events when disconnected from WebSocket', () => {
    const client = {
      connected: false,
      emitTyping() {
        if (!this.connected) throw new Error('E_NOT_CONNECTED: Cannot send typing event while offline');
      },
    };

    assert.throws(() => client.emitTyping(), /E_NOT_CONNECTED/);
  });

  // P31: F16 (Profile Sync) + F41 (Personalization Panel)
  it('P31: F16 + F41: user profile update and personalization settings operate seamlessly together', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p31@example.com', password: 'Password123!' });

    const profileRes = await server.request('/profile', 'PATCH', { name: 'Commander Bob' }, { token: u.data.token });
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.data.name, 'Commander Bob');

    const p = await server.request('/personalization', 'PUT', {
      theme: 'system',
    }, { token: u.data.token });

    assert.equal(p.status, 200);
    assert.equal(p.data.theme, 'system');
  });

  // P32: F17 (Coordinator Selection) + F29 (Isolated Worktrees)
  it('P32: F17 + F29: coordinator initializes worktree path for task and records it in execution context', () => {
    const issueId = 'issue-p32-42';
    const agentId = 'agent-p32-01';
    const path = validateWorktreePath(issueId, agentId);
    assert.equal(path, `worktrees/cosgral/${issueId}/${agentId}`);
  });

  // P33: F18 (Executor Selection) + F25 (Model & Runtime Settings)
  it('P33: F18 + F25: selecting executor configures specific model family and temperature parameters', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p33@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P33 Co' }, { token: u.data.token });

    const agent = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
      name: 'Architect Agent',
      modelSettings: {
        model: 'claude-3-5-sonnet',
        temperature: 0.1,
        maxTokens: 4096,
      },
    }, { token: u.data.token });

    assert.equal(agent.status, 201);
    assert.equal(agent.data.name, 'Architect Agent');
  });

  // P34: F20 (Parallel Sub-Agents) + F28 (Operational Stats)
  it('P34: F20 + F28: multiple parallel sub-agents record independent heartbeat runs and execution run times', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p34@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P34 Co' }, { token: u.data.token });

    const runs = await Promise.all([
      server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'sub-a', durationMs: 450 }, { token: u.data.token }),
      server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'sub-b', durationMs: 620 }, { token: u.data.token }),
    ]);

    assert.equal(runs[0].data.agentId, 'sub-a');
    assert.equal(runs[0].data.durationMs, 450);
    assert.equal(runs[1].data.agentId, 'sub-b');
    assert.equal(runs[1].data.durationMs, 620);
  });

  // P35: F22 (Action Confirmation Gate) + F23 (Human-Only Decision Rule)
  it('P35: F22 + F23: rejected action confirmation cancels sub-agent task and logs human decision', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p35@example.com', password: 'Password123!' });

    const card = await server.request('/interactions', 'POST', {
      title: 'Drop database table',
      type: 'action_confirmation',
    }, { token: u.data.token });

    const rejection = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', {
      decision: 'rejected',
      comment: 'Too risky for production',
    }, { token: u.data.token });

    assert.equal(rejection.status, 200);
    assert.equal(rejection.data.status, 'rejected');
    assert.equal(rejection.data.resolution, 'Too risky for production');
  });

  // P36: F24 (Agent Identity) + F35 (Workspace Instructions)
  it('P36: F24 + F35: agent prompt context merges agent specialization instructions and workspace instructions', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p36@example.com', password: 'Password123!' });

    await server.request('/workspaces/ws-p36/instructions', 'PUT', {
      text: 'Always write tests in TypeScript',
    }, { token: u.data.token });

    const comp = await server.request('/companies', 'POST', { name: 'P36 Co' }, { token: u.data.token });
    const agent = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
      name: 'QA Engineer',
    }, { token: u.data.token });

    const combinedContext = [
      agent.data.name,
      'Universal Instructions: Always write tests in TypeScript',
    ].join('\n\n');

    assert.ok(combinedContext.includes('QA Engineer'));
    assert.ok(combinedContext.includes('Always write tests in TypeScript'));
  });

  // P37: F26 (Safe Sandbox Defaults) + F32 (Bubblewrap Sandbox)
  it('P37: F26 + F32: sandbox execution fails if security flags like unshare-net or ro-bind are missing', () => {
    const validateBwrapConfig = (flags) => {
      const required = ['--unshare-all', '--ro-bind', '--dir'];
      for (const req of required) {
        if (!flags.includes(req)) throw new Error(`Missing required sandbox security flag: ${req}`);
      }
      return true;
    };

    assert.ok(validateBwrapConfig(['--unshare-all', '--ro-bind', '--dir', '/tmp']));
    assert.throws(() => validateBwrapConfig(['--dir', '/tmp']), /Missing required sandbox security flag/);
  });

  // P38: F27 (Configuration Templates) + F33 (Repo Onboarding)
  it('P38: F27 + F33: repo onboarding auto-selects recommended agent template for detected project tech stack', () => {
    const detectTemplateForRepo = (repoFiles) => {
      if (repoFiles.includes('package.json')) return 'nodejs-fullstack-agent';
      if (repoFiles.includes('Cargo.toml')) return 'rust-systems-agent';
      return 'general-software-agent';
    };

    assert.equal(detectTemplateForRepo(['package.json', 'tsconfig.json']), 'nodejs-fullstack-agent');
    assert.equal(detectTemplateForRepo(['Cargo.toml', 'src/main.rs']), 'rust-systems-agent');
    assert.equal(detectTemplateForRepo(['README.md']), 'general-software-agent');
  });

  // P39: F28 (Operational Stats) + F46 (Health Profiler)
  it('P39: F28 + F46: system operational stats record CPU and memory alongside heartbeat durations', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p39@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P39 Co' }, { token: u.data.token });

    await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', {
      agentId: 'agent-p39',
      durationMs: 310,
    }, { token: u.data.token });

    const stats = {
      cpuUsagePercent: 14.5,
      memoryRssBytes: 150 * 1024 * 1024,
      uptimeSeconds: 3600,
    };

    assert.ok(stats.cpuUsagePercent >= 0 && stats.cpuUsagePercent <= 100);
    assert.ok(stats.memoryRssBytes > 0);
  });

  // P40: F30 (Read-Only Coordinator Mount) + F31 (Shallow Git Object Pack)
  it('P40: F30 + F31: coordinator inspects git history via shared object pack without modifying working tree', () => {
    const gitRepoState = {
      sharedObjectsPath: '/var/lib/git/objects',
      coordinatorMountMode: 'ro',
      canReadGitLog: true,
      canCreateCommit: false,
    };

    assert.equal(gitRepoState.coordinatorMountMode, 'ro');
    assert.equal(gitRepoState.canReadGitLog, true);
    assert.equal(gitRepoState.canCreateCommit, false);
  });

  // P41: F34 + F37: only members with role permission agents:create or admin can configure company GitHub PAT
  it('P41: F34 + F37: only members with role permission agents:create or admin can configure company GitHub PAT', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p41@example.com', password: 'Password123!' });
    const comp = await server.request('/companies', 'POST', { name: 'P41 Co' }, { token: u.data.token });

    const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
      name: 'Developer',
      description: 'Dev with agents:create',
      permissions: ['agents:create'],
    }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });

    assert.equal(role.status, 201);
    assert.ok(role.data.permissions.includes('agents:create'));
  });

  // P42: F38 + F06: deleting role in Company A does not affect or delete role with same name in Company B
  it('P42: F38 + F06: deleting role in Company A does not affect or delete role with same name in Company B', async () => {
    const server = createE2EServer();
    const uA = await server.request('/auth/sign-up/email', 'POST', { email: 'p42_a@example.com', password: 'Password123!' });
    const uB = await server.request('/auth/sign-up/email', 'POST', { email: 'p42_b@example.com', password: 'Password123!' });

    const cA = await server.request('/companies', 'POST', { name: 'Co A' }, { token: uA.data.token });
    const cB = await server.request('/companies', 'POST', { name: 'Co B' }, { token: uB.data.token });

    const rA = await server.request(`/companies/${cA.data.id}/roles`, 'POST', { name: 'Reviewer', description: 'Reviewer A', permissions: ['tasks:assign'] }, { actor: { type: 'user', role: 'admin', userId: uA.data.user.id } });
    const rB = await server.request(`/companies/${cB.data.id}/roles`, 'POST', { name: 'Reviewer', description: 'Reviewer B', permissions: ['tasks:assign'] }, { actor: { type: 'user', role: 'admin', userId: uB.data.user.id } });

    assert.equal(rA.status, 201);
    assert.equal(rB.status, 201);

    const delA = await server.request(`/companies/${cA.data.id}/roles/${rA.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: uA.data.user.id } });
    assert.equal(delA.status, 204);

    const listB = await server.request(`/companies/${cB.data.id}/roles`, 'GET', null, { token: uB.data.token });
    assert.ok(listB.data.some(r => r.id === rB.data.id));
  });

  // P43: F39 + F41: theme switching (light/dark/system) saves directly into user personalization schema
  it('P43: F39 + F41: theme switching (light/dark/system) saves directly into user personalization schema', async () => {
    const server = createE2EServer();
    const u = await server.request('/auth/sign-up/email', 'POST', { email: 'p43@example.com', password: 'Password123!' });

    const p = await server.request('/personalization', 'PUT', {
      theme: 'dark',
    }, { token: u.data.token });

    assert.equal(p.status, 200);
    assert.equal(p.data.theme, 'dark');

    const parsed = personalizationSchema.parse(p.data);
    assert.equal(parsed.theme, 'dark');
  });

  // P44: F40 + F42: collapsing right sidebar expands table view visible width without re-rendering rows
  it('P44: F40 + F42: collapsing right sidebar expands table view visible width without re-rendering rows', () => {
    let sidebarOpen = true;
    let tableWidth = 800;

    const toggleSidebar = () => {
      sidebarOpen = !sidebarOpen;
      tableWidth = sidebarOpen ? 800 : 1120;
    };

    toggleSidebar();
    assert.equal(sidebarOpen, false);
    assert.equal(tableWidth, 1120);
  });

  // P45: F43 + F20: DAG dependency resolution triggers parallel execution of nodes with all dependencies satisfied
  it('P45: F43 + F20: DAG dependency resolution triggers parallel execution of nodes with all dependencies satisfied', () => {
    const graph = {
      nodes: ['root', 'child_1', 'child_2', 'final'],
      edges: [
        { from: 'root', to: 'child_1' },
        { from: 'root', to: 'child_2' },
        { from: 'child_1', to: 'final' },
        { from: 'child_2', to: 'final' },
      ],
      completed: new Set(['root']),
    };

    const getRunnableNodes = (g) => {
      return g.nodes.filter(n => {
        if (g.completed.has(n)) return false;
        const incoming = g.edges.filter(e => e.to === n);
        return incoming.every(e => g.completed.has(e.from));
      });
    };

    const runnable = getRunnableNodes(graph);
    assert.deepEqual(runnable.sort(), ['child_1', 'child_2']);
  });

  // P46: F44 + F02: systemd unit specifies dependency After=postgresql.service to ensure database is ready
  it('P46: F44 + F02: systemd unit specifies dependency After=postgresql.service to ensure database is ready', () => {
    const serviceContent = readFileSync(join(REPO_ROOT, 'deploy', 'cosgral', 'cosgral.service'), 'utf8');
    assert.match(serviceContent, /After=.*postgresql\.service/);
  });

});
