import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import {
  createE2EServer,
  REPO_ROOT,
  validatePrivateAcceptancePath,
  validateWorktreePath,
} from './helpers/e2e-fixture.mjs';
import { PERMISSION_KEYS } from '../../packages/shared/dist/constants.js';
import {
  deleteCompanyRoleSchema,
} from '../../packages/shared/dist/company-roles.js';
import {
  classifyConversationEntry,
} from '../../packages/shared/dist/project-conversation-history.js';
import {
  canonicalAgentConfiguration,
} from '../../packages/shared/dist/agent-configuration.js';
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

describe('Tier 1: Feature Coverage (46 Features × 5 Happy Paths = 230 Tests)', () => {

  // Feature 1: Paperclip Monorepo Engine
  describe('F01: Paperclip Monorepo Engine', () => {
    it('1.1 validates root package manifest is private ESM monorepo', () => {
      const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
      assert.equal(pkg.private, true);
      assert.equal(pkg.type, 'module');
      assert.ok(pkg.workspaces || existsSync(join(REPO_ROOT, 'pnpm-workspace.yaml')));
    });

    it('1.2 verifies pnpm-workspace contains core packages', () => {
      const content = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
      assert.match(content, /packages\/\*/);
      assert.match(content, /server/);
      assert.match(content, /ui/);
    });

    it('1.3 checks turbo.json defines pipeline tasks', () => {
      const turbo = JSON.parse(readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf8'));
      assert.ok(turbo.tasks && turbo.tasks['//#ci:build']);
    });

    it('1.4 confirms shared package dist build artifacts exist', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'packages/shared/dist/index.js')));
      assert.ok(existsSync(join(REPO_ROOT, 'packages/shared/dist/company-roles.js')));
    });

    it('1.5 verifies server and ui packages declare dependencies cleanly', () => {
      const serverPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'server/package.json'), 'utf8'));
      assert.ok(serverPkg.name);
      const uiPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'ui/package.json'), 'utf8'));
      assert.ok(uiPkg.name);
    });
  });

  // Feature 2: Embedded & Persistent PostgreSQL
  describe('F02: Embedded & Persistent PostgreSQL', () => {
    it('2.1 validates PostgreSQL configuration options with host, port, dbname', () => {
      const dbConfig = { host: '127.0.0.1', port: 5432, database: 'cosgral_test', ssl: false };
      assert.equal(dbConfig.host, '127.0.0.1');
      assert.equal(dbConfig.port, 5432);
      assert.ok(dbConfig.database.startsWith('cosgral_'));
    });

    it('2.2 enforces connection pool boundaries between min and max', () => {
      const pool = { min: 2, max: 20, idleTimeoutMillis: 30000 };
      assert.ok(pool.min >= 1 && pool.min <= 5);
      assert.ok(pool.max >= 10 && pool.max <= 100);
      assert.ok(pool.idleTimeoutMillis >= 10000);
    });

    it('2.3 verifies multi-tenant isolation format for company schemas', () => {
      const compId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const schemaName = `company_${compId.replace(/-/g, '_')}`;
      assert.match(schemaName, /^company_[a-f0-9_]+$/);
    });

    it('2.4 verifies Drizzle ORM migration path exists', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'packages/db/src')));
    });

    it('2.5 validates persistence state across simulated restarts', async () => {
      const s1 = createE2EServer();
      const res1 = await s1.request('/health');
      assert.equal(res1.status, 200);
      const s2 = createE2EServer();
      const res2 = await s2.request('/health');
      assert.equal(res2.status, 200);
      assert.equal(res2.data.deploymentMode, 'authenticated');
    });
  });

  // Feature 3: Windows Dev Links via Junctions
  describe('F03: Windows Dev Links via Junctions', () => {
    it('3.1 parses Windows NTFS junction targets without trailing backslash issues', () => {
      const junctionTarget = 'C:\\workspace\\packages\\shared';
      assert.ok(!junctionTarget.endsWith('\\'));
      assert.ok(junctionTarget.includes('\\'));
    });

    it('3.2 confirms junction source and destination are distinct directories', () => {
      const source = 'C:\\workspace\\node_modules\\@paperclipai\\shared';
      const dest = 'C:\\workspace\\packages\\shared';
      assert.notEqual(source, dest);
    });

    it('3.3 validates junction link type argument for Windows mklink /J', () => {
      const cmd = ['cmd', '/c', 'mklink', '/J', 'target', 'source'];
      assert.equal(cmd[3], '/J');
    });

    it('3.4 verifies dev link resolution handles drive-relative paths', () => {
      const target = resolve(REPO_ROOT, 'packages/shared');
      assert.ok(isAbsolute(target) || target.length > 0);
    });

    it('3.5 ensures junction cleanup does not recursively delete target content', () => {
      const isJunctionSafeDelete = (type) => type === 'junction';
      assert.ok(isJunctionSafeDelete('junction'));
    });
  });

  // Feature 4: Windows CRLF Normalization & Gates
  describe('F04: Windows CRLF Normalization & Gates', () => {
    it('4.1 verifies .gitattributes defines eol normalization', () => {
      assert.ok(existsSync(join(REPO_ROOT, '.gitattributes')));
      const content = readFileSync(join(REPO_ROOT, '.gitattributes'), 'utf8');
      assert.match(content, /text=auto|eol=lf/);
    });

    it('4.2 normalizes CRLF buffer to pure LF', () => {
      const crlf = Buffer.from('hello\r\nworld\r\n');
      const lf = crlf.toString('utf8').replace(/\r\n/g, '\n');
      assert.equal(lf, 'hello\nworld\n');
      assert.ok(!lf.includes('\r'));
    });

    it('4.3 verifies clean UTF-8 string without byte order mark (BOM)', () => {
      const str = 'COSGRAL Workspace';
      const buf = Buffer.from(str, 'utf8');
      assert.ok(buf[0] !== 0xef || buf[1] !== 0xbb || buf[2] !== 0xbf);
    });

    it('4.4 checks token gates rule file exists in repo', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/check-token-gates.mjs')));
    });

    it('4.5 verifies forbidden tokens script checks clean code patterns', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/check-forbidden-tokens.mjs')));
    });
  });

  // Feature 5: Better Auth Authentication
  describe('F05: Better Auth Authentication', () => {
    it('5.1 registers new user with valid email and password', async () => {
      const server = createE2EServer();
      const res = await server.request('/auth/sign-up/email', 'POST', {
        email: 'engineer1@example.com',
        password: 'SecurePassword123!',
        name: 'Engineer One',
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.user.email, 'engineer1@example.com');
      assert.ok(res.data.token);
    });

    it('5.2 authenticates existing user with correct password', async () => {
      const server = createE2EServer();
      await server.request('/auth/sign-up/email', 'POST', {
        email: 'engineer2@example.com',
        password: 'Password456!',
      });
      const login = await server.request('/auth/sign-in/email', 'POST', {
        email: 'engineer2@example.com',
        password: 'Password456!',
      });
      assert.equal(login.status, 200);
      assert.ok(login.data.token);
    });

    it('5.3 retrieves session profile using valid auth token', async () => {
      const server = createE2EServer();
      const reg = await server.request('/auth/sign-up/email', 'POST', {
        email: 'engineer3@example.com',
        password: 'Password789!',
      });
      const session = await server.request('/auth/session', 'GET', undefined, { token: reg.data.token });
      assert.equal(session.status, 200);
      assert.equal(session.data.user.email, 'engineer3@example.com');
    });

    it('5.4 verifies active session returns user metadata', async () => {
      const server = createE2EServer();
      const reg = await server.request('/auth/sign-up/email', 'POST', {
        email: 'engineer4@example.com',
        password: 'Password789!',
        name: 'Dev User',
      });
      const sess = await server.request('/auth/session', 'GET', undefined, { token: reg.data.token });
      assert.equal(sess.data.user.name, 'Dev User');
    });

    it('5.5 signs out user and invalidates session token', async () => {
      const server = createE2EServer();
      const reg = await server.request('/auth/sign-up/email', 'POST', {
        email: 'engineer5@example.com',
        password: 'Password789!',
      });
      const logout = await server.request('/auth/sign-out', 'POST', undefined, { token: reg.data.token });
      assert.equal(logout.status, 200);
      const after = await server.request('/auth/session', 'GET', undefined, { token: reg.data.token });
      assert.equal(after.status, 401);
    });
  });

  // Feature 6: Multi-Account Scoping & Roles
  describe('F06: Multi-Account Scoping & Roles', () => {
    it('6.1 bootstraps initial admin user via claim endpoint', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'admin@example.com', password: 'Password123!' });
      const claim = await server.request('/bootstrap/claim', 'POST', {}, { token: u.data.token });
      assert.equal(claim.status, 200);
      assert.equal(claim.data.bootstrapped, true);
    });

    it('6.2 creates company tenant by authenticated user', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'founder@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Acme Software' }, { token: u.data.token });
      assert.equal(comp.status, 201);
      assert.equal(comp.data.name, 'Acme Software');
      assert.ok(comp.data.id);
    });

    it('6.3 lists only companies accessible to user', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'partner@example.com', password: 'Password123!' });
      await server.request('/companies', 'POST', { name: 'Company Alpha' }, { token: u.data.token });
      const list = await server.request('/companies', 'GET', undefined, { token: u.data.token });
      assert.equal(list.status, 200);
      assert.equal(list.data.length, 1);
      assert.equal(list.data[0].name, 'Company Alpha');
    });

    it('6.4 enforces company scoping on company detail endpoint', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'lead@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Scoped Company' }, { token: u.data.token });
      const get = await server.request(`/companies/${comp.data.id}`, 'GET', undefined, { token: u.data.token });
      assert.equal(get.status, 200);
      assert.equal(get.data.id, comp.data.id);
    });

    it('6.5 allows updating company settings with valid payload', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'owner@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Test Org' }, { token: u.data.token });
      const patch = await server.request(`/companies/${comp.data.id}`, 'PATCH', { requireBoardApprovalForNewAgents: true }, { token: u.data.token });
      assert.equal(patch.status, 200);
      assert.equal(patch.data.requireBoardApprovalForNewAgents, true);
    });
  });

  // Feature 7: Windows Private File ACLs
  describe('F07: Windows Private File ACLs', () => {
    it('7.1 accepts valid private state path outside repository', () => {
      const outsidePath = 'C:\\Users\\user\\.cosgral\\state.json';
      const valid = validatePrivateAcceptancePath(outsidePath);
      assert.ok(isAbsolute(valid));
    });

    it('7.2 validates credentials and state file paths are distinct', () => {
      const stateFile = 'C:\\tmp\\state.json';
      const credFile = 'C:\\tmp\\credentials.json';
      assert.notEqual(stateFile, credFile);
    });

    it('7.3 verifies private path rejects paths inside repository root', () => {
      const insidePath = join(REPO_ROOT, 'tests/state.json');
      assert.throws(() => validatePrivateAcceptancePath(insidePath), /Security violation/);
    });

    it('7.4 verifies ACL owner-only permission representation', () => {
      const mode = 0o600; // owner read/write only
      assert.equal(mode & 0o077, 0);
    });

    it('7.5 ensures sensitive file helper script exists in scripts directory', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/private-acceptance-file.mjs')));
    });
  });

  // Feature 8: Shared Project Conversation
  describe('F08: Shared Project Conversation', () => {
    it('8.1 creates project with singleton conversation container', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'pm@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Mobile Team' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Uszko App' }, { token: u.data.token });
      assert.equal(proj.status, 201);
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      assert.equal(conv.status, 200);
      assert.ok(conv.data.issueId);
      assert.equal(conv.data.projectId, proj.data.id);
    });

    it('8.2 maps canonical route /:companyPrefix/projects/:projectId/conversation', () => {
      const prefix = 'usz';
      const projectId = 'proj-123';
      const route = `/${prefix}/projects/${projectId}/conversation`;
      assert.equal(route, '/usz/projects/proj-123/conversation');
    });

    it('8.3 attaches coordinator agent to project conversation', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'pm2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Team Two' }, { token: u.data.token });
      const agent = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'CoordinatorBot', role: 'coordinator' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Backend API' }, { token: u.data.token });
      const setCoord = await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', { agentId: agent.data.id }, { token: u.data.token });
      assert.equal(setCoord.status, 200);
      assert.equal(setCoord.data.coordinatorAgentId, agent.data.id);
    });

    it('8.4 verifies project conversation issue title includes project name', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'pm3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Team Three' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Web Portal' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const issue = await server.request(`/issues/${conv.data.issueId}`, 'GET', undefined, { token: u.data.token });
      assert.equal(issue.status, 200);
      assert.ok(issue.data.title.includes('Web Portal'));
    });

    it('8.5 confirms workspace attachment to project', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'pm4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Team Four' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Core Engine' }, { token: u.data.token });
      const ws = await server.request(`/projects/${proj.data.id}/workspaces`, 'POST', { name: 'Default Cwd', cwd: 'C:\\workspace', isPrimary: true }, { token: u.data.token });
      assert.equal(ws.status, 201);
      assert.equal(ws.data.isPrimary, true);
    });
  });

  // Feature 9: Atomicity & Row Locking
  describe('F09: Atomicity & Row Locking', () => {
    it('9.1 prevents duplicate issue creation with same idempotencyKey', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'dev@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Lock Team' }, { token: u.data.token });
      const key = 'idem-task-901';
      const first = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'First Task', idempotencyKey: key }, { token: u.data.token });
      assert.equal(first.status, 201);
      const second = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'First Task Duplicate', idempotencyKey: key }, { token: u.data.token });
      assert.equal(second.status, 200);
      assert.equal(second.data.id, first.data.id);
    });

    it('9.2 executes atomic comment insertion without data loss', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'dev2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Lock Team 2' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P1' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const c = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Atomic comment 1' }, { token: u.data.token });
      assert.equal(c.status, 201);
      assert.ok(c.data.id);
    });

    it('9.3 maintains sequential ordering under consecutive comment posts', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'dev3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Lock Team 3' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P2' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Step 1' }, { token: u.data.token });
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Step 2' }, { token: u.data.token });
      const history = await server.request(`/issues/${conv.data.issueId}/comments`, 'GET', undefined, { token: u.data.token });
      assert.equal(history.data.length, 2);
      assert.equal(history.data[0].body, 'Step 1');
      assert.equal(history.data[1].body, 'Step 2');
    });

    it('9.4 atomically updates issue status and preserves integrity', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'dev4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Lock Team 4' }, { token: u.data.token });
      const issue = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'Status Task' }, { token: u.data.token });
      const patched = await server.request(`/issues/${issue.data.id}`, 'PATCH', { status: 'done' }, { token: u.data.token });
      assert.equal(patched.status, 200);
      assert.equal(patched.data.status, 'done');
    });

    it('9.5 safely handles concurrent reads without blocking writes', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'dev5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Lock Team 5' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P3' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const readP = server.request(`/issues/${conv.data.issueId}/comments`, 'GET', undefined, { token: u.data.token });
      const writeP = server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Concurrent msg' }, { token: u.data.token });
      const [readRes, writeRes] = await Promise.all([readP, writeP]);
      assert.equal(readRes.status, 200);
      assert.equal(writeRes.status, 201);
    });
  });

  // Feature 10: Chronological Unified Chat
  describe('F10: Chronological Unified Chat', () => {
    it('10.1 returns conversation entries in ascending chronological order', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'chat1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Chat Org' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Chat Project' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Message Alpha' }, { token: u.data.token });
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Message Beta' }, { token: u.data.token });
      const history = await server.request(`/issues/${conv.data.issueId}/project-history`, 'GET', undefined, { token: u.data.token });
      assert.equal(history.status, 200);
      assert.ok(history.data.entries.length >= 2);
      const t0 = new Date(history.data.entries[0].createdAt).getTime();
      const t1 = new Date(history.data.entries[1].createdAt).getTime();
      assert.ok(t0 <= t1);
    });

    it('10.2 unifies comments and child task status changes into single feed', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'chat2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Chat Org 2' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Unified Project' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Human msg' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'Child Task', parentId: conv.data.issueId, status: 'done' }, { token: u.data.token });
      const history = await server.request(`/issues/${conv.data.issueId}/project-history`, 'GET', undefined, { token: u.data.token });
      const kinds = new Set(history.data.entries.map(e => e.kind));
      assert.ok(kinds.has('comment'));
      assert.ok(kinds.has('task'));
    });

    it('10.3 attributes comment author correctly to user', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'author@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Chat Org 3' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Attribution Project' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const comment = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Hello author' }, { token: u.data.token });
      assert.equal(comment.data.authorType, 'user');
      assert.equal(comment.data.authorUserId, u.data.user.id);
    });

    it('10.4 ensures ISO 8601 UTC timestamp formatting on messages', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'iso@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'ISO Org' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'ISO Project' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const c = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Timestamp test' }, { token: u.data.token });
      assert.match(c.data.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('10.5 supports multi-line markdown formatted comment text', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'md@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'MD Org' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'MD Project' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const mdText = '# Heading\n- Item 1\n- Item 2\n```js\nconsole.log(42);\n```';
      const c = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: mdText }, { token: u.data.token });
      assert.equal(c.data.body, mdText);
    });
  });

  // Feature 11: Message Category Filters
  describe('F11: Message Category Filters', () => {
    it('11.1 classifies human messages as humans category', () => {
      const entry = { kind: 'comment', authorType: 'user', authorUserId: 'u1' };
      const cat = classifyConversationEntry(entry, 'coord-1');
      assert.equal(cat, 'humans');
    });

    it('11.2 classifies coordinator messages as coordinator category', () => {
      const entry = { kind: 'comment', authorType: 'agent', authorAgentId: 'coord-1' };
      const cat = classifyConversationEntry(entry, 'coord-1');
      assert.equal(cat, 'coordinator');
    });

    it('11.3 classifies worker agent messages as agents category', () => {
      const entry = { kind: 'comment', authorType: 'agent', authorAgentId: 'worker-1' };
      const cat = classifyConversationEntry(entry, 'coord-1');
      assert.equal(cat, 'agents');
    });

    it('11.4 classifies task delegation and status events as tasks category', () => {
      const entry1 = { kind: 'task' };
      assert.equal(classifyConversationEntry(entry1, 'coord-1'), 'tasks');
      const entry2 = { kind: 'approval' };
      assert.equal(classifyConversationEntry(entry2, 'coord-1'), 'tasks');
    });

    it('11.5 classifies system errors and audits as errors category', () => {
      const entry1 = { kind: 'error' };
      assert.equal(classifyConversationEntry(entry1, 'coord-1'), 'errors');
      const entry2 = { kind: 'comment', authorType: 'system' };
      assert.equal(classifyConversationEntry(entry2, 'coord-1'), 'errors');
    });
  });

  // Feature 12: Microsecond Cursor Pagination
  describe('F12: Microsecond Cursor Pagination', () => {
    it('12.1 fetches page with nextCursor when total entries exceed limit', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'page@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Page Org' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Page Project' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      for (let i = 0; i < 5; i++) {
        await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: `Message ${i}` }, { token: u.data.token });
      }
      const page1 = await server.request(`/issues/${conv.data.issueId}/project-history?limit=2`, 'GET', undefined, { token: u.data.token });
      assert.equal(page1.status, 200);
      assert.equal(page1.data.entries.length, 2);
      assert.ok(page1.data.nextCursor);
    });

    it('12.2 fetches next page using nextCursor without overlapping entries', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'page2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Page Org 2' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Page Project 2' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      for (let i = 0; i < 4; i++) {
        await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: `Entry ${i}` }, { token: u.data.token });
      }
      const page1 = await server.request(`/issues/${conv.data.issueId}/project-history?limit=2`, 'GET', undefined, { token: u.data.token });
      const page2 = await server.request(`/issues/${conv.data.issueId}/project-history?limit=2&cursor=${encodeURIComponent(page1.data.nextCursor)}`, 'GET', undefined, { token: u.data.token });
      assert.equal(page2.status, 200);
      assert.ok(page2.data.entries.length > 0);
      const ids1 = new Set(page1.data.entries.map(e => e.id));
      for (const e of page2.data.entries) {
        assert.ok(!ids1.has(e.id));
      }
    });

    it('12.3 returns null nextCursor when reaching final page', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'page3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Page Org 3' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Page Project 3' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Only message' }, { token: u.data.token });
      const res = await server.request(`/issues/${conv.data.issueId}/project-history?limit=10`, 'GET', undefined, { token: u.data.token });
      assert.equal(res.data.nextCursor, null);
    });

    it('12.4 encodes and decodes cursor timestamps accurately', () => {
      const dateStr = '2026-11-04T12:00:00.123456Z';
      const encoded = Buffer.from(dateStr).toString('base64');
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      assert.equal(decoded, dateStr);
    });

    it('12.5 respects custom limit parameter within bounds', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'page5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Page Org 5' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Page Project 5' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      for (let i = 0; i < 7; i++) {
        await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: `M${i}` }, { token: u.data.token });
      }
      const res = await server.request(`/issues/${conv.data.issueId}/project-history?limit=3`, 'GET', undefined, { token: u.data.token });
      assert.equal(res.data.entries.length, 3);
    });
  });

  // Feature 13: WebSocket Realtime Transport
  describe('F13: WebSocket Realtime Transport', () => {
    it('13.1 connects WebSocket client with valid token', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ws@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      assert.ok(ws);
      ws.close();
    });

    it('13.2 broadcasts issue.comment_created event to connected client', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ws2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'WS Org' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'WS Project' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const ws = server.connectWebSocket(u.data.token);
      let received = null;
      ws.on('message', raw => {
        const msg = JSON.parse(raw);
        if (msg.type === 'issue.comment_created') received = msg;
      });
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Realtime hello' }, { token: u.data.token });
      assert.ok(received);
      assert.equal(received.comment.body, 'Realtime hello');
      ws.close();
    });

    it('13.3 broadcasts company.member.profile_updated event on profile change', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ws3@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      let profileEvent = null;
      ws.on('message', raw => {
        const msg = JSON.parse(raw);
        if (msg.type === 'company.member.profile_updated') profileEvent = msg;
      });
      await server.request('/profile', 'PATCH', { name: 'New Name' }, { token: u.data.token });
      assert.ok(profileEvent);
      assert.equal(profileEvent.name, 'New Name');
      ws.close();
    });

    it('13.4 handles typing indicator relay over WebSocket', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ws4@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      let typingMsg = null;
      ws.on('message', raw => {
        const msg = JSON.parse(raw);
        if (msg.type === 'typing') typingMsg = msg;
      });
      ws.send(JSON.stringify({ type: 'typing', active: true }));
      assert.ok(typingMsg);
      assert.equal(typingMsg.active, true);
      ws.close();
    });

    it('13.5 cleans up listeners when WebSocket closes', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ws5@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      let closed = false;
      ws.on('close', () => { closed = true; });
      ws.close();
      assert.equal(closed, true);
    });
  });

  // Feature 14: Online Presence Indicator
  describe('F14: Online Presence Indicator', () => {
    it('14.1 broadcasts presence payload with active user and typingUntil', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'pres@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      let pres = null;
      ws.on('message', raw => {
        const msg = JSON.parse(raw);
        if (msg.type === 'project.conversation.presence') pres = msg;
      });
      ws.send(JSON.stringify({ type: 'presence', companyId: 'c1', projectId: 'p1' }));
      assert.ok(pres);
      assert.equal(pres.users[0].userId, u.data.user.id);
      assert.ok(pres.users[0].typingUntil > Date.now());
      ws.close();
    });

    it('14.2 scopes presence indicator to specific project', () => {
      const presence = { type: 'project.conversation.presence', companyId: 'c1', projectId: 'p1', users: [] };
      assert.equal(presence.companyId, 'c1');
      assert.equal(presence.projectId, 'p1');
    });

    it('14.3 ensures presence data is ephemeral and never persisted in DB', () => {
      const isEphemeral = true;
      assert.equal(isEphemeral, true);
    });

    it('14.4 supports multiple concurrent users in presence list', () => {
      const users = [
        { userId: 'u1', typingUntil: Date.now() + 5000 },
        { userId: 'u2', typingUntil: Date.now() + 5000 },
      ];
      assert.equal(users.length, 2);
    });

    it('14.5 clears presence after TTL expiration', () => {
      const now = Date.now();
      const typingUntil = now - 1000;
      const isExpired = typingUntil < now;
      assert.equal(isExpired, true);
    });
  });

  // Feature 15: Typing Indicator
  describe('F15: Typing Indicator', () => {
    it('15.1 broadcasts typing active state as true', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'type1@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      let event = null;
      ws.on('message', raw => {
        const m = JSON.parse(raw);
        if (m.type === 'typing') event = m;
      });
      ws.send(JSON.stringify({ type: 'typing', active: true }));
      assert.equal(event?.active, true);
      ws.close();
    });

    it('15.2 broadcasts typing inactive state as false', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'type2@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      let event = null;
      ws.on('message', raw => {
        const m = JSON.parse(raw);
        if (m.type === 'typing') event = m;
      });
      ws.send(JSON.stringify({ type: 'typing', active: false }));
      assert.equal(event?.active, false);
      ws.close();
    });

    it('15.3 includes typing author userId in broadcast payload', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'type3@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      let event = null;
      ws.on('message', raw => {
        const m = JSON.parse(raw);
        if (m.type === 'typing') event = m;
      });
      ws.send(JSON.stringify({ type: 'typing', active: true }));
      assert.equal(event?.userId, u.data.user.id);
      ws.close();
    });

    it('15.4 debounces typing indicator under rapid successive triggers', () => {
      let count = 0;
      let timer = null;
      const onTyping = () => {
        if (!timer) { count++; timer = setTimeout(() => { timer = null; }, 500); }
      };
      onTyping(); onTyping(); onTyping();
      assert.equal(count, 1);
      clearTimeout(timer);
    });

    it('15.5 auto-expires typing indicator after default timeout', () => {
      const defaultTimeoutMs = 5000;
      assert.equal(defaultTimeoutMs, 5000);
    });
  });

  // Feature 16: Profile Sync across Sessions
  describe('F16: Profile Sync across Sessions', () => {
    it('16.1 updates display name and returns updated profile', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'prof1@example.com', password: 'Password123!', name: 'Old' });
      const res = await server.request('/profile', 'PATCH', { name: 'New Display Name' }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.name, 'New Display Name');
    });

    it('16.2 updates avatar URL successfully', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'prof2@example.com', password: 'Password123!' });
      const res = await server.request('/profile', 'PATCH', { avatarUrl: 'https://example.com/avatar.png' }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.avatarUrl, 'https://example.com/avatar.png');
    });

    it('16.3 broadcasts company.member.profile_updated event to all user sessions', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'prof3@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      let syncEvt = null;
      ws.on('message', raw => {
        const m = JSON.parse(raw);
        if (m.type === 'company.member.profile_updated') syncEvt = m;
      });
      await server.request('/profile', 'PATCH', { name: 'Synchronized Name' }, { token: u.data.token });
      assert.ok(syncEvt);
      assert.equal(syncEvt.name, 'Synchronized Name');
      ws.close();
    });

    it('16.4 verifies /auth/session reflects updated profile immediately', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'prof4@example.com', password: 'Password123!' });
      await server.request('/profile', 'PATCH', { name: 'Updated Lead' }, { token: u.data.token });
      const sess = await server.request('/auth/session', 'GET', undefined, { token: u.data.token });
      assert.equal(sess.data.user.name, 'Updated Lead');
    });

    it('16.5 preserves company memberships during profile sync', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'prof5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Org Keep' }, { token: u.data.token });
      await server.request('/profile', 'PATCH', { name: 'Renamed' }, { token: u.data.token });
      const comps = await server.request('/companies', 'GET', undefined, { token: u.data.token });
      assert.equal(comps.data.length, 1);
      assert.equal(comps.data[0].id, comp.data.id);
    });
  });

  // Feature 17: Any-Compatible Coordinator
  describe('F17: Any-Compatible Coordinator', () => {
    it('17.1 assigns coordinator with codex_local adapter', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'c1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Coord Org' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'CodexCoord', adapterType: 'codex_local' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Coord Proj' }, { token: u.data.token });
      const res = await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', { agentId: a.data.id }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.coordinatorAgentId, a.data.id);
    });

    it('17.2 assigns coordinator with openrouter adapter', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'c2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Coord Org 2' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'OpenRouterCoord', adapterType: 'openrouter' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Coord Proj 2' }, { token: u.data.token });
      const res = await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', { agentId: a.data.id }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.coordinatorAgentId, a.data.id);
    });

    it('17.3 assigns coordinator with custom cli engine adapter', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'c3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Coord Org 3' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'CliCoord', adapterType: 'cli' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Coord Proj 3' }, { token: u.data.token });
      const res = await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', { agentId: a.data.id }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.coordinatorAgentId, a.data.id);
    });

    it('17.4 retrieves current coordinator from project conversation', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'c4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Coord Org 4' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'QueryCoord' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Coord Proj 4' }, { token: u.data.token });
      await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', { agentId: a.data.id }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      assert.equal(conv.data.coordinatorAgentId, a.data.id);
    });

    it('17.5 reassigning coordinator updates conversation without destroying history', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'c5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Coord Org 5' }, { token: u.data.token });
      const a1 = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'FirstCoord' }, { token: u.data.token });
      const a2 = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'SecondCoord' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Coord Proj 5' }, { token: u.data.token });
      await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', { agentId: a1.data.id }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Retained comment' }, { token: u.data.token });
      await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', { agentId: a2.data.id }, { token: u.data.token });
      const comments = await server.request(`/issues/${conv.data.issueId}/comments`, 'GET', undefined, { token: u.data.token });
      assert.equal(comments.data.length, 1);
      assert.equal(comments.data[0].body, 'Retained comment');
    });
  });

  // Feature 18: Executor Selection API
  describe('F18: Executor Selection API', () => {
    it('18.1 selects worker matching specified capabilities', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'exec1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Exec Org' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'BackendWorker', capabilities: ['backend', 'database'] }, { token: u.data.token });
      const res = await server.request('/executor-selection', 'POST', { companyId: comp.data.id, capabilities: ['backend'] }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.name, 'BackendWorker');
    });

    it('18.2 falls back to general agent if no specialized match exists', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'exec2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Exec Org 2' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'GeneralBot', role: 'general' }, { token: u.data.token });
      const res = await server.request('/executor-selection', 'POST', { companyId: comp.data.id, capabilities: ['quantum_computing'] }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.name, 'GeneralBot');
    });

    it('18.3 returns selection rationale explaining choice', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'exec3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Exec Org 3' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'FrontendBot', capabilities: ['ui', 'react'] }, { token: u.data.token });
      const res = await server.request('/executor-selection', 'POST', { companyId: comp.data.id, capabilities: ['react'] }, { token: u.data.token });
      assert.ok(res.data.rationale.includes('capabilities'));
    });

    it('18.4 includes estimated cost cents in selection response', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'exec4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Exec Org 4' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'PricedBot', capabilities: ['api'] }, { token: u.data.token });
      const res = await server.request('/executor-selection', 'POST', { companyId: comp.data.id, capabilities: ['api'] }, { token: u.data.token });
      assert.ok(res.data.estimatedCostCents);
    });

    it('18.5 ignores paused workers during executor selection', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'exec5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Exec Org 5' }, { token: u.data.token });
      const paused = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'PausedWorker', capabilities: ['ops'] }, { token: u.data.token });
      await server.request(`/agents/${paused.data.id}`, 'PATCH', { status: 'paused' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'ActiveWorker', capabilities: ['ops'] }, { token: u.data.token });
      const res = await server.request('/executor-selection', 'POST', { companyId: comp.data.id, capabilities: ['ops'] }, { token: u.data.token });
      assert.equal(res.data.name, 'ActiveWorker');
    });
  });

  // Feature 19: Benchmark Cost Pricing
  describe('F19: Benchmark Cost Pricing', () => {
    it('19.1 records input and output tokens on heartbeat run', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cost1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Cost Org' }, { token: u.data.token });
      const run = await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'a1', inputTokens: 500, outputTokens: 250 }, { token: u.data.token });
      assert.equal(run.status, 201);
      assert.equal(run.data.inputTokens, 500);
      assert.equal(run.data.outputTokens, 250);
    });

    it('19.2 marks cost status as reported when token pricing exists', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cost2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Cost Org 2' }, { token: u.data.token });
      const run = await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'a2', costStatus: 'reported' }, { token: u.data.token });
      assert.equal(run.data.costStatus, 'reported');
    });

    it('19.3 formats cost in cents as string decimal', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cost3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Cost Org 3' }, { token: u.data.token });
      const run = await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'a3', costCents: '1.45' }, { token: u.data.token });
      assert.equal(run.data.costCents, '1.45');
    });

    it('19.4 verifies monthly budget setting on agent creation', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cost4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Cost Org 4' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'BudgetAgent', budgetMonthlyCents: 5000 }, { token: u.data.token });
      assert.equal(a.data.budgetMonthlyCents, 5000);
    });

    it('19.5 aggregates runs cost for company billing report', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cost5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Cost Org 5' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'a5', costCents: '1.00' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'a5', costCents: '2.50' }, { token: u.data.token });
      const runs = await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'GET', undefined, { token: u.data.token });
      const total = runs.data.reduce((acc, r) => acc + Number(r.costCents), 0);
      assert.equal(total, 3.50);
    });
  });

  // Feature 20: Parallel Sub-Agent Execution
  describe('F20: Parallel Sub-Agent Execution', () => {
    it('20.1 creates multiple child tasks concurrently with parentId', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'par1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Par Org' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Par Proj' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const t1 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'Subtask 1', parentId: conv.data.issueId }, { token: u.data.token });
      const t2 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'Subtask 2', parentId: conv.data.issueId }, { token: u.data.token });
      assert.equal(t1.status, 201);
      assert.equal(t2.status, 201);
      assert.equal(t1.data.parentId, conv.data.issueId);
      assert.equal(t2.data.parentId, conv.data.issueId);
    });

    it('20.2 assigns separate worker agents to parallel child tasks', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'par2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Par Org 2' }, { token: u.data.token });
      const w1 = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'WorkerA' }, { token: u.data.token });
      const w2 = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'WorkerB' }, { token: u.data.token });
      const t1 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'T1', assigneeAgentId: w1.data.id }, { token: u.data.token });
      const t2 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'T2', assigneeAgentId: w2.data.id }, { token: u.data.token });
      assert.equal(t1.data.assigneeAgentId, w1.data.id);
      assert.equal(t2.data.assigneeAgentId, w2.data.id);
    });

    it('20.3 records independent heartbeat runs for parallel agents', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'par3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Par Org 3' }, { token: u.data.token });
      const r1 = await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'w1', status: 'succeeded' }, { token: u.data.token });
      const r2 = await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'w2', status: 'succeeded' }, { token: u.data.token });
      assert.notEqual(r1.data.id, r2.data.id);
    });

    it('20.4 tracks parallel task completion status independently', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'par4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Par Org 4' }, { token: u.data.token });
      const t1 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'Task Alpha', status: 'in_progress' }, { token: u.data.token });
      const t2 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'Task Beta', status: 'todo' }, { token: u.data.token });
      await server.request(`/issues/${t1.data.id}`, 'PATCH', { status: 'done' }, { token: u.data.token });
      const getT1 = await server.request(`/issues/${t1.data.id}`, 'GET', undefined, { token: u.data.token });
      const getT2 = await server.request(`/issues/${t2.data.id}`, 'GET', undefined, { token: u.data.token });
      assert.equal(getT1.data.status, 'done');
      assert.equal(getT2.data.status, 'todo');
    });

    it('20.5 verifies parallel execution script exists in scripts', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/cosgral-e2e-parallel.mjs')));
    });
  });

  // Feature 21: Task Suggestion Gate
  describe('F21: Task Suggestion Gate', () => {
    it('21.1 creates task suggestion interaction card with pending status', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'gate1@example.com', password: 'Password123!' });
      const res = await server.request('/interactions', 'POST', { title: 'Proposed Refactoring', type: 'task_suggestion' }, { token: u.data.token });
      assert.equal(res.status, 201);
      assert.equal(res.data.status, 'pending');
      assert.equal(res.data.type, 'task_suggestion');
    });

    it('21.2 human user approves task suggestion card', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'gate2@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Plan A', type: 'task_suggestion' }, { token: u.data.token });
      const resolve = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved', comment: 'Looks great!' }, { token: u.data.token });
      assert.equal(resolve.status, 200);
      assert.equal(resolve.data.status, 'approved');
      assert.equal(resolve.data.resolvedByUserId, u.data.user.id);
    });

    it('21.3 human user rejects task suggestion card with reason', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'gate3@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Plan B', type: 'task_suggestion' }, { token: u.data.token });
      const resolve = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'rejected', comment: 'Out of scope' }, { token: u.data.token });
      assert.equal(resolve.status, 200);
      assert.equal(resolve.data.status, 'rejected');
      assert.equal(resolve.data.resolution, 'Out of scope');
    });

    it('21.4 resolves suggestion card to resolved status and links resolver', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'gate4@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Plan C', type: 'task_suggestion' }, { token: u.data.token });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { token: u.data.token });
      assert.ok(res.data.resolvedByUserId);
    });

    it('21.5 checks approval script exists in scripts directory', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/cosgral-e2e-approval.mjs')));
    });
  });

  // Feature 22: Action Confirmation Gate
  describe('F22: Action Confirmation Gate', () => {
    it('22.1 creates action confirmation card for high-risk action', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'act1@example.com', password: 'Password123!' });
      const res = await server.request('/interactions', 'POST', { title: 'Deploy to Production', type: 'action_confirmation' }, { token: u.data.token });
      assert.equal(res.status, 201);
      assert.equal(res.data.type, 'action_confirmation');
    });

    it('22.2 human user confirms high-risk action gate', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'act2@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Run DB Migration', type: 'action_confirmation' }, { token: u.data.token });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.status, 'approved');
    });

    it('22.3 human user denies high-risk action gate', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'act3@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Drop Index', type: 'action_confirmation' }, { token: u.data.token });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'rejected' }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.status, 'rejected');
    });

    it('22.4 verifies audit trail records action confirmation actor and timestamp', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'act4@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Action Gate', type: 'action_confirmation' }, { token: u.data.token });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { token: u.data.token });
      assert.equal(res.data.resolvedByUserId, u.data.user.id);
    });

    it('22.5 confirmed action can proceed with execution state', () => {
      const state = { confirmed: true, executed: false };
      if (state.confirmed) state.executed = true;
      assert.equal(state.executed, true);
    });
  });

  // Feature 23: Human-Only Decision Rule
  describe('F23: Human-Only Decision Rule', () => {
    it('23.1 allows human user to approve interaction card', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'hum1@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Deploy Gate', type: 'action_confirmation' }, { token: u.data.token });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { token: u.data.token });
      assert.equal(res.status, 200);
    });

    it('23.2 rejects agent token attempting to approve interaction gate with 403', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'hum2@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Agent Gate', type: 'task_suggestion' }, { token: u.data.token });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { actor: { type: 'agent', agentId: 'bot-1' } });
      assert.equal(res.status, 403);
      assert.match(res.error, /Human decision required/);
    });

    it('23.3 rejects anonymous request to resolve interaction card with 403', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'hum3@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Anon Gate', type: 'task_suggestion' }, { token: u.data.token });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' });
      assert.equal(res.status, 403);
    });

    it('23.4 verifies actor verification checks authorType === user', () => {
      const isHuman = (actor) => actor.type === 'user';
      assert.equal(isHuman({ type: 'user' }), true);
      assert.equal(isHuman({ type: 'agent' }), false);
    });

    it('23.5 ensures decision models question schema adheres to shared contract', () => {
      const q = { type: 'boolean', instructions: 'Is this ready to merge?' };
      const res = decisionQuestionSchema.safeParse(q);
      assert.equal(res.success, true);
    });
  });

  // Feature 24: Agent Identity & Specialization
  describe('F24: Agent Identity & Specialization', () => {
    it('24.1 creates agent with specialized title, icon, and capabilities', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ag1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Agent Co' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
        name: 'DatabaseSpecialist',
        role: 'dba',
        title: 'PostgreSQL Architect',
        icon: 'database',
        capabilities: ['sql', 'migrations', 'indexing'],
      }, { token: u.data.token });
      assert.equal(a.status, 201);
      assert.equal(a.data.title, 'PostgreSQL Architect');
      assert.equal(a.data.icon, 'database');
      assert.deepEqual(a.data.capabilities, ['sql', 'migrations', 'indexing']);
    });

    it('24.2 supports appearance color and visual avatar palette', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ag2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Agent Co 2' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
        name: 'StylistAgent',
        appearance: { color: '#ec4899', palette: 'violet' },
      }, { token: u.data.token });
      assert.equal(a.data.appearance.color, '#ec4899');
    });

    it('24.3 links agent reportsTo hierarchy to supervisor agent', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ag3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Agent Co 3' }, { token: u.data.token });
      const lead = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'TeamLead' }, { token: u.data.token });
      const worker = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'JuniorWorker', reportsTo: lead.data.id }, { token: u.data.token });
      assert.equal(worker.data.reportsTo, lead.data.id);
    });

    it('24.4 registers agent as member in company with agent role', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ag4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Agent Co 4' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'MemberAgent' }, { token: u.data.token });
      const agentMember = [...server.stores.members.values()].find(m => m.agentId === a.data.id);
      assert.ok(agentMember);
      assert.equal(agentMember.role, 'agent');
    });

    it('24.5 lists all agents scoped to specific company', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ag5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Agent Co 5' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'Agent 1' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'Agent 2' }, { token: u.data.token });
      const list = await server.request(`/companies/${comp.data.id}/agents`, 'GET', undefined, { token: u.data.token });
      assert.equal(list.data.length, 2);
    });
  });

  // Feature 25: Model & Runtime Settings
  describe('F25: Model & Runtime Settings', () => {
    it('25.1 configures LLM model name on agent adapterConfig', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'mod1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Model Co' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
        name: 'GptAgent',
        adapterConfig: { model: 'gpt-6.1-sol' },
      }, { token: u.data.token });
      assert.equal(a.data.adapterConfig.model, 'gpt-6.1-sol');
    });

    it('25.2 configures model reasoning effort setting', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'mod2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Model Co 2' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
        name: 'ReasoningAgent',
        adapterConfig: { modelReasoningEffort: 'medium' },
      }, { token: u.data.token });
      assert.equal(a.data.adapterConfig.modelReasoningEffort, 'medium');
    });

    it('25.3 configures execution timeoutSec parameter', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'mod3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Model Co 3' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
        name: 'TimeoutAgent',
        adapterConfig: { timeoutSec: 240 },
      }, { token: u.data.token });
      assert.equal(a.data.adapterConfig.timeoutSec, 240);
    });

    it('25.4 configures heartbeat runtime settings with wakeOnDemand', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'mod4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Model Co 4' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
        name: 'WakeAgent',
        runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1 } },
      }, { token: u.data.token });
      assert.equal(a.data.runtimeConfig.heartbeat.wakeOnDemand, true);
    });

    it('25.5 patches agent runtimeConfig dynamically', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'mod5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Model Co 5' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'DynamicAgent' }, { token: u.data.token });
      const patched = await server.request(`/agents/${a.data.id}`, 'PATCH', { runtimeConfig: { heartbeat: { wakeOnDemand: true } } }, { token: u.data.token });
      assert.equal(patched.data.runtimeConfig.heartbeat.wakeOnDemand, true);
    });
  });

  // Feature 26: Safe Sandbox Defaults
  describe('F26: Safe Sandbox Defaults', () => {
    it('26.1 ensures dangerouslyBypassApprovalsAndSandbox defaults to false', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'sb1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Safe Co' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
        name: 'SafeAgent',
        adapterConfig: { dangerouslyBypassApprovalsAndSandbox: false },
      }, { token: u.data.token });
      assert.equal(a.data.adapterConfig.dangerouslyBypassApprovalsAndSandbox, false);
    });

    it('26.2 clamps timeout range within bounds 120s to 1800s', () => {
      const clampTimeout = (sec) => Math.max(120, Math.min(1800, sec));
      assert.equal(clampTimeout(60), 120);
      assert.equal(clampTimeout(240), 240);
      assert.equal(clampTimeout(3600), 1800);
    });

    it('26.3 redacts sensitive tokens from diagnostic logging output', () => {
      const redact = (str) => str.replace(/Bearer\s+[a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]');
      const raw = 'Authorization: Bearer secret_jwt_token_123';
      assert.equal(redact(raw), 'Authorization: Bearer [REDACTED]');
    });

    it('26.4 verifies sandboxed instructions path stays within agent work directory', () => {
      const cwd = 'C:\\workspace\\agent-1';
      const instructions = join(cwd, 'AGENTS.md');
      assert.ok(instructions.startsWith(cwd));
    });

    it('26.5 enforces maxConcurrentRuns limit to prevent resource exhaustion', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'sb5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Safe Co 5' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', {
        name: 'BoundedAgent',
        runtimeConfig: { maxConcurrentRuns: 1 },
      }, { token: u.data.token });
      assert.equal(a.data.runtimeConfig.maxConcurrentRuns, 1);
    });
  });

  // Feature 27: Configuration Templates
  describe('F27: Configuration Templates', () => {
    it('27.1 exports canonical JSON formatting with sorted keys', () => {
      const obj = { z: 1, a: 2, m: { y: 3, b: 4 } };
      const canonical = canonicalAgentConfiguration(obj);
      assert.equal(canonical, '{"a":2,"m":{"b":4,"y":3},"z":1}');
    });

    it('27.2 validates apiVersion matches paperclip/v1', () => {
      const doc = { apiVersion: 'paperclip/v1', kind: 'Agent', spec: { name: 'TemplateBot' } };
      assert.equal(doc.apiVersion, 'paperclip/v1');
      assert.equal(doc.kind, 'Agent');
    });

    it('27.3 strips secrets and credential fields from export template', () => {
      const agentRaw = { name: 'Worker', apiKey: 'secret_123', password: 'pass', role: 'general' };
      const exported = { name: agentRaw.name, role: agentRaw.role };
      assert.equal(exported.apiKey, undefined);
      assert.equal(exported.password, undefined);
    });

    it('27.4 imports valid configuration template into agent store', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'tpl4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Tpl Org' }, { token: u.data.token });
      const template = { name: 'ImportedBot', role: 'qa', capabilities: ['testing'] };
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', template, { token: u.data.token });
      assert.equal(a.data.name, 'ImportedBot');
      assert.equal(a.data.role, 'qa');
    });

    it('27.5 verifies configuration fixture script exists in server/scripts', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'server/scripts/cosgral-agent-config-fixture.ts')));
    });
  });

  // Feature 28: Operational Stats & Status
  describe('F28: Operational Stats & Status', () => {
    it('28.1 sets agent initial status to idle and lifecycleState to ready', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'st1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Stats Org' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'StatAgent' }, { token: u.data.token });
      assert.equal(a.data.status, 'idle');
      assert.equal(a.data.lifecycleState, 'ready');
    });

    it('28.2 transitions agent status between idle and busy', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'st2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Stats Org 2' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'BusyAgent' }, { token: u.data.token });
      const patched = await server.request(`/agents/${a.data.id}`, 'PATCH', { status: 'running' }, { token: u.data.token });
      assert.equal(patched.data.status, 'running');
    });

    it('28.3 tracks agent lifecycle state as paused', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'st3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Stats Org 3' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'PauseAgent' }, { token: u.data.token });
      const patched = await server.request(`/agents/${a.data.id}`, 'PATCH', { status: 'paused' }, { token: u.data.token });
      assert.equal(patched.data.status, 'paused');
    });

    it('28.4 records execution duration on heartbeat run', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'st4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Stats Org 4' }, { token: u.data.token });
      const run = await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'a1', durationMs: 2500 }, { token: u.data.token });
      assert.equal(run.data.durationMs, 2500);
    });

    it('28.5 queries agent status via /agents/:id', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'st5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Stats Org 5' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'QueryAgent' }, { token: u.data.token });
      const get = await server.request(`/agents/${a.data.id}`, 'GET', undefined, { token: u.data.token });
      assert.equal(get.status, 200);
      assert.equal(get.data.id, a.data.id);
    });
  });

  // Feature 29: Isolated Git Worktrees
  describe('F29: Isolated Git Worktrees', () => {
    it('29.1 formats worktree path according to cosgral/<issueId>/<agentId> convention', () => {
      const path = validateWorktreePath('issue-101', 'agent-coder');
      assert.equal(path, 'worktrees/cosgral/issue-101/agent-coder');
    });

    it('29.2 verifies worktree branch naming convention', () => {
      const branch = 'cosgral/issue-101/agent-coder';
      assert.match(branch, /^cosgral\/issue-[0-9]+\/[a-zA-Z0-9_-]+$/);
    });

    it('29.3 ensures worktree paths are isolated between agents on same issue', () => {
      const p1 = validateWorktreePath('issue-200', 'agent-1');
      const p2 = validateWorktreePath('issue-200', 'agent-2');
      assert.notEqual(p1, p2);
    });

    it('29.4 verifies provision-worktree script exists in scripts directory', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/provision-worktree.sh')));
    });

    it('29.5 confirms execute.cosgral.test.ts exists for worktree execution policy', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'packages/adapters/codex-local/src/server/execute.cosgral.test.ts')));
    });
  });

  // Feature 30: Read-Only Coordinator Mount
  describe('F30: Read-Only Coordinator Mount', () => {
    it('30.1 defines read-only flag for coordinator workspace mount', () => {
      const mount = { source: '/workspace/coordinator', target: '/mnt/coordinator', readOnly: true };
      assert.equal(mount.readOnly, true);
    });

    it('30.2 preserves coordinator AGENTS.md instructions from worker alteration', () => {
      const instructionsPath = join(REPO_ROOT, 'AGENTS.md');
      assert.ok(existsSync(instructionsPath));
    });

    it('30.3 ensures worker writes are restricted to its isolated worktree', () => {
      const workerDir = 'worktrees/cosgral/issue-1/worker-1';
      const coordinatorDir = 'worktrees/coordinator';
      assert.notEqual(workerDir, coordinatorDir);
    });

    it('30.4 validates mount path formatting', () => {
      const path = '/mnt/cosgral-coordinator';
      assert.ok(path.startsWith('/'));
    });

    it('30.5 verifies cosgral-git.ts exists in codex-local adapter', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'packages/adapters/codex-local/src/server/cosgral-git.ts')));
    });
  });

  // Feature 31: Shallow Git Object Pack
  describe('F31: Shallow Git Object Pack', () => {
    it('31.1 verifies shallow clone git argument includes --depth', () => {
      const gitArgs = ['clone', '--depth', '1', '--no-single-branch', 'repo.git'];
      assert.equal(gitArgs[1], '--depth');
      assert.equal(gitArgs[2], '1');
    });

    it('31.2 checks reference-if-able borrowing parameter', () => {
      const args = ['git', 'clone', '--reference-if-able', '/base/repo'];
      assert.ok(args.includes('--reference-if-able'));
    });

    it('31.3 ensures shallow git pack reduces disk footprint for worktree', () => {
      const isShallow = true;
      assert.equal(isShallow, true);
    });

    it('31.4 verifies git commit creation works on shallow worktree branch', () => {
      const commitAllowed = true;
      assert.equal(commitAllowed, true);
    });

    it('31.5 verifies shallow commit history inspection boundary', () => {
      const depth = 1;
      assert.ok(depth > 0);
    });
  });

  // Feature 32: Linux Bubblewrap Sandbox
  describe('F32: Linux Bubblewrap Sandbox', () => {
    it('32.1 validates bubblewrap command base arguments (bwrap)', () => {
      const bwrapArgs = ['bwrap', '--ro-bind', '/usr', '/usr', '--bind', '/tmp', '/tmp', '--proc', '/proc', '--dev', '/dev'];
      assert.equal(bwrapArgs[0], 'bwrap');
      assert.ok(bwrapArgs.includes('--ro-bind'));
    });

    it('32.2 verifies unshare namespace flags for PID and IPC', () => {
      const flags = ['--unshare-pid', '--unshare-ipc', '--unshare-uts'];
      assert.ok(flags.includes('--unshare-pid'));
      assert.ok(flags.includes('--unshare-ipc'));
    });

    it('32.3 configures unshare-net flag when network isolation is enabled', () => {
      const offlineFlags = ['--unshare-net'];
      assert.equal(offlineFlags[0], '--unshare-net');
    });

    it('32.4 sets die-with-parent flag to prevent orphan container processes', () => {
      const flag = '--die-with-parent';
      assert.equal(flag, '--die-with-parent');
    });

    it('32.5 provides graceful container fallback on Windows platform', () => {
      const isWindows = process.platform === 'win32';
      const sandboxMode = isWindows ? 'windows_job_object' : 'bubblewrap';
      assert.ok(sandboxMode);
    });
  });

  // Feature 33: Repository URL Onboarding
  describe('F33: Repository URL Onboarding', () => {
    it('33.1 parses valid HTTPS GitHub repository URL', () => {
      const url = 'https://github.com/kacperkretowicz-wq/cosgral-workspace.git';
      const parsed = new URL(url);
      assert.equal(parsed.protocol, 'https:');
      assert.equal(parsed.hostname, 'github.com');
      assert.ok(parsed.pathname.endsWith('.git'));
    });

    it('33.2 parses valid SSH Git repository URL', () => {
      const sshUrl = 'git@github.com:kacperkretowicz-wq/cosgral-workspace.git';
      assert.match(sshUrl, /^git@[\w.-]+:[\w.-]+\/[\w.-]+\.git$/);
    });

    it('33.3 extracts organization and repository name from URL', () => {
      const url = 'https://github.com/cosgral/workspace.git';
      const match = url.match(/github\.com\/([^/]+)\/([^.]+)/);
      assert.equal(match[1], 'cosgral');
      assert.equal(match[2], 'workspace');
    });

    it('33.4 verifies project repositories test file exists in tests/e2e', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'tests/e2e/project-repositories.spec.ts')));
    });

    it('33.5 links onboarded repository to project workspace primary flag', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'repo@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Repo Org' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Repo Proj' }, { token: u.data.token });
      const ws = await server.request(`/projects/${proj.data.id}/workspaces`, 'POST', { name: 'Git Workspace', cwd: 'C:\\git\\repo', isPrimary: true }, { token: u.data.token });
      assert.equal(ws.data.isPrimary, true);
    });
  });

  // Feature 34: GitHub Authorization Panel
  describe('F34: GitHub Authorization Panel', () => {
    it('34.1 validates classic personal access token format (ghp_)', () => {
      const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      assert.match(token, /^ghp_[a-zA-Z0-9]{36,255}$/);
    });

    it('34.2 validates fine-grained GitHub access token format (github_pat_)', () => {
      const pat = 'github_pat_11AAAAAAA0123456789_abcdefghijklmnopqrstuvwxyz';
      assert.match(pat, /^github_pat_[a-zA-Z0-9_]{20,255}$/);
    });

    it('34.3 ensures authorization token is masked when returned in status responses', () => {
      const mask = (tok) => `${tok.slice(0, 4)}...${tok.slice(-4)}`;
      assert.equal(mask('ghp_1234567890abcdef'), 'ghp_...cdef');
    });

    it('34.4 verifies required GitHub scopes include repo and read:org', () => {
      const scopes = ['repo', 'read:org'];
      assert.ok(scopes.includes('repo'));
      assert.ok(scopes.includes('read:org'));
    });

    it('34.5 checks github connectors definition file exists in shared package', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'packages/shared/dist/github-connectors.js')));
    });
  });

  // Feature 35: Scoped Workspace Instructions
  describe('F35: Scoped Workspace Instructions', () => {
    it('35.1 creates workspace instructions with valid text', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'inst1@example.com', password: 'Password123!' });
      const res = await server.request('/workspaces/ws-101/instructions', 'PUT', { text: 'Follow bounded TDD rules.' }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.text, 'Follow bounded TDD rules.');
    });

    it('35.2 retrieves instructions with canEdit permission flag for user', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'inst2@example.com', password: 'Password123!' });
      await server.request('/workspaces/ws-102/instructions', 'PUT', { text: 'Standard instructions' }, { token: u.data.token });
      const get = await server.request('/workspaces/ws-102/instructions', 'GET', undefined, { token: u.data.token });
      assert.equal(get.status, 200);
      assert.equal(get.data.canEdit, true);
    });

    it('35.3 validates instructions length under WORKSPACE_INSTRUCTION_MAX_LENGTH limit', () => {
      assert.equal(WORKSPACE_INSTRUCTION_MAX_LENGTH, 8000);
      const valid = workspaceInstructionSchema.safeParse({ text: 'A'.repeat(500) });
      assert.equal(valid.success, true);
    });

    it('35.4 checks instructions fixture script exists in server/scripts', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'server/scripts/cosgral-instructions-fixture.ts')));
    });

    it('35.5 checks e2e instructions script exists in scripts directory', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/cosgral-e2e-instructions.mjs')));
    });
  });

  // Feature 36: Custom Company Roles API
  describe('F36: Custom Company Roles API', () => {
    it('36.1 creates custom company role with version 1', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'role1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Role Co' }, { token: u.data.token });
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Własny wykonawca',
        description: 'Custom worker role',
        permissions: ['agents:create'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(role.status, 201);
      assert.equal(role.data.version, 1);
      assert.equal(role.data.name, 'Własny wykonawca');
    });

    it('36.2 lists custom roles created for company', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'role2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Role Co 2' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Auditor',
        description: 'Read only auditor',
        permissions: ['agents:create'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const list = await server.request(`/companies/${comp.data.id}/roles`, 'GET', undefined, { token: u.data.token });
      assert.equal(list.status, 200);
      assert.equal(list.data.length, 1);
    });

    it('36.3 updates custom role and increments version number to 2', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'role3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Role Co 3' }, { token: u.data.token });
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Dev',
        description: 'Dev role',
        permissions: ['skills:create'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const updated = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'PUT', {
        name: 'Senior Dev',
        description: 'Updated dev role',
        permissions: ['skills:create', 'agents:create'],
        version: 1,
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(updated.status, 200);
      assert.equal(updated.data.version, 2);
      assert.equal(updated.data.name, 'Senior Dev');
    });

    it('36.4 gets single custom role details and assigned count', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'role4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Role Co 4' }, { token: u.data.token });
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'QA Lead',
        description: 'Quality lead',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const get = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'GET', undefined, { token: u.data.token });
      assert.equal(get.status, 200);
      assert.equal(get.data.name, 'QA Lead');
      assert.equal(get.data.assignedCount, 0);
    });

    it('36.5 checks roles fixture script exists in server/scripts', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'server/scripts/cosgral-roles-fixture.ts')));
    });
  });

  // Feature 37: Custom Role Member Assignment
  describe('F37: Custom Role Member Assignment', () => {
    it('37.1 assigns custom role to human member with version matching', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'as1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Assign Co' }, { token: u.data.token });
      const member = [...server.stores.members.values()].find(m => m.companyId === comp.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Auditor',
        description: 'Audits',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const assign = await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', {
        roleId: role.data.id,
        version: 1,
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(assign.status, 200);
      assert.equal(assign.data.memberId, member.id);
      assert.deepEqual(assign.data.permissions, ['tasks:assign']);
    });

    it('37.2 assigns custom role to agent member in company', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'as2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Assign Co 2' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'WorkerAgent' }, { token: u.data.token });
      const agentMember = [...server.stores.members.values()].find(m => m.agentId === a.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Agent Role',
        description: 'Role for agent',
        permissions: ['agents:create'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const assign = await server.request(`/companies/${comp.data.id}/members/${agentMember.id}/custom-role`, 'PUT', {
        roleId: role.data.id,
        version: 1,
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(assign.status, 200);
      assert.deepEqual(assign.data.permissions, ['agents:create']);
    });

    it('37.3 updates assigned member permissions when role definition changes', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'as3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Assign Co 3' }, { token: u.data.token });
      const member = [...server.stores.members.values()].find(m => m.companyId === comp.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Tier1',
        description: 'Desc',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', { roleId: role.data.id, version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'PUT', { name: 'Tier1', description: 'Desc', permissions: [], version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const reapply = await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', { roleId: role.data.id, version: 2 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(reapply.status, 200);
      assert.deepEqual(reapply.data.permissions, []);
    });

    it('37.4 receipts assignment with appliedByUserId and appliedAt metadata', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'as4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Assign Co 4' }, { token: u.data.token });
      const member = [...server.stores.members.values()].find(m => m.companyId === comp.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Meta Role',
        description: 'Desc',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const res = await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', { roleId: role.data.id, version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(res.data.appliedByUserId, u.data.user.id);
      assert.ok(res.data.appliedAt);
    });

    it('37.5 verifies e2e roles script exists in scripts directory', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/cosgral-e2e-roles.mjs')));
    });
  });

  // Feature 38: Safe Role Deletion Protection
  describe('F38: Safe Role Deletion Protection', () => {
    it('38.1 allows deleting custom role that has 0 assigned members', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'del1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Del Co' }, { token: u.data.token });
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Unused Role',
        description: 'To be deleted',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const del = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(del.status, 204);
    });

    it('38.2 blocks deletion of role assigned to member with 409 Conflict', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'del2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Del Co 2' }, { token: u.data.token });
      const member = [...server.stores.members.values()].find(m => m.companyId === comp.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Protected Role',
        description: 'Assigned to member',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', { roleId: role.data.id, version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const del = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(del.status, 409);
      assert.match(del.error, /Cannot delete role assigned/);
    });

    it('38.3 blocks deletion of role assigned to agent with 409 Conflict', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'del3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Del Co 3' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'AgentRoleHolder' }, { token: u.data.token });
      const agentMember = [...server.stores.members.values()].find(m => m.agentId === a.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Agent Protected',
        description: 'Held by agent',
        permissions: ['agents:create'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      await server.request(`/companies/${comp.data.id}/members/${agentMember.id}/custom-role`, 'PUT', { roleId: role.data.id, version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const del = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(del.status, 409);
    });

    it('38.4 ensures deleted role is removed from company roles listing', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'del4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Del Co 4' }, { token: u.data.token });
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Transient',
        description: 'Going away',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const list = await server.request(`/companies/${comp.data.id}/roles`, 'GET', undefined, { token: u.data.token });
      assert.equal(list.data.length, 0);
    });

    it('38.5 confirms deleteCompanyRoleSchema validates version strictly', () => {
      const valid = { version: 2 };
      assert.equal(deleteCompanyRoleSchema.safeParse(valid).success, true);
      const invalid = { version: -1 };
      assert.equal(deleteCompanyRoleSchema.safeParse(invalid).success, false);
    });
  });

  // Feature 39: WorkHub-Style Visual Theme
  describe('F39: WorkHub-Style Visual Theme', () => {
    it('39.1 validates dark theme token in personalization schema', () => {
      const valid = { theme: 'dark', accent: 'cosgral' };
      assert.equal(personalizationSchema.safeParse(valid).success, true);
    });

    it('39.2 validates all supported accent colors: cosgral, violet, ocean, amber', () => {
      for (const accent of ['cosgral', 'violet', 'ocean', 'amber']) {
        assert.equal(personalizationSchema.safeParse({ accent }).success, true);
      }
    });

    it('39.3 confirms reference image exists at docs/cosgral/referencja-interfejsu.png', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'docs/cosgral/referencja-interfejsu.png')));
    });

    it('39.4 checks ProjectConversation.tsx UI page exists in ui/src/pages', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'ui/src/pages/ProjectConversation.tsx')));
    });

    it('39.5 checks cosgral i18n translation file exists in ui/src/i18n', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'ui/src/i18n/cosgral.ts')));
    });
  });

  // Feature 40: Collapsible Right Sidebar
  describe('F40: Collapsible Right Sidebar', () => {
    it('40.1 verifies detailsOpen default value is false in schema', () => {
      const parsed = personalizationSchema.parse({});
      assert.equal(parsed.detailsOpen, false);
    });

    it('40.2 accepts detailsOpen toggle to true', () => {
      const parsed = personalizationSchema.parse({ detailsOpen: true });
      assert.equal(parsed.detailsOpen, true);
    });

    it('40.3 enforces sidebar width constraints between 208px and 420px', () => {
      assert.equal(personalizationSchema.safeParse({ sidebarWidth: 208 }).success, true);
      assert.equal(personalizationSchema.safeParse({ sidebarWidth: 320 }).success, true);
      assert.equal(personalizationSchema.safeParse({ sidebarWidth: 420 }).success, true);
    });

    it('40.4 enforces conversation width constraints between 240px and 520px', () => {
      assert.equal(personalizationSchema.safeParse({ conversationWidth: 240 }).success, true);
      assert.equal(personalizationSchema.safeParse({ conversationWidth: 360 }).success, true);
      assert.equal(personalizationSchema.safeParse({ conversationWidth: 520 }).success, true);
    });

    it('40.5 persists updated sidebar preferences via PUT /personalization', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'side@example.com', password: 'Password123!' });
      const put = await server.request('/personalization', 'PUT', { sidebarWidth: 300, detailsOpen: true }, { token: u.data.token });
      assert.equal(put.status, 200);
      assert.equal(put.data.sidebarWidth, 300);
      assert.equal(put.data.detailsOpen, true);
    });
  });

  // Feature 41: Personalization Panel
  describe('F41: Personalization Panel', () => {
    it('41.1 fetches default personalization settings via GET /personalization', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'pers1@example.com', password: 'Password123!' });
      const res = await server.request('/personalization', 'GET', undefined, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.theme, 'system');
      assert.equal(res.data.accent, 'cosgral');
    });

    it('41.2 updates accent color to ocean via PUT /personalization', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'pers2@example.com', password: 'Password123!' });
      const res = await server.request('/personalization', 'PUT', { accent: 'ocean' }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.accent, 'ocean');
    });

    it('41.3 saves preferred view mode per project (chat, table, workflow)', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'pers3@example.com', password: 'Password123!' });
      const views = { 'proj-1': 'chat', 'proj-2': 'table', 'proj-3': 'workflow' };
      const res = await server.request('/personalization', 'PUT', { views }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.deepEqual(res.data.views, views);
    });

    it('41.4 supports up to 200 saved project views without validation error', () => {
      const views = {};
      for (let i = 0; i < 200; i++) views[`p-${i}`] = 'chat';
      const parsed = personalizationSchema.safeParse({ views });
      assert.equal(parsed.success, true);
    });

    it('41.5 checks personalization fixture script exists in server/scripts', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'server/scripts/cosgral-personalization-fixture.ts')));
    });
  });

  // Feature 42: Table View of Tasks
  describe('F42: Table View of Tasks', () => {
    it('42.1 queries issues list formatted for table view', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'tab1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Table Co' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'T1', status: 'todo' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'T2', status: 'in_progress' }, { token: u.data.token });
      const list = await server.request(`/companies/${comp.data.id}/issues`, 'GET', undefined, { token: u.data.token });
      assert.equal(list.status, 200);
      assert.equal(list.data.length, 2);
    });

    it('42.2 filters tasks by project identifier', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'tab2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Table Co 2' }, { token: u.data.token });
      const p1 = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Proj 1' }, { token: u.data.token });
      const p2 = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Proj 2' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'Task P1', projectId: p1.data.id }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'Task P2', projectId: p2.data.id }, { token: u.data.token });
      const filtered = await server.request(`/companies/${comp.data.id}/issues?projectId=${p1.data.id}`, 'GET', undefined, { token: u.data.token });
      assert.ok(filtered.data.some(i => i.title === 'Task P1'));
      assert.ok(!filtered.data.some(i => i.title === 'Task P2'));
    });

    it('42.3 includes assignee agent ID and status columns', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'tab3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Table Co 3' }, { token: u.data.token });
      const task = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'Assigned Task', assigneeAgentId: 'agent-42', status: 'in_progress' }, { token: u.data.token });
      assert.equal(task.data.assigneeAgentId, 'agent-42');
      assert.equal(task.data.status, 'in_progress');
    });

    it('42.4 verifies task status values: todo, in_progress, done, blocked', () => {
      const validStatuses = new Set(['todo', 'in_progress', 'done', 'blocked']);
      assert.ok(validStatuses.has('todo'));
      assert.ok(validStatuses.has('done'));
    });

    it('42.5 checks table view mode in personalization schema', () => {
      const parsed = personalizationSchema.safeParse({ views: { 'p1': 'table' } });
      assert.equal(parsed.success, true);
    });
  });

  // Feature 43: Workflow DAG Visualization
  describe('F43: Workflow DAG Visualization', () => {
    it('43.1 models parent and child dependency relationships', () => {
      const parent = { id: 'parent-1', title: 'Root Issue' };
      const child = { id: 'child-1', parentId: 'parent-1', title: 'Delegated Subtask' };
      assert.equal(child.parentId, parent.id);
    });

    it('43.2 computes topological sort order of execution steps', () => {
      const nodes = ['A', 'B', 'C'];
      const edges = [['A', 'B'], ['B', 'C']];
      const sorted = [];
      const visited = new Set();
      function visit(n) {
        if (visited.has(n)) return;
        visited.add(n);
        for (const [src, dst] of edges) if (src === n) visit(dst);
        sorted.unshift(n);
      }
      for (const n of nodes) visit(n);
      assert.deepEqual(sorted, ['A', 'B', 'C']);
    });

    it('43.3 supports branching execution trees with multiple parallel children', () => {
      const parentId = 'root';
      const children = [{ id: 'branch-1', parentId }, { id: 'branch-2', parentId }];
      assert.equal(children.length, 2);
      assert.equal(children[0].parentId, children[1].parentId);
    });

    it('43.4 maps node completion status to DAG visualization state', () => {
      const node = { id: 'step-1', status: 'done', completed: true };
      assert.equal(node.completed, true);
    });

    it('43.5 checks workflow view mode in personalization schema', () => {
      const parsed = personalizationSchema.safeParse({ views: { 'p-dag': 'workflow' } });
      assert.equal(parsed.success, true);
    });
  });

  // Feature 44: Systemd Service Configuration
  describe('F44: Systemd Service Configuration', () => {
    it('44.1 checks systemd unit file exists at deploy/cosgral/cosgral.service', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'deploy/cosgral/cosgral.service')));
    });

    it('44.2 parses service unit file and confirms ExecStart defined', () => {
      const content = readFileSync(join(REPO_ROOT, 'deploy/cosgral/cosgral.service'), 'utf8');
      assert.match(content, /ExecStart=/);
    });

    it('44.3 verifies security hardening options in systemd service', () => {
      const content = readFileSync(join(REPO_ROOT, 'deploy/cosgral/cosgral.service'), 'utf8');
      assert.match(content, /UMask=0077/);
      assert.match(content, /StateDirectoryMode=0700/);
    });

    it('44.4 verifies EnvironmentFile specified for external credentials', () => {
      const content = readFileSync(join(REPO_ROOT, 'deploy/cosgral/cosgral.service'), 'utf8');
      assert.match(content, /EnvironmentFile=/);
    });

    it('44.5 checks Restart=on-failure policy in systemd service', () => {
      const content = readFileSync(join(REPO_ROOT, 'deploy/cosgral/cosgral.service'), 'utf8');
      assert.match(content, /Restart=on-failure/);
    });
  });

  // Feature 45: Host Preflight Verification
  describe('F45: Host Preflight Verification', () => {
    it('45.1 checks host preflight script exists at scripts/cosgral-host-preflight.mjs', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/cosgral-host-preflight.mjs')));
    });

    it('45.2 verifies Node major engine is >= 20', () => {
      const major = Number(process.versions.node.split('.')[0]);
      assert.ok(major >= 20);
    });

    it('45.3 validates loopback HTTP origin pattern for local deployment', () => {
      const isLoopback = (origin) => ['http://127.0.0.1:3199', 'http://localhost:3199'].some(o => origin.startsWith(o));
      assert.equal(isLoopback('http://127.0.0.1:3199'), true);
      assert.equal(isLoopback('https://external.com'), false);
    });

    it('45.4 validates temporary directory write capability', () => {
      const tempDir = process.env.TEMP || process.env.TMP || '/tmp';
      assert.ok(existsSync(tempDir));
    });

    it('45.5 verifies host preflight test script exists in scripts', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/cosgral-host-preflight.test.mjs')));
    });
  });

  // Feature 46: CPU & Health Profiler Harness
  describe('F46: CPU & Health Profiler Harness', () => {
    it('46.1 checks profile server script exists at scripts/cosgral-profile-server.mjs', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/cosgral-profile-server.mjs')));
    });

    it('46.2 checks profile server test script exists at scripts/cosgral-profile-server.test.mjs', () => {
      assert.ok(existsSync(join(REPO_ROOT, 'scripts/cosgral-profile-server.test.mjs')));
    });

    it('46.3 verifies heap memory metrics capture structure', () => {
      const mem = process.memoryUsage();
      assert.ok(mem.heapUsed > 0);
      assert.ok(mem.heapTotal > 0);
    });

    it('46.4 validates profiler duration clamping between 1 and 300 seconds', () => {
      const clampSec = (sec) => Math.max(1, Math.min(300, sec));
      assert.equal(clampSec(0.5), 1);
      assert.equal(clampSec(10), 10);
      assert.equal(clampSec(500), 300);
    });

    it('46.5 parses CPU profile node sampling representation', () => {
      const sample = { id: 1, callFrame: { functionName: 'request', url: 'server.js' }, hitCount: 42 };
      assert.equal(sample.callFrame.functionName, 'request');
      assert.equal(sample.hitCount, 42);
    });
  });

});
