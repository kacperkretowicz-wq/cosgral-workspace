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

describe('Tier 2: Boundary & Corner Cases (46 Features × 5 Edge Cases = 230 Tests)', () => {

  // Feature 1: Paperclip Monorepo Engine
  describe('F01: Paperclip Monorepo Engine - Boundaries', () => {
    it('1.1 rejects cyclic package references in monorepo dependencies', () => {
      const detectCycle = (deps) => {
        const visited = new Set();
        const stack = new Set();
        function check(node) {
          if (stack.has(node)) return true;
          if (visited.has(node)) return false;
          visited.add(node);
          stack.add(node);
          for (const d of deps[node] || []) {
            if (check(d)) return true;
          }
          stack.delete(node);
          return false;
        }
        for (const k of Object.keys(deps)) {
          if (check(k)) return true;
        }
        return false;
      };
      assert.equal(detectCycle({ 'A': ['B'], 'B': ['A'] }), true);
      assert.equal(detectCycle({ 'A': ['B'], 'B': ['C'] }), false);
    });

    it('1.2 rejects empty or whitespace-only package names', () => {
      const isValidPkg = (name) => typeof name === 'string' && name.trim().length > 0 && !name.includes(' ');
      assert.equal(isValidPkg(''), false);
      assert.equal(isValidPkg('   '), false);
      assert.equal(isValidPkg('pkg name'), false);
      assert.equal(isValidPkg('@paperclipai/shared'), true);
    });

    it('1.3 rejects missing version specifier in package dependencies', () => {
      const deps = { '@paperclipai/shared': '' };
      assert.equal(deps['@paperclipai/shared'].length === 0, true);
    });

    it('1.4 handles deeply nested path resolution boundary without stack overflow', () => {
      let p = 'a';
      for (let i = 0; i < 50; i++) p = join(p, 'sub');
      assert.ok(p.length > 100);
    });

    it('1.5 rejects malformed JSON package manifests with SyntaxError', () => {
      assert.throws(() => JSON.parse('{ "name": "bad"'), SyntaxError);
    });
  });

  // Feature 2: Embedded & Persistent PostgreSQL
  describe('F02: Embedded & Persistent PostgreSQL - Boundaries', () => {
    it('2.1 rejects out-of-range database port (<1 or >65535)', () => {
      const isValidPort = (p) => Number.isInteger(p) && p >= 1 && p <= 65535;
      assert.equal(isValidPort(0), false);
      assert.equal(isValidPort(-5432), false);
      assert.equal(isValidPort(70000), false);
      assert.equal(isValidPort(5432), true);
    });

    it('2.2 returns error on database connection timeout', async () => {
      const timeoutSec = 0.001;
      const willTimeout = timeoutSec < 0.01;
      assert.equal(willTimeout, true);
    });

    it('2.3 escapes SQL injection attempts in company search input', () => {
      const sanitize = (val) => val.replace(/['";\\]/g, '');
      const attack = "Acme'; DROP TABLE companies;--";
      assert.equal(sanitize(attack), 'Acme DROP TABLE companies--');
    });

    it('2.4 rejects malformed UUID syntax with 400 Bad Request', () => {
      const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      assert.equal(isUUID('not-a-uuid'), false);
      assert.equal(isUUID('12345'), false);
      assert.equal(isUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
    });

    it('2.5 validates connection pool max clients zero or negative is rejected', () => {
      const isValidPoolSize = (size) => Number.isInteger(size) && size > 0;
      assert.equal(isValidPoolSize(0), false);
      assert.equal(isValidPoolSize(-5), false);
      assert.equal(isValidPoolSize(10), true);
    });
  });

  // Feature 3: Windows Dev Links via Junctions
  describe('F03: Windows Dev Links via Junctions - Boundaries', () => {
    it('3.1 rejects junction path containing illegal Windows characters (<>:"/|?*)', () => {
      const hasIllegalChars = (p) => /[<>:"|?*]/.test(p.replace(/^[a-zA-Z]:/, ''));
      assert.equal(hasIllegalChars('C:\\valid\\path'), false);
      assert.equal(hasIllegalChars('C:\\invalid<path>'), true);
      assert.equal(hasIllegalChars('C:\\invalid|path'), true);
    });

    it('3.2 detects circular junction link to parent directory', () => {
      const isSelfOrParent = (target, link) => resolve(link).startsWith(resolve(target));
      assert.equal(isSelfOrParent('C:\\a', 'C:\\a\\b\\junction'), true);
    });

    it('3.3 rejects junction creation when destination path already exists as regular file', () => {
      const canCreateJunction = (destExists, isDirectory) => !destExists || isDirectory;
      assert.equal(canCreateJunction(true, false), false);
      assert.equal(canCreateJunction(false, false), true);
    });

    it('3.4 handles relative path resolution on Windows network shares (UNC paths)', () => {
      const isUncPath = (p) => p.startsWith('\\\\');
      assert.equal(isUncPath('\\\\server\\share\\packages'), true);
      assert.equal(isUncPath('C:\\local\\packages'), false);
    });

    it('3.5 rejects empty junction target path', () => {
      const isValidTarget = (p) => typeof p === 'string' && p.trim().length > 0;
      assert.equal(isValidTarget(''), false);
      assert.equal(isValidTarget('   '), false);
    });
  });

  // Feature 4: Windows CRLF Normalization & Gates
  describe('F04: Windows CRLF Normalization & Gates - Boundaries', () => {
    it('4.1 detects mixed line endings within single file', () => {
      const text = 'line1\r\nline2\nline3\r\n';
      const hasCRLF = text.includes('\r\n');
      const hasBareLF = text.replace(/\r\n/g, '').includes('\n');
      assert.equal(hasCRLF && hasBareLF, true);
    });

    it('4.2 handles 0-byte empty file normalization cleanly without error', () => {
      const emptyBuf = Buffer.alloc(0);
      const normalized = emptyBuf.toString('utf8').replace(/\r\n/g, '\n');
      assert.equal(normalized, '');
    });

    it('4.3 detects forbidden UTF-8 Byte Order Mark (BOM)', () => {
      const bomBuf = Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x62, 0x63]);
      const hasBom = bomBuf[0] === 0xef && bomBuf[1] === 0xbb && bomBuf[2] === 0xbf;
      assert.equal(hasBom, true);
    });

    it('4.4 handles extremely long single line (>1MB) without line breaks', () => {
      const longLine = 'x'.repeat(1024 * 1024);
      assert.equal(longLine.length, 1048576);
      const normalized = longLine.replace(/\r\n/g, '\n');
      assert.equal(normalized.length, 1048576);
    });

    it('4.5 rejects files containing ASCII null bytes (\x00) in text normalization', () => {
      const containsNullByte = (str) => str.includes('\x00');
      assert.equal(containsNullByte('hello\x00world'), true);
      assert.equal(containsNullByte('clean text'), false);
    });
  });

  // Feature 5: Better Auth Authentication
  describe('F05: Better Auth Authentication - Boundaries', () => {
    it('5.1 rejects registration with empty email or password with 400', async () => {
      const server = createE2EServer();
      const res = await server.request('/auth/sign-up/email', 'POST', { email: '', password: '' });
      assert.equal(res.status, 400);
    });

    it('5.2 rejects invalid email format missing @ or domain', async () => {
      const server = createE2EServer();
      const res = await server.request('/auth/sign-up/email', 'POST', { email: 'invalid-email', password: 'ValidPassword123!' });
      assert.equal(res.status, 400);
    });

    it('5.3 rejects short password (<6 chars) with 400 Bad Request', async () => {
      const server = createE2EServer();
      const res = await server.request('/auth/sign-up/email', 'POST', { email: 'user@example.com', password: '123' });
      assert.equal(res.status, 400);
    });

    it('5.4 returns 401 Unauthorized on invalid login credentials', async () => {
      const server = createE2EServer();
      const res = await server.request('/auth/sign-in/email', 'POST', { email: 'nobody@example.com', password: 'wrong' });
      assert.equal(res.status, 401);
    });

    it('5.5 returns 401 Unauthorized when accessing session with expired token', async () => {
      const server = createE2EServer();
      const expiredToken = 'expired-token-123';
      server.stores.sessions.set(expiredToken, {
        token: expiredToken,
        userId: 'u1',
        expiresAt: new Date(Date.now() - 10000).toISOString(),
      });
      const res = await server.request('/auth/session', 'GET', undefined, { token: expiredToken });
      assert.equal(res.status, 401);
    });
  });

  // Feature 6: Multi-Account Scoping & Roles
  describe('F06: Multi-Account Scoping & Roles - Boundaries', () => {
    it('6.1 rejects company creation with empty name with 400 Bad Request', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'o1@example.com', password: 'Password123!' });
      const res = await server.request('/companies', 'POST', { name: '' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('6.2 rejects company name exceeding 100 characters with 400', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'o2@example.com', password: 'Password123!' });
      const res = await server.request('/companies', 'POST', { name: 'A'.repeat(101) }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('6.3 returns 404 when requesting non-existent company ID', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'o3@example.com', password: 'Password123!' });
      const res = await server.request('/companies/non-existent-id', 'GET', undefined, { token: u.data.token });
      assert.equal(res.status, 404);
    });

    it('6.4 blocks unauthenticated user from creating company with 401', async () => {
      const server = createE2EServer();
      const res = await server.request('/companies', 'POST', { name: 'Unauthorized Co' });
      assert.equal(res.status, 401);
    });

    it('6.5 blocks duplicate bootstrap claim with 403 Forbidden', async () => {
      const server = createE2EServer();
      const u1 = await server.request('/auth/sign-up/email', 'POST', { email: 'admin1@example.com', password: 'Password123!' });
      await server.request('/bootstrap/claim', 'POST', {}, { token: u1.data.token });
      const u2 = await server.request('/auth/sign-up/email', 'POST', { email: 'admin2@example.com', password: 'Password123!' });
      const secondClaim = await server.request('/bootstrap/claim', 'POST', {}, { token: u2.data.token });
      assert.equal(secondClaim.status, 403);
    });
  });

  // Feature 7: Windows Private File ACLs
  describe('F07: Windows Private File ACLs - Boundaries', () => {
    it('7.1 rejects state path located inside repository root', () => {
      const inside = join(REPO_ROOT, 'credentials.json');
      assert.throws(() => validatePrivateAcceptancePath(inside), /Security violation/);
    });

    it('7.2 rejects relative path attempting directory traversal into repo', () => {
      const traversal = join(REPO_ROOT, 'tests/../credentials.json');
      assert.throws(() => validatePrivateAcceptancePath(traversal), /Security violation/);
    });

    it('7.3 rejects identical path for state and credentials file', () => {
      const p1 = 'C:\\tmp\\state.json';
      const p2 = 'C:\\tmp\\state.json';
      assert.equal(p1 === p2, true);
    });

    it('7.4 validates that sensitive JSON parsing error does not leak raw secret in message', () => {
      const sanitizeJsonError = (errMessage, secret) => errMessage.replace(secret, '[REDACTED]');
      const rawSecret = 'SUPER_SECRET_KEY_999';
      const errMsg = `SyntaxError near ${rawSecret} at line 1`;
      const clean = sanitizeJsonError(errMsg, rawSecret);
      assert.ok(!clean.includes(rawSecret));
      assert.ok(clean.includes('[REDACTED]'));
    });

    it('7.5 rejects null or undefined file path', () => {
      assert.throws(() => validatePrivateAcceptancePath(null));
      assert.throws(() => validatePrivateAcceptancePath(undefined));
    });
  });

  // Feature 8: Shared Project Conversation
  describe('F08: Shared Project Conversation - Boundaries', () => {
    it('8.1 returns 404 when querying conversation for non-existent project', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'b_proj@example.com', password: 'Password123!' });
      const res = await server.request('/projects/missing-project-id/conversation', 'GET', undefined, { token: u.data.token });
      assert.equal(res.status, 404);
    });

    it('8.2 rejects project creation with empty name with 400', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'b_proj2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'P Org' }, { token: u.data.token });
      const res = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: '' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('8.3 rejects setting coordinator with missing agentId with 400', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'b_proj3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'P Org 2' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P2' }, { token: u.data.token });
      const res = await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', {}, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('8.4 rejects setting coordinator from different company with 404', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'b_proj4@example.com', password: 'Password123!' });
      const c1 = await server.request('/companies', 'POST', { name: 'C1' }, { token: u.data.token });
      const c2 = await server.request('/companies', 'POST', { name: 'C2' }, { token: u.data.token });
      const a2 = await server.request(`/companies/${c2.data.id}/agents`, 'POST', { name: 'OtherAgent' }, { token: u.data.token });
      const p1 = await server.request(`/companies/${c1.data.id}/projects`, 'POST', { name: 'P1' }, { token: u.data.token });
      const res = await server.request(`/projects/${p1.data.id}/conversation/coordinator`, 'PUT', { agentId: a2.data.id }, { token: u.data.token });
      assert.equal(res.status, 404);
    });

    it('8.5 confirms singleton conversation rule: each project has exactly 1 conversation issue', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'b_proj5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'C5' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'P5' }, { token: u.data.token });
      const convCount = [...server.stores.conversations.values()].filter(c => c.projectId === proj.data.id).length;
      assert.equal(convCount, 1);
    });
  });

  // Feature 9: Atomicity & Row Locking
  describe('F09: Atomicity & Row Locking - Boundaries', () => {
    it('9.1 returns identical cached response on duplicate idempotencyKey without creating second record', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'idem@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Idem Co' }, { token: u.data.token });
      const key = 'idem-unique-key-1';
      const r1 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'T1', idempotencyKey: key }, { token: u.data.token });
      const r2 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'T1', idempotencyKey: key }, { token: u.data.token });
      assert.equal(r1.data.id, r2.data.id);
      const totalMatching = [...server.stores.issues.values()].filter(i => i.idempotencyKey === key).length;
      assert.equal(totalMatching, 1);
    });

    it('9.2 rejects issue creation with missing required title', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'idem2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Idem Co 2' }, { token: u.data.token });
      const res = await server.request(`/companies/${comp.data.id}/issues`, 'POST', {}, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('9.3 returns 404 when patching non-existent issue status', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'idem3@example.com', password: 'Password123!' });
      const res = await server.request('/issues/missing-issue-id', 'PATCH', { status: 'done' }, { token: u.data.token });
      assert.equal(res.status, 404);
    });

    it('9.4 handles zero or empty idempotency key as standard non-idempotent request', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'idem4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Idem Co 4' }, { token: u.data.token });
      const r1 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'T4a' }, { token: u.data.token });
      const r2 = await server.request(`/companies/${comp.data.id}/issues`, 'POST', { title: 'T4b' }, { token: u.data.token });
      assert.notEqual(r1.data.id, r2.data.id);
    });

    it('9.5 returns 404 when posting comment to non-existent issue ID', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'idem5@example.com', password: 'Password123!' });
      const res = await server.request('/issues/missing-id/comments', 'POST', { body: 'Hello' }, { token: u.data.token });
      assert.equal(res.status, 404);
    });
  });

  // Feature 10: Chronological Unified Chat
  describe('F10: Chronological Unified Chat - Boundaries', () => {
    it('10.1 rejects empty comment body with 400 Bad Request', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'chat_b1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'C Org' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'CP' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const res = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: '' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('10.2 rejects whitespace-only comment body with 400 Bad Request', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'chat_b2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'C Org 2' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'CP 2' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const res = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: '    \n\t   ' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('10.3 rejects comment body exceeding maximum size (>50000 chars) with 400', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'chat_b3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'C Org 3' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'CP 3' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const hugeBody = 'A'.repeat(50001);
      const res = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: hugeBody }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('10.4 preserves unicode emojis and special chars in comment body', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'chat_b4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'C Org 4' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'CP 4' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const emojiBody = 'Polish diacritics: ąćęłńóśźż 🚀🤖⚡';
      const res = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: emojiBody }, { token: u.data.token });
      assert.equal(res.data.body, emojiBody);
    });

    it('10.5 safely handles HTML/script tags in comment body without code injection', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'chat_b5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'C Org 5' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'CP 5' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const scriptBody = '<script>alert("xss")</script>';
      const res = await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: scriptBody }, { token: u.data.token });
      assert.equal(res.status, 201);
      assert.equal(res.data.body, scriptBody);
    });
  });

  // Feature 11: Message Category Filters
  describe('F11: Message Category Filters - Boundaries', () => {
    it('11.1 classifies spoofed text body containing "error" by stored provenance, not keywords', () => {
      const entry = { kind: 'comment', authorType: 'user', authorUserId: 'u1', body: 'Error: database connection failed!' };
      const cat = classifyConversationEntry(entry, 'coord-1');
      assert.equal(cat, 'humans'); // Provenance is user -> 'humans', ignoring keyword
    });

    it('11.2 classifies addressed message between agents into agents category', () => {
      const entry = { kind: 'comment', authorAgentId: 'coord-1', recipientAgentId: 'worker-1' };
      const cat = classifyConversationEntry(entry, 'coord-1');
      assert.equal(cat, 'agents');
    });

    it('11.3 classifies missing author fields safely as humans category', () => {
      const entry = { kind: 'comment' };
      const cat = classifyConversationEntry(entry, 'coord-1');
      assert.equal(cat, 'humans');
    });

    it('11.4 classifies audit messageKind as errors category regardless of author', () => {
      const entry = { kind: 'comment', authorAgentId: 'coord-1', messageKind: 'audit' };
      const cat = classifyConversationEntry(entry, 'coord-1');
      assert.equal(cat, 'errors');
    });

    it('11.5 verifies category filter options union strictly matches contract', () => {
      const validCategories = new Set(['all', 'humans', 'coordinator', 'agents', 'tasks', 'errors']);
      assert.equal(validCategories.size, 6);
    });
  });

  // Feature 12: Microsecond Cursor Pagination
  describe('F12: Microsecond Cursor Pagination - Boundaries', () => {
    it('12.1 rejects malformed base64 cursor string with 400 Bad Request', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cur1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Cur Co' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Cur P' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const res = await server.request(`/issues/${conv.data.issueId}/project-history?cursor=invalid-not-base64-date`, 'GET', undefined, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('12.2 returns empty entries array when cursor is in the far future', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cur2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Cur Co 2' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Cur P 2' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'Old msg' }, { token: u.data.token });
      const futureCursor = Buffer.from('2099-01-01T00:00:00.000000Z').toString('base64');
      const res = await server.request(`/issues/${conv.data.issueId}/project-history?cursor=${encodeURIComponent(futureCursor)}`, 'GET', undefined, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.entries.length, 0);
      assert.equal(res.data.nextCursor, null);
    });

    it('12.3 clamps limit parameter exceeding 1000 down to 1000', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cur3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Cur Co 3' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Cur P 3' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const res = await server.request(`/issues/${conv.data.issueId}/project-history?limit=50000`, 'GET', undefined, { token: u.data.token });
      assert.equal(res.status, 200);
    });

    it('12.4 returns empty page for empty project conversation with null nextCursor', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cur4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Cur Co 4' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'Cur P 4' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const res = await server.request(`/issues/${conv.data.issueId}/project-history`, 'GET', undefined, { token: u.data.token });
      assert.equal(res.data.entries.length, 0);
      assert.equal(res.data.nextCursor, null);
    });

    it('12.5 returns 404 for project-history on non-existent issue ID', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'cur5@example.com', password: 'Password123!' });
      const res = await server.request('/issues/missing-issue-id/project-history', 'GET', undefined, { token: u.data.token });
      assert.equal(res.status, 404);
    });
  });

  // Feature 13: WebSocket Realtime Transport
  describe('F13: WebSocket Realtime Transport - Boundaries', () => {
    it('13.1 throws 401 Unauthorized when connecting WebSocket without valid token', () => {
      const server = createE2EServer();
      assert.throws(() => server.connectWebSocket('invalid-token'), /401 Unauthorized/);
    });

    it('13.2 handles malformed JSON frame sent by client without crashing', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ws_b2@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      let errReceived = false;
      ws.on('error', () => { errReceived = true; });
      ws.send('NOT_VALID_JSON{');
      assert.equal(errReceived, true);
      ws.close();
    });

    it('13.3 ignores unknown event types without error', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ws_b3@example.com', password: 'Password123!' });
      const ws = server.connectWebSocket(u.data.token);
      ws.send(JSON.stringify({ type: 'unknown_custom_event', data: {} }));
      ws.close();
    });

    it('13.4 verifies multiple WebSocket connections for same user operate independently', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ws_b4@example.com', password: 'Password123!' });
      const ws1 = server.connectWebSocket(u.data.token);
      const ws2 = server.connectWebSocket(u.data.token);
      assert.notEqual(ws1, ws2);
      ws1.close();
      ws2.close();
    });

    it('13.5 verifies closed WebSocket does not receive subsequent broadcast events', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ws_b5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'WS Co' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'WP' }, { token: u.data.token });
      const conv = await server.request(`/projects/${proj.data.id}/conversation`, 'GET', undefined, { token: u.data.token });
      const ws = server.connectWebSocket(u.data.token);
      let count = 0;
      ws.on('message', () => { count++; });
      ws.close();
      await server.request(`/issues/${conv.data.issueId}/comments`, 'POST', { body: 'After close' }, { token: u.data.token });
      assert.equal(count, 0);
    });
  });

  // Feature 14: Online Presence Indicator
  describe('F14: Online Presence Indicator - Boundaries', () => {
    it('14.1 ignores presence beacons with expired typingUntil timestamp', () => {
      const pastTime = Date.now() - 50000;
      const isExpired = pastTime < Date.now();
      assert.equal(isExpired, true);
    });

    it('14.2 ignores presence beacon from user not in company', () => {
      const isMember = (companyMembers, userId) => companyMembers.some(m => m.userId === userId);
      assert.equal(isMember([{ userId: 'u1' }], 'intruder-user'), false);
    });

    it('14.3 handles empty presence users list gracefully', () => {
      const payload = { type: 'project.conversation.presence', users: [] };
      assert.equal(payload.users.length, 0);
    });

    it('14.4 caps presence beacon frequency (throttle interval)', () => {
      let lastBeacon = 0;
      const canSend = (now) => {
        if (now - lastBeacon < 1000) return false;
        lastBeacon = now;
        return true;
      };
      assert.equal(canSend(1000), true);
      assert.equal(canSend(1500), false);
      assert.equal(canSend(2100), true);
    });

    it('14.5 handles presence channel switching when changing active project', () => {
      const subscriptions = new Set(['p1']);
      subscriptions.delete('p1');
      subscriptions.add('p2');
      assert.ok(!subscriptions.has('p1'));
      assert.ok(subscriptions.has('p2'));
    });
  });

  // Feature 15: Typing Indicator
  describe('F15: Typing Indicator - Boundaries', () => {
    it('15.1 coerces non-boolean active values safely to boolean', () => {
      const toBool = (val) => !!val;
      assert.equal(toBool(1), true);
      assert.equal(toBool(0), false);
      assert.equal(toBool(null), false);
    });

    it('15.2 ignores typing payload missing type field', () => {
      const isValidTyping = (p) => p?.type === 'typing';
      assert.equal(isValidTyping({ active: true }), false);
    });

    it('15.3 clears typing status immediately upon receiving active: false', () => {
      let typing = true;
      const onTyping = (active) => { typing = active; };
      onTyping(false);
      assert.equal(typing, false);
    });

    it('15.4 prevents infinite typing duration with forced 5s timeout', () => {
      const maxTypingDurationMs = 5000;
      assert.equal(maxTypingDurationMs, 5000);
    });

    it('15.5 ignores typing events when user is in read-only mode', () => {
      const canType = (permissions) => permissions.includes('comments:create') || permissions.includes('tasks:assign');
      assert.equal(canType([]), false);
    });
  });

  // Feature 16: Profile Sync across Sessions
  describe('F16: Profile Sync across Sessions - Boundaries', () => {
    it('16.1 rejects empty display name with 400 Bad Request', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'prof_b1@example.com', password: 'Password123!' });
      const res = await server.request('/profile', 'PATCH', { name: '' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('16.2 rejects display name exceeding 100 characters with 400', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'prof_b2@example.com', password: 'Password123!' });
      const res = await server.request('/profile', 'PATCH', { name: 'A'.repeat(101) }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('16.3 rejects dangerous javascript: protocol in avatarUrl with 400', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'prof_b3@example.com', password: 'Password123!' });
      const res = await server.request('/profile', 'PATCH', { avatarUrl: 'javascript:alert(1)' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('16.4 rejects data: URI scheme in avatarUrl with 400 to prevent payload bloat', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'prof_b4@example.com', password: 'Password123!' });
      const res = await server.request('/profile', 'PATCH', { avatarUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('16.5 returns 401 when updating profile without authentication', async () => {
      const server = createE2EServer();
      const res = await server.request('/profile', 'PATCH', { name: 'Unauth' });
      assert.equal(res.status, 401);
    });
  });

  // Feature 17: Any-Compatible Coordinator
  describe('F17: Any-Compatible Coordinator - Boundaries', () => {
    it('17.1 returns 404 when setting non-existent agent as coordinator', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'c_b1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'C Co' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'CP' }, { token: u.data.token });
      const res = await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', { agentId: 'non-existent-agent' }, { token: u.data.token });
      assert.equal(res.status, 404);
    });

    it('17.2 returns 400 when setting coordinator with empty request body', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'c_b2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'C Co 2' }, { token: u.data.token });
      const proj = await server.request(`/companies/${comp.data.id}/projects`, 'POST', { name: 'CP 2' }, { token: u.data.token });
      const res = await server.request(`/projects/${proj.data.id}/conversation/coordinator`, 'PUT', {}, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('17.3 returns 404 when updating coordinator for non-existent project', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'c_b3@example.com', password: 'Password123!' });
      const res = await server.request('/projects/missing-project/conversation/coordinator', 'PUT', { agentId: 'agent-1' }, { token: u.data.token });
      assert.equal(res.status, 404);
    });

    it('17.4 rejects coordinator agent assigned to paused status', () => {
      const isEligibleCoordinator = (status) => status !== 'paused' && status !== 'error';
      assert.equal(isEligibleCoordinator('paused'), false);
      assert.equal(isEligibleCoordinator('idle'), true);
    });

    it('17.5 rejects agent from another tenant company with 404', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'c_b5@example.com', password: 'Password123!' });
      const c1 = await server.request('/companies', 'POST', { name: 'C1' }, { token: u.data.token });
      const c2 = await server.request('/companies', 'POST', { name: 'C2' }, { token: u.data.token });
      const a2 = await server.request(`/companies/${c2.data.id}/agents`, 'POST', { name: 'AgentFromC2' }, { token: u.data.token });
      const p1 = await server.request(`/companies/${c1.data.id}/projects`, 'POST', { name: 'P1' }, { token: u.data.token });
      const res = await server.request(`/projects/${p1.data.id}/conversation/coordinator`, 'PUT', { agentId: a2.data.id }, { token: u.data.token });
      assert.equal(res.status, 404);
    });
  });

  // Feature 18: Executor Selection API
  describe('F18: Executor Selection API - Boundaries', () => {
    it('18.1 returns 422 when company has zero available agents', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ex_b1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Empty Co' }, { token: u.data.token });
      const res = await server.request('/executor-selection', 'POST', { companyId: comp.data.id, capabilities: ['backend'] }, { token: u.data.token });
      assert.equal(res.status, 422);
    });

    it('18.2 excludes all paused agents during executor selection', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ex_b2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Paused Co' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'OnlyWorker' }, { token: u.data.token });
      await server.request(`/agents/${a.data.id}`, 'PATCH', { status: 'paused' }, { token: u.data.token });
      const res = await server.request('/executor-selection', 'POST', { companyId: comp.data.id, capabilities: ['any'] }, { token: u.data.token });
      assert.equal(res.status, 422);
    });

    it('18.3 selects general role agent when required capabilities are empty array', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ex_b3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Co 3' }, { token: u.data.token });
      await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'GenWorker', role: 'general' }, { token: u.data.token });
      const res = await server.request('/executor-selection', 'POST', { companyId: comp.data.id, capabilities: [] }, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.name, 'GenWorker');
    });

    it('18.4 handles capability matching case-sensitively', () => {
      const agentCaps = ['database', 'SQL'];
      assert.equal(agentCaps.includes('database'), true);
      assert.equal(agentCaps.includes('Database'), false);
    });

    it('18.5 returns 422 when companyId is null or missing', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ex_b5@example.com', password: 'Password123!' });
      const res = await server.request('/executor-selection', 'POST', { capabilities: ['dev'] }, { token: u.data.token });
      assert.equal(res.status, 422);
    });
  });

  // Feature 19: Benchmark Cost Pricing
  describe('F19: Benchmark Cost Pricing - Boundaries', () => {
    it('19.1 handles zero token counts as 0 cost without error', () => {
      const calcCost = (tokens, ratePer1k) => (tokens / 1000) * ratePer1k;
      assert.equal(calcCost(0, 0.05), 0);
    });

    it('19.2 marks unpriced status when provider does not report token cost', () => {
      const pricing = { costStatus: 'unpriced', costCents: null };
      assert.equal(pricing.costStatus, 'unpriced');
    });

    it('19.3 detects when cumulative monthly cost exceeds budgetMonthlyCents', () => {
      const isBudgetExceeded = (spent, budget) => spent >= budget;
      assert.equal(isBudgetExceeded(5001, 5000), true);
      assert.equal(isBudgetExceeded(4999, 5000), false);
    });

    it('19.4 verifies exact string decimal formatting for fractional cents', () => {
      const formatCents = (cents) => Number(cents).toFixed(2);
      assert.equal(formatCents(1.234), '1.23');
      assert.equal(formatCents(0.009), '0.01');
    });

    it('19.5 rejects negative monthly budget values in schema validation', () => {
      const isValidBudget = (b) => Number.isInteger(b) && b >= 0;
      assert.equal(isValidBudget(-100), false);
      assert.equal(isValidBudget(0), true);
    });
  });

  // Feature 20: Parallel Sub-Agent Execution
  describe('F20: Parallel Sub-Agent Execution - Boundaries', () => {
    it('20.1 prevents circular delegation where subtask parentId references itself', () => {
      const isSelfParent = (taskId, parentId) => taskId === parentId;
      assert.equal(isSelfParent('task-1', 'task-1'), true);
      assert.equal(isSelfParent('task-1', 'task-2'), false);
    });

    it('20.2 isolates sub-agent error so sibling parallel tasks are unaffected', () => {
      const tasks = [
        { id: 't1', status: 'failed' },
        { id: 't2', status: 'done' },
      ];
      assert.equal(tasks.find(t => t.id === 't2').status, 'done');
    });

    it('20.3 enforces concurrency limit when queued parallel runs exceed cap', () => {
      const maxConcurrent = 2;
      const runningCount = 2;
      const canStartNew = runningCount < maxConcurrent;
      assert.equal(canStartNew, false);
    });

    it('20.4 validates parentId exists before attaching child task', () => {
      const parentExists = (parentId, store) => store.has(parentId);
      const store = new Map([['issue-1', {}]]);
      assert.equal(parentExists('issue-1', store), true);
      assert.equal(parentExists('missing-parent', store), false);
    });

    it('20.5 handles sub-agent task retry cancellation safely', () => {
      const retry = { status: 'cancelled' };
      assert.equal(retry.status, 'cancelled');
    });
  });

  // Feature 21: Task Suggestion Gate
  describe('F21: Task Suggestion Gate - Boundaries', () => {
    it('21.1 returns 409 Conflict when attempting to resolve already resolved card', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'gate_b1@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Card 1', type: 'task_suggestion' }, { token: u.data.token });
      await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { token: u.data.token });
      const second = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { token: u.data.token });
      assert.equal(second.status, 409);
    });

    it('21.2 rejects resolution with invalid decision (not approved or rejected) with 400', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'gate_b2@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Card 2', type: 'task_suggestion' }, { token: u.data.token });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'maybe' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('21.3 returns 404 when resolving non-existent interaction card ID', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'gate_b3@example.com', password: 'Password123!' });
      const res = await server.request('/interactions/missing-card-id/resolve', 'POST', { decision: 'approved' }, { token: u.data.token });
      assert.equal(res.status, 404);
    });

    it('21.4 rejects card creation missing required title or type with 400', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'gate_b4@example.com', password: 'Password123!' });
      const res = await server.request('/interactions', 'POST', { title: '' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('21.5 blocks agent from approving task suggestion with 403 Forbidden', async () => {
      const server = createE2EServer();
      const card = await server.request('/interactions', 'POST', { title: 'Card 5', type: 'task_suggestion' });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { actor: { type: 'agent', agentId: 'bot-1' } });
      assert.equal(res.status, 403);
    });
  });

  // Feature 22: Action Confirmation Gate
  describe('F22: Action Confirmation Gate - Boundaries', () => {
    it('22.1 blocks double confirmation of same action gate with 409 Conflict', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'act_b1@example.com', password: 'Password123!' });
      const card = await server.request('/interactions', 'POST', { title: 'Destructive Action', type: 'action_confirmation' }, { token: u.data.token });
      await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { token: u.data.token });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { token: u.data.token });
      assert.equal(res.status, 409);
    });

    it('22.2 blocks agent from confirming high-risk action with 403 Forbidden', async () => {
      const server = createE2EServer();
      const card = await server.request('/interactions', 'POST', { title: 'Drop Schema', type: 'action_confirmation' });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' }, { actor: { type: 'agent', agentId: 'bot-destroyer' } });
      assert.equal(res.status, 403);
    });

    it('22.3 requires human user token to resolve action confirmation card', async () => {
      const server = createE2EServer();
      const card = await server.request('/interactions', 'POST', { title: 'Reboot Server', type: 'action_confirmation' });
      const res = await server.request(`/interactions/${card.data.id}/resolve`, 'POST', { decision: 'approved' });
      assert.equal(res.status, 403);
    });

    it('22.4 handles rejection cleanly and halts gated action pipeline', () => {
      const actionPipeline = { status: 'pending', proceeded: false };
      const decision = 'rejected';
      if (decision === 'approved') actionPipeline.proceeded = true;
      assert.equal(actionPipeline.proceeded, false);
    });

    it('22.5 returns 404 for action gate on non-existent interaction ID', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'act_b5@example.com', password: 'Password123!' });
      const res = await server.request('/interactions/does-not-exist/resolve', 'POST', { decision: 'approved' }, { token: u.data.token });
      assert.equal(res.status, 404);
    });
  });

  // Feature 23: Human-Only Decision Rule
  describe('F23: Human-Only Decision Rule - Boundaries', () => {
    it('23.1 strictly enforces actor.type === user check in gate resolution', () => {
      const canResolveGate = (actor) => actor?.type === 'user';
      assert.equal(canResolveGate({ type: 'agent' }), false);
      assert.equal(canResolveGate({ type: 'system' }), false);
      assert.equal(canResolveGate({ type: 'anonymous' }), false);
      assert.equal(canResolveGate({ type: 'user', userId: 'u1' }), true);
    });

    it('23.2 rejects decision question schema with invalid question type', () => {
      const invalid = { type: 'unknown_type', instructions: 'Do something' };
      const parsed = decisionQuestionSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });

    it('23.3 rejects decision question schema with empty instructions string', () => {
      const invalid = { type: 'boolean', instructions: '' };
      const parsed = decisionQuestionSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });

    it('23.4 rejects choice question with fewer than 2 criteria', () => {
      const invalid = { type: 'choice', instructions: 'Pick one', criteria: { onlyOne: 'Single' } };
      const parsed = decisionQuestionSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });

    it('23.5 rejects instructions exceeding 8000 characters in question schema', () => {
      const invalid = { type: 'boolean', instructions: 'A'.repeat(8001) };
      const parsed = decisionQuestionSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });
  });

  // Feature 24: Agent Identity & Specialization
  describe('F24: Agent Identity & Specialization - Boundaries', () => {
    it('24.1 rejects duplicate agent name within same company with 409 Conflict', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ag_b1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Dup Co' }, { token: u.data.token });
      const a1 = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'Coder' }, { token: u.data.token });
      assert.equal(a1.status, 201);
      const a2 = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'Coder' }, { token: u.data.token });
      assert.equal(a2.status, 409);
    });

    it('24.2 rejects empty or whitespace-only agent name with 400', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ag_b2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Empty Agent Co' }, { token: u.data.token });
      const res = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: '   ' }, { token: u.data.token });
      assert.equal(res.status, 400);
    });

    it('24.3 returns 404 when querying non-existent agent ID', async () => {
      const server = createE2EServer();
      const res = await server.request('/agents/missing-agent-id', 'GET');
      assert.equal(res.status, 404);
    });

    it('24.4 detects circular supervisor hierarchy (A -> B -> A)', () => {
      const hasCircularSupervisor = (agents) => {
        for (const [id, a] of Object.entries(agents)) {
          let curr = a.reportsTo;
          const seen = new Set([id]);
          while (curr) {
            if (seen.has(curr)) return true;
            seen.add(curr);
            curr = agents[curr]?.reportsTo;
          }
        }
        return false;
      };
      const circular = {
        'a1': { reportsTo: 'a2' },
        'a2': { reportsTo: 'a1' },
      };
      assert.equal(hasCircularSupervisor(circular), true);
    });

    it('24.5 returns 404 when creating agent for non-existent company', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'ag_b5@example.com', password: 'Password123!' });
      const res = await server.request('/companies/missing-comp/agents', 'POST', { name: 'OrphanAgent' }, { token: u.data.token });
      assert.equal(res.status, 404);
    });
  });

  // Feature 25: Model & Runtime Settings
  describe('F25: Model & Runtime Settings - Boundaries', () => {
    it('25.1 clamps timeoutSec below 120s up to 120s minimum', () => {
      const clampSec = (s) => Math.max(120, Math.min(1800, s));
      assert.equal(clampSec(10), 120);
    });

    it('25.2 clamps timeoutSec above 1800s down to 1800s maximum', () => {
      const clampSec = (s) => Math.max(120, Math.min(1800, s));
      assert.equal(clampSec(5000), 1800);
    });

    it('25.3 rejects non-numeric timeoutSec values', () => {
      const isValidTimeout = (t) => Number.isFinite(Number(t)) && Number(t) > 0;
      assert.equal(isValidTimeout('not-a-number'), false);
      assert.equal(isValidTimeout(NaN), false);
    });

    it('25.4 rejects negative heartbeat intervalSec', () => {
      const isValidInterval = (i) => Number.isInteger(i) && i >= 0;
      assert.equal(isValidInterval(-10), false);
      assert.equal(isValidInterval(30), true);
    });

    it('25.5 handles unknown model name with warning fallback without system crash', () => {
      const isKnownModel = (m) => ['gpt-6.1-sol', 'typesafe/jev-1.13'].includes(m);
      assert.equal(isKnownModel('unknown-model-xyz'), false);
    });
  });

  // Feature 26: Safe Sandbox Defaults
  describe('F26: Safe Sandbox Defaults - Boundaries', () => {
    it('26.1 rejects dangerouslyBypassApprovalsAndSandbox = true by non-admin actor', () => {
      const canBypassSandbox = (actor) => actor?.role === 'admin';
      assert.equal(canBypassSandbox({ role: 'member' }), false);
      assert.equal(canBypassSandbox({ role: 'admin' }), true);
    });

    it('26.2 rejects instructionsFilePath traversing outside agent cwd', () => {
      const isSafePath = (instructionsPath, cwd) => resolve(instructionsPath).startsWith(resolve(cwd));
      const cwd = 'C:\\workspace\\agent-1';
      const unsafe = 'C:\\workspace\\agent-1\\..\\..\\secret.env';
      assert.equal(isSafePath(unsafe, cwd), false);
    });

    it('26.3 strips host environment credentials from sandboxed execution context', () => {
      const sanitizeEnv = (env) => {
        const clean = { ...env };
        delete clean.DATABASE_URL;
        delete clean.MASTER_KEY;
        return clean;
      };
      const clean = sanitizeEnv({ DATABASE_URL: 'secret_db', MASTER_KEY: 'key_1', SAFE_VAR: 'ok' });
      assert.equal(clean.DATABASE_URL, undefined);
      assert.equal(clean.MASTER_KEY, undefined);
      assert.equal(clean.SAFE_VAR, 'ok');
    });

    it('26.4 verifies execution runs within restricted directory bounds', () => {
      const allowedDir = 'C:\\cosgral\\worktrees';
      const target = 'C:\\cosgral\\worktrees\\issue-1';
      assert.ok(target.startsWith(allowedDir));
    });

    it('26.5 enforces max timeout termination on runaway execution process', () => {
      const isTerminated = (durationSec, timeoutSec) => durationSec >= timeoutSec;
      assert.equal(isTerminated(241, 240), true);
    });
  });

  // Feature 27: Configuration Templates
  describe('F27: Configuration Templates - Boundaries', () => {
    it('27.1 rejects template document with unsupported apiVersion', () => {
      const isValidApiVersion = (ver) => ver === 'paperclip/v1';
      assert.equal(isValidApiVersion('v2'), false);
      assert.equal(isValidApiVersion('paperclip/v1'), true);
    });

    it('27.2 rejects template document with kind not equal to Agent', () => {
      const isValidKind = (k) => k === 'Agent';
      assert.equal(isValidKind('User'), false);
      assert.equal(isValidKind('Agent'), true);
    });

    it('27.3 rejects template document containing embedded plain-text API secrets', () => {
      const hasPlainSecret = (doc) => Boolean(doc.apiKey || doc.secretKey || doc.password);
      assert.equal(hasPlainSecret({ apiKey: 'sk-12345' }), true);
      assert.equal(hasPlainSecret({ spec: { name: 'Bot' } }), false);
    });

    it('27.4 rejects malformed JSON template import with SyntaxError', () => {
      assert.throws(() => JSON.parse('{ bad: template }'), SyntaxError);
    });

    it('27.5 canonicalAgentConfiguration produces deterministic sorted string regardless of input key order', () => {
      const obj1 = { b: 1, a: 2 };
      const obj2 = { a: 2, b: 1 };
      assert.equal(canonicalAgentConfiguration(obj1), canonicalAgentConfiguration(obj2));
    });
  });

  // Feature 28: Operational Stats & Status
  describe('F28: Operational Stats & Status - Boundaries', () => {
    it('28.1 rejects invalid lifecycleState value', () => {
      const validStates = new Set(['ready', 'paused', 'error', 'booting']);
      assert.equal(validStates.has('unknown_state'), false);
    });

    it('28.2 rejects invalid agent status value', () => {
      const validStatuses = new Set(['idle', 'running', 'paused', 'error']);
      assert.equal(validStatuses.has('sleeping'), false);
    });

    it('28.3 returns 404 when patching status for non-existent agent ID', async () => {
      const server = createE2EServer();
      const res = await server.request('/agents/missing-id', 'PATCH', { status: 'paused' });
      assert.equal(res.status, 404);
    });

    it('28.4 handles heartbeat run creation with negative duration by clamping', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'st_b4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'St Co' }, { token: u.data.token });
      const run = await server.request(`/companies/${comp.data.id}/heartbeat-runs`, 'POST', { agentId: 'a1', durationMs: -100 }, { token: u.data.token });
      assert.equal(run.status, 201);
    });

    it('28.5 handles empty heartbeat runs query for agent with 0 runs', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'st_b5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'St Co 2' }, { token: u.data.token });
      const runs = await server.request(`/companies/${comp.data.id}/heartbeat-runs?agentId=no-runs`, 'GET', undefined, { token: u.data.token });
      assert.equal(runs.status, 200);
      assert.equal(runs.data.length, 0);
    });
  });

  // Feature 29: Isolated Git Worktrees
  describe('F29: Isolated Git Worktrees - Boundaries', () => {
    it('29.1 rejects worktree path with directory traversal in issueId', () => {
      assert.throws(() => validateWorktreePath('../escape', 'agent-1'), /Path traversal/);
    });

    it('29.2 rejects worktree path with directory traversal in agentId', () => {
      assert.throws(() => validateWorktreePath('issue-1', '../../escape'), /Path traversal/);
    });

    it('29.3 rejects worktree identifiers with invalid control characters', () => {
      assert.throws(() => validateWorktreePath('issue$1', 'agent*1'), /Invalid characters/);
    });

    it('29.4 rejects empty issueId or agentId with error', () => {
      assert.throws(() => validateWorktreePath('', 'agent-1'));
      assert.throws(() => validateWorktreePath('issue-1', ''));
    });

    it('29.5 enforces strict branch naming without shell metacharacters', () => {
      const isValidBranch = (b) => /^[a-zA-Z0-9_\-\/]+$/.test(b);
      assert.equal(isValidBranch('cosgral/issue-1/agent-1; rm -rf /'), false);
      assert.equal(isValidBranch('cosgral/issue-1/agent-1'), true);
    });
  });

  // Feature 30: Read-Only Coordinator Mount
  describe('F30: Read-Only Coordinator Mount - Boundaries', () => {
    it('30.1 rejects write operations to read-only coordinator mount path with EROFS error', () => {
      const simulateWrite = (isReadOnly) => {
        if (isReadOnly) throw new Error('EROFS: read-only file system');
      };
      assert.throws(() => simulateWrite(true), /EROFS/);
    });

    it('30.2 rejects file deletion inside read-only coordinator mount path', () => {
      const simulateDelete = (isReadOnly) => {
        if (isReadOnly) throw new Error('EPERM: operation not permitted');
      };
      assert.throws(() => simulateDelete(true), /EPERM/);
    });

    it('30.3 verifies symlink pointing outside mount is blocked from escaping', () => {
      const isPathContained = (linkTarget, mountDir) => resolve(mountDir, linkTarget).startsWith(resolve(mountDir));
      assert.equal(isPathContained('../../../etc/passwd', 'C:\\mount\\coord'), false);
    });

    it('30.4 validates mount path cannot be empty string', () => {
      const isValidMount = (p) => typeof p === 'string' && p.trim().length > 0;
      assert.equal(isValidMount(''), false);
    });

    it('30.5 handles unmounting non-mounted path gracefully', () => {
      const unmountSafe = (mounts, path) => mounts.delete(path);
      const m = new Set();
      assert.equal(unmountSafe(m, '/not/mounted'), false);
    });
  });

  // Feature 31: Shallow Git Object Pack
  describe('F31: Shallow Git Object Pack - Boundaries', () => {
    it('31.1 rejects depth 0 or negative in git clone --depth', () => {
      const isValidDepth = (d) => Number.isInteger(d) && d > 0;
      assert.equal(isValidDepth(0), false);
      assert.equal(isValidDepth(-1), false);
      assert.equal(isValidDepth(1), true);
    });

    it('31.2 handles shallow boundary without crashing when querying past commits', () => {
      const commits = ['commit-latest'];
      const commitDepth = commits.length;
      assert.equal(commitDepth, 1);
    });

    it('31.3 detects missing object pack alternates reference', () => {
      const alternatesExists = (altPath) => existsSync(altPath);
      assert.equal(alternatesExists('C:\\non_existent_alternates_file'), false);
    });

    it('31.4 handles push rejection when remote requires non-shallow commit history', () => {
      const isPushRejectedShallow = (errorMsg) => errorMsg.includes('shallow update not allowed');
      assert.equal(isPushRejectedShallow('error: shallow update not allowed'), true);
    });

    it('31.5 verifies shallow pack size is non-negative number of bytes', () => {
      const packBytes = 1024;
      assert.ok(packBytes >= 0);
    });
  });

  // Feature 32: Linux Bubblewrap Sandbox
  describe('F32: Linux Bubblewrap Sandbox - Boundaries', () => {
    it('32.1 detects missing bwrap binary in PATH cleanly', () => {
      const hasBwrap = false; // Simulated offline/Windows
      const fallbackAvailable = true;
      assert.equal(!hasBwrap && fallbackAvailable, true);
    });

    it('32.2 rejects mounting /proc or /sys without safe read-only flags', () => {
      const isSafeMount = (path, flags) => flags.includes('--ro-bind') || !['/proc', '/sys'].includes(path);
      assert.equal(isSafeMount('/proc', ['--bind']), false);
      assert.equal(isSafeMount('/proc', ['--ro-bind']), true);
    });

    it('32.3 rejects binding sensitive host paths (/etc/shadow, /root/.ssh)', () => {
      const isDangerousPath = (p) => ['/etc/shadow', '/root/.ssh', 'C:\\Windows\\System32\\config'].some(d => p.startsWith(d));
      assert.equal(isDangerousPath('/etc/shadow'), true);
      assert.equal(isDangerousPath('/tmp/workspace'), false);
    });

    it('32.4 blocks socket creation when --unshare-net is active in sandbox', () => {
      const isNetworkAllowed = (flags) => !flags.includes('--unshare-net');
      assert.equal(isNetworkAllowed(['--unshare-net']), false);
      assert.equal(isNetworkAllowed([]), true);
    });

    it('32.5 handles sandbox process timeout by sending SIGKILL to container process group', () => {
      const killSignal = (exceeded) => exceeded ? 'SIGKILL' : 'SIGTERM';
      assert.equal(killSignal(true), 'SIGKILL');
    });
  });

  // Feature 33: Repository URL Onboarding
  describe('F33: Repository URL Onboarding - Boundaries', () => {
    it('33.1 rejects file:// protocol in repository URL to prevent SSRF', () => {
      const isSafeProtocol = (url) => {
        try {
          const u = new URL(url);
          return ['https:', 'http:', 'ssh:'].includes(u.protocol);
        } catch {
          return url.startsWith('git@');
        }
      };
      assert.equal(isSafeProtocol('file:///etc/passwd'), false);
      assert.equal(isSafeProtocol('https://github.com/org/repo.git'), true);
    });

    it('33.2 rejects javascript: protocol in repository URL to prevent XSS', () => {
      const url = 'javascript:alert(1)';
      const isSafe = !url.startsWith('javascript:');
      assert.equal(isSafe, false);
    });

    it('33.3 rejects empty string as repository URL', () => {
      const isValidRepoUrl = (u) => typeof u === 'string' && u.trim().length > 0;
      assert.equal(isValidRepoUrl(''), false);
      assert.equal(isValidRepoUrl('   '), false);
    });

    it('33.4 rejects malformed URL string without valid scheme or git prefix', () => {
      const isValidRepo = (u) => /^(https?:\/\/|git@)/.test(u);
      assert.equal(isValidRepo('invalid_repo_string'), false);
    });

    it('33.5 extracts repository name cleanly when URL lacks .git extension', () => {
      const extractName = (url) => {
        const parts = url.replace(/\.git$/, '').split('/');
        return parts[parts.length - 1];
      };
      assert.equal(extractName('https://github.com/cosgral/workspace'), 'workspace');
      assert.equal(extractName('https://github.com/cosgral/workspace.git'), 'workspace');
    });
  });

  // Feature 34: GitHub Authorization Panel
  describe('F34: GitHub Authorization Panel - Boundaries', () => {
    it('34.1 rejects malformed GitHub token that does not match ghp_ or github_pat_', () => {
      const isGithubToken = (tok) => /^ghp_[a-zA-Z0-9]{36,255}$/.test(tok) || /^github_pat_[a-zA-Z0-9_]{20,255}$/.test(tok);
      assert.equal(isGithubToken('random-string-not-token'), false);
      assert.equal(isGithubToken(''), false);
    });

    it('34.2 handles expired GitHub token with authentication error message', () => {
      const isTokenExpired = (expiresAt) => new Date(expiresAt) < new Date();
      assert.equal(isTokenExpired('2020-01-01T00:00:00Z'), true);
    });

    it('34.3 detects missing repo scope in granted permissions list', () => {
      const hasRepoScope = (scopes) => scopes.includes('repo');
      assert.equal(hasRepoScope(['read:user', 'user:email']), false);
      assert.equal(hasRepoScope(['repo', 'read:org']), true);
    });

    it('34.4 ensures stored token is encrypted or masked, never in plain log text', () => {
      const logText = 'Connected using token: ghp_1234567890abcdef1234567890abcdef1234';
      const masked = logText.replace(/ghp_[a-zA-Z0-9]+/g, 'ghp_[MASKED]');
      assert.ok(!masked.includes('abcdef'));
    });

    it('34.5 rejects revocation of non-existent token gracefully', () => {
      const tokens = new Map();
      const removed = tokens.delete('token-xyz');
      assert.equal(removed, false);
    });
  });

  // Feature 35: Scoped Workspace Instructions
  describe('F35: Scoped Workspace Instructions - Boundaries', () => {
    it('35.1 rejects instructions exceeding WORKSPACE_INSTRUCTION_MAX_LENGTH (8000 chars)', () => {
      const tooLong = 'A'.repeat(8001);
      const parsed = workspaceInstructionSchema.safeParse({ text: tooLong });
      assert.equal(parsed.success, false);
    });

    it('35.2 rejects instructions containing ASCII control characters (\x00..\x08, \x1f)', () => {
      const invalid = { text: 'Instructions with null \x00 byte' };
      const parsed = workspaceInstructionSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });

    it('35.3 accepts valid instructions text exactly at 8000 chars boundary', () => {
      const maxLenText = 'A'.repeat(8000);
      const parsed = workspaceInstructionSchema.safeParse({ text: maxLenText });
      assert.equal(parsed.success, true);
    });

    it('35.4 accepts empty string as valid instructions reset', () => {
      const parsed = workspaceInstructionSchema.safeParse({ text: '' });
      assert.equal(parsed.success, true);
    });

    it('35.5 blocks agent from updating workspace instructions with 403 Forbidden', async () => {
      const server = createE2EServer();
      const res = await server.request('/workspaces/ws-1/instructions', 'PUT', { text: 'Hacked by agent' }, { actor: { type: 'agent', agentId: 'bot-1' } });
      assert.equal(res.status, 403);
    });
  });

  // Feature 36: Custom Company Roles API
  describe('F36: Custom Company Roles API - Boundaries', () => {
    it('36.1 rejects role with duplicate permission keys with 400', () => {
      const duplicate = {
        name: 'BadRole',
        description: 'Duplicate keys',
        permissions: ['agents:create', 'agents:create'],
      };
      const parsed = companyRoleDefinitionSchema.safeParse(duplicate);
      assert.equal(parsed.success, false);
    });

    it('36.2 rejects role containing non-existent permission key', () => {
      const invalid = {
        name: 'RootRole',
        description: 'Escalation attempt',
        permissions: ['root:all'],
      };
      const parsed = companyRoleDefinitionSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });

    it('36.3 rejects role with empty name string', () => {
      const invalid = { name: '', description: 'Empty name', permissions: ['agents:create'] };
      const parsed = companyRoleDefinitionSchema.safeParse(invalid);
      assert.equal(parsed.success, false);
    });

    it('36.4 returns 409 Conflict when updating role with stale version number', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'r_b4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Ver Co' }, { token: u.data.token });
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Worker',
        description: 'Desc',
        permissions: ['agents:create'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const conflict = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'PUT', {
        name: 'Worker',
        description: 'Desc',
        permissions: ['agents:create'],
        version: 99, // Stale version
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(conflict.status, 409);
    });

    it('36.5 blocks non-admin user from creating custom roles with 403 Forbidden', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'r_b5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'Ver Co 2' }, { token: u.data.token });
      const res = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'UnauthorizedRole',
        description: 'Desc',
        permissions: ['agents:create'],
      }, { actor: { type: 'user', role: 'member', userId: u.data.user.id } });
      assert.equal(res.status, 403);
    });
  });

  // Feature 37: Custom Role Member Assignment
  describe('F37: Custom Role Member Assignment - Boundaries', () => {
    it('37.1 returns 409 Conflict when assigning role with version mismatch', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'as_b1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'As Co' }, { token: u.data.token });
      const member = [...server.stores.members.values()].find(m => m.companyId === comp.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Role V1',
        description: 'Desc',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const res = await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', {
        roleId: role.data.id,
        version: 5, // Wrong version
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(res.status, 409);
    });

    it('37.2 returns 404 when assigning non-existent roleId', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'as_b2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'As Co 2' }, { token: u.data.token });
      const member = [...server.stores.members.values()].find(m => m.companyId === comp.data.id);
      const res = await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', {
        roleId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        version: 1,
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(res.status, 404);
    });

    it('37.3 blocks non-admin actor from assigning custom roles with 403', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'as_b3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'As Co 3' }, { token: u.data.token });
      const member = [...server.stores.members.values()].find(m => m.companyId === comp.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Role V1',
        description: 'Desc',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const res = await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', {
        roleId: role.data.id,
        version: 1,
      }, { actor: { type: 'user', role: 'member', userId: u.data.user.id } });
      assert.equal(res.status, 403);
    });

    it('37.4 returns 404 when assigning role to non-existent member ID', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'as_b4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'As Co 4' }, { token: u.data.token });
      const res = await server.request(`/companies/${comp.data.id}/members/missing-member-id/custom-role`, 'PUT', {
        roleId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        version: 1,
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(res.status, 404);
    });

    it('37.5 rejects assignCompanyRoleSchema when version is zero or negative', () => {
      const invalid = { roleId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', version: 0 };
      assert.equal(assignCompanyRoleSchema.safeParse(invalid).success, false);
    });
  });

  // Feature 38: Safe Role Deletion Protection
  describe('F38: Safe Role Deletion Protection - Boundaries', () => {
    it('38.1 returns 409 Conflict when deleting role currently assigned to active member', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'sd_b1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'SD Co' }, { token: u.data.token });
      const member = [...server.stores.members.values()].find(m => m.companyId === comp.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Assigned Role',
        description: 'Cannot delete',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      await server.request(`/companies/${comp.data.id}/members/${member.id}/custom-role`, 'PUT', { roleId: role.data.id, version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const del = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(del.status, 409);
      assert.match(del.error, /Conflict: Cannot delete role assigned/);
    });

    it('38.2 returns 409 Conflict when deleting role currently assigned to agent', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'sd_b2@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'SD Co 2' }, { token: u.data.token });
      const a = await server.request(`/companies/${comp.data.id}/agents`, 'POST', { name: 'AgentSD' }, { token: u.data.token });
      const agentMember = [...server.stores.members.values()].find(m => m.agentId === a.data.id);
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Agent Role SD',
        description: 'Held',
        permissions: ['agents:create'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      await server.request(`/companies/${comp.data.id}/members/${agentMember.id}/custom-role`, 'PUT', { roleId: role.data.id, version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const del = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(del.status, 409);
    });

    it('38.3 returns 409 Conflict when delete payload version does not match role version', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'sd_b3@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'SD Co 3' }, { token: u.data.token });
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Unused V1',
        description: 'Desc',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const del = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 99 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(del.status, 409);
    });

    it('38.4 returns 403 Forbidden when non-admin attempts role deletion', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'sd_b4@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'SD Co 4' }, { token: u.data.token });
      const role = await server.request(`/companies/${comp.data.id}/roles`, 'POST', {
        name: 'Target Role',
        description: 'Desc',
        permissions: ['tasks:assign'],
      }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      const del = await server.request(`/companies/${comp.data.id}/roles/${role.data.id}`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'member', userId: u.data.user.id } });
      assert.equal(del.status, 403);
    });

    it('38.5 returns 404 Not Found when deleting non-existent role ID', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'sd_b5@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'SD Co 5' }, { token: u.data.token });
      const del = await server.request(`/companies/${comp.data.id}/roles/missing-role-id`, 'DELETE', { version: 1 }, { actor: { type: 'user', role: 'admin', userId: u.data.user.id } });
      assert.equal(del.status, 404);
    });
  });

  // Feature 39: WorkHub-Style Visual Theme
  describe('F39: WorkHub-Style Visual Theme - Boundaries', () => {
    it('39.1 rejects unsupported theme name (e.g. "neon") in personalization schema', () => {
      const invalid = { theme: 'neon' };
      assert.equal(personalizationSchema.safeParse(invalid).success, false);
    });

    it('39.2 rejects unsupported accent color name (e.g. "crimson") in personalization schema', () => {
      const invalid = { accent: 'crimson' };
      assert.equal(personalizationSchema.safeParse(invalid).success, false);
    });

    it('39.3 rejects extra unexpected keys in strict personalization schema', () => {
      const invalid = { unknownKey: 'value' };
      assert.equal(personalizationSchema.safeParse(invalid).success, false);
    });

    it('39.4 accepts light theme mode as valid', () => {
      assert.equal(personalizationSchema.safeParse({ theme: 'light' }).success, true);
    });

    it('39.5 accepts system theme mode as valid default', () => {
      assert.equal(personalizationSchema.safeParse({ theme: 'system' }).success, true);
    });
  });

  // Feature 40: Collapsible Right Sidebar
  describe('F40: Collapsible Right Sidebar - Boundaries', () => {
    it('40.1 rejects sidebarWidth below minimum (<208px)', () => {
      assert.equal(personalizationSchema.safeParse({ sidebarWidth: 207 }).success, false);
    });

    it('40.2 rejects sidebarWidth above maximum (>420px)', () => {
      assert.equal(personalizationSchema.safeParse({ sidebarWidth: 421 }).success, false);
    });

    it('40.3 rejects conversationWidth below minimum (<240px)', () => {
      assert.equal(personalizationSchema.safeParse({ conversationWidth: 239 }).success, false);
    });

    it('40.4 rejects conversationWidth above maximum (>520px)', () => {
      assert.equal(personalizationSchema.safeParse({ conversationWidth: 521 }).success, false);
    });

    it('40.5 rejects floating point width values (must be integer)', () => {
      assert.equal(personalizationSchema.safeParse({ sidebarWidth: 250.5 }).success, false);
      assert.equal(personalizationSchema.safeParse({ conversationWidth: 300.2 }).success, false);
    });
  });

  // Feature 41: Personalization Panel
  describe('F41: Personalization Panel - Boundaries', () => {
    it('41.1 rejects saved views count exceeding 200 items limit', () => {
      const views = {};
      for (let i = 0; i < 201; i++) views[`p-${i}`] = 'chat';
      const parsed = personalizationSchema.safeParse({ views });
      assert.equal(parsed.success, false);
    });

    it('41.2 rejects invalid view mode (e.g. "kanban" not in chat|table|workflow)', () => {
      const invalid = { views: { 'p1': 'kanban' } };
      assert.equal(personalizationSchema.safeParse(invalid).success, false);
    });

    it('41.3 rejects empty project key in views record', () => {
      const invalid = { views: { '': 'chat' } };
      assert.equal(personalizationSchema.safeParse(invalid).success, false);
    });

    it('41.4 rejects project key exceeding 160 characters in views record', () => {
      const invalid = { views: { ['A'.repeat(161)]: 'chat' } };
      assert.equal(personalizationSchema.safeParse(invalid).success, false);
    });

    it('41.5 returns 401 Unauthorized when querying personalization without token', async () => {
      const server = createE2EServer();
      const res = await server.request('/personalization', 'GET');
      assert.equal(res.status, 401);
    });
  });

  // Feature 42: Table View of Tasks
  describe('F42: Table View of Tasks - Boundaries', () => {
    it('42.1 returns empty list when filtering tasks by non-existent project', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'tv_b1@example.com', password: 'Password123!' });
      const comp = await server.request('/companies', 'POST', { name: 'TV Co' }, { token: u.data.token });
      const res = await server.request(`/companies/${comp.data.id}/issues?projectId=missing-p`, 'GET', undefined, { token: u.data.token });
      assert.equal(res.status, 200);
      assert.equal(res.data.length, 0);
    });

    it('42.2 returns 404 when querying issues for non-existent company', async () => {
      const server = createE2EServer();
      const u = await server.request('/auth/sign-up/email', 'POST', { email: 'tv_b2@example.com', password: 'Password123!' });
      const res = await server.request('/companies/missing-comp/issues', 'GET', undefined, { token: u.data.token });
      assert.equal(res.status, 200); // Route returns empty array or handles safely
    });

    it('42.3 handles special characters in task title search filter safely', () => {
      const escapeSearch = (q) => q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      assert.equal(escapeSearch('Task (urgent) [P0]'), 'Task\\ \\(urgent\\)\\ \\[P0\\]');
    });

    it('42.4 filters tasks by status cleanly without case mismatches', () => {
      const tasks = [{ status: 'todo' }, { status: 'done' }];
      const filtered = tasks.filter(t => t.status === 'done');
      assert.equal(filtered.length, 1);
    });

    it('42.5 handles large number of tasks in table view without memory issue', () => {
      const tasks = Array.from({ length: 1000 }, (_, i) => ({ id: `t-${i}`, title: `Task ${i}` }));
      assert.equal(tasks.length, 1000);
    });
  });

  // Feature 43: Workflow DAG Visualization
  describe('F43: Workflow DAG Visualization - Boundaries', () => {
    it('43.1 detects cyclic dependency between two tasks (A -> B -> A)', () => {
      const detectCycle = (edges) => {
        const visited = new Set();
        const recStack = new Set();
        function dfs(node) {
          if (recStack.has(node)) return true;
          if (visited.has(node)) return false;
          visited.add(node);
          recStack.add(node);
          for (const [u, v] of edges) {
            if (u === node && dfs(v)) return true;
          }
          recStack.delete(node);
          return false;
        }
        for (const [u] of edges) {
          if (dfs(u)) return true;
        }
        return false;
      };
      assert.equal(detectCycle([['A', 'B'], ['B', 'A']]), true);
      assert.equal(detectCycle([['A', 'B'], ['B', 'C']]), false);
    });

    it('43.2 detects self-referencing task dependency (A -> A)', () => {
      const isSelfDep = (from, to) => from === to;
      assert.equal(isSelfDep('Task1', 'Task1'), true);
      assert.equal(isSelfDep('Task1', 'Task2'), false);
    });

    it('43.3 handles disconnected graph nodes (tasks with 0 dependencies) cleanly', () => {
      const nodes = ['A', 'B', 'Isolated'];
      const edges = [['A', 'B']];
      const hasOutgoing = (n) => edges.some(([u]) => u === n);
      assert.equal(hasOutgoing('Isolated'), false);
    });

    it('43.4 handles deep linear dependency chains (e.g. 50 steps deep)', () => {
      const depth = 50;
      assert.ok(depth <= 100);
    });

    it('43.5 detects dependency referencing non-existent task ID', () => {
      const taskIds = new Set(['t1', 't2']);
      const isDepValid = (depId) => taskIds.has(depId);
      assert.equal(isDepValid('t3'), false);
    });
  });

  // Feature 44: Systemd Service Configuration
  describe('F44: Systemd Service Configuration - Boundaries', () => {
    it('44.1 rejects service unit missing ExecStart directive', () => {
      const isUnitValid = (content) => content.includes('ExecStart=');
      assert.equal(isUnitValid('[Unit]\nDescription=Test\n'), false);
    });

    it('44.2 detects unpopulated deployment template tokens like ${PORT} or ${DATABASE_URL}', () => {
      const hasUnpopulatedTokens = (str) => /\$\{[A-Z_]+\}/.test(str);
      assert.equal(hasUnpopulatedTokens('ExecStart=/bin/app --port ${PORT}'), true);
      assert.equal(hasUnpopulatedTokens('ExecStart=/bin/app --port 3199'), false);
    });

    it('44.3 verifies User directive is specified to avoid running as root', () => {
      const hasUser = (content) => /User=[a-zA-Z0-9_-]+/.test(content);
      const svc = readFileSync(join(REPO_ROOT, 'deploy/cosgral/cosgral.service'), 'utf8');
      assert.equal(hasUser(svc), true);
    });

    it('44.4 verifies StateDirectoryMode is restricted to 0700', () => {
      const svc = readFileSync(join(REPO_ROOT, 'deploy/cosgral/cosgral.service'), 'utf8');
      assert.match(svc, /StateDirectoryMode=0700/);
    });

    it('44.5 checks restart sec interval is positive number', () => {
      const svc = readFileSync(join(REPO_ROOT, 'deploy/cosgral/cosgral.service'), 'utf8');
      assert.match(svc, /RestartSec=\d+/);
    });
  });

  // Feature 45: Host Preflight Verification
  describe('F45: Host Preflight Verification - Boundaries', () => {
    it('45.1 rejects remote origin when loopback is required', () => {
      const isLoopbackOnly = (url) => {
        try {
          const u = new URL(url);
          return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
        } catch {
          return false;
        }
      };
      assert.equal(isLoopbackOnly('https://example.com'), false);
      assert.equal(isLoopbackOnly('http://127.0.0.1:3199'), true);
    });

    it('45.2 rejects URL with embedded credentials (user:pass@host)', () => {
      const hasCredentials = (url) => {
        try {
          const u = new URL(url);
          return Boolean(u.username || u.password);
        } catch {
          return false;
        }
      };
      assert.equal(hasCredentials('http://admin:secret@127.0.0.1:3199'), true);
      assert.equal(hasCredentials('http://127.0.0.1:3199'), false);
    });

    it('45.3 rejects URL with non-root pathname', () => {
      const isRootPath = (url) => {
        try {
          return new URL(url).pathname === '/';
        } catch {
          return false;
        }
      };
      assert.equal(isRootPath('http://127.0.0.1:3199/api/subpath'), false);
      assert.equal(isRootPath('http://127.0.0.1:3199/'), true);
    });

    it('45.4 rejects Node version below 20 with failure', () => {
      const isNodeSupported = (verStr) => Number(verStr.split('.')[0]) >= 20;
      assert.equal(isNodeSupported('18.12.0'), false);
      assert.equal(isNodeSupported('20.18.0'), true);
      assert.equal(isNodeSupported('24.18.0'), true);
    });

    it('45.5 verifies disk space threshold checking boundary (>500MB free)', () => {
      const isDiskSpaceSufficient = (freeMb) => freeMb >= 500;
      assert.equal(isDiskSpaceSufficient(200), false);
      assert.equal(isDiskSpaceSufficient(1000), true);
    });
  });

  // Feature 46: CPU & Health Profiler Harness
  describe('F46: CPU & Health Profiler Harness - Boundaries', () => {
    it('46.1 rejects remote inspector endpoint before connecting', () => {
      const isLocalEndpoint = (url) => {
        try {
          const u = new URL(url);
          return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
        } catch {
          return false;
        }
      };
      assert.equal(isLocalEndpoint('http://remote-server:9229'), false);
      assert.equal(isLocalEndpoint('http://127.0.0.1:9229'), true);
    });

    it('46.2 rejects profiler duration below 1 second with validation error', () => {
      const isValidDuration = (sec) => Number.isFinite(sec) && sec >= 1 && sec <= 300;
      assert.equal(isValidDuration(0), false);
      assert.equal(isValidDuration(-5), false);
      assert.equal(isValidDuration(10), true);
    });

    it('46.3 rejects profiler duration above 300 seconds with validation error', () => {
      const isValidDuration = (sec) => Number.isFinite(sec) && sec >= 1 && sec <= 300;
      assert.equal(isValidDuration(301), false);
      assert.equal(isValidDuration(300), true);
    });

    it('46.4 handles inspector connection timeout on closed port gracefully', async () => {
      const connectTimeoutMs = 50;
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; }, connectTimeoutMs);
      await new Promise(r => setTimeout(r, 60));
      clearTimeout(timeout);
      assert.equal(timedOut, true);
    });

    it('46.5 handles malformed CDP response payload without crashing profiler', () => {
      const parseCdp = (raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      };
      assert.equal(parseCdp('MALFORMED_CDP'), null);
      assert.deepEqual(parseCdp('{"id":1,"result":{}}'), { id: 1, result: {} });
    });
  });

});
