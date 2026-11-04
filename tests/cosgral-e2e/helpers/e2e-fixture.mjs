// Opaque-box E2E test harness for COSGRAL Workspace
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { PERMISSION_KEYS } from '../../../packages/shared/dist/constants.js';
import {
  companyRoleDefinitionSchema,
  updateCompanyRoleSchema,
  assignCompanyRoleSchema,
  deleteCompanyRoleSchema,
} from '../../../packages/shared/dist/company-roles.js';
import {
  personalizationSchema,
  defaultPersonalization,
} from '../../../packages/shared/dist/personalization.js';
import {
  workspaceInstructionSchema,
  WORKSPACE_INSTRUCTION_MAX_LENGTH,
} from '../../../packages/shared/dist/workspace-instructions.js';
import {
  classifyConversationEntry,
} from '../../../packages/shared/dist/project-conversation-history.js';
import {
  canonicalAgentConfiguration,
} from '../../../packages/shared/dist/agent-configuration.js';
import {
  decisionQuestionSchema,
  decisionRequestSchema,
} from '../../../packages/shared/dist/decision-models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const REPO_ROOT = resolve(__dirname, '../../../');

/**
 * Creates an in-memory high-fidelity opaque-box COSGRAL server
 * exercising authentic shared schemas, security rules, and contracts.
 */
export function createE2EServer(initialOptions = {}) {
  const deploymentMode = initialOptions.deploymentMode || 'authenticated';
  const bus = new EventEmitter();

  // Stores
  const users = new Map();
  const sessions = new Map();
  const companies = new Map();
  const members = new Map();
  const roles = new Map();
  const projects = new Map();
  const workspaces = new Map();
  const conversations = new Map();
  const issues = new Map();
  const comments = new Map();
  const idempotencyMap = new Map();
  const agents = new Map();
  const interactions = new Map();
  const personalizations = new Map();
  const instructions = new Map();
  const heartbeatRuns = new Map();
  let adminBootstrapped = false;
  let seq = 0;

  function nowIso() {
    seq++;
    const ms = Date.now() + Math.floor(seq / 1000);
    const d = new Date(ms);
    const us = String(seq % 1000).padStart(3, '0');
    return `${d.toISOString().slice(0, 23)}${us}Z`;
  }

  function getActor(options = {}) {
    if (options.actor) return options.actor;
    if (options.token) {
      const session = sessions.get(options.token);
      if (session) {
        if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
          return { type: 'anonymous' };
        }
        const user = users.get(session.userId);
        return { type: 'user', userId: session.userId, user, role: user?.systemRole || 'user' };
      }
    }
    if (options.agentId) {
      return { type: 'agent', agentId: options.agentId };
    }
    return { type: 'anonymous' };
  }

  async function request(path, method = 'GET', body, options = {}) {
    const actor = getActor(options);
    const url = new URL(path, 'http://127.0.0.1:3199');
    const pathname = url.pathname.replace(/^\/api/, '');

    // 1. Health
    if (pathname === '/health' && method === 'GET') {
      return { status: 200, data: { status: 'ok', deploymentMode, timestamp: nowIso() } };
    }

    // 2. Auth: Sign up
    if (pathname === '/auth/sign-up/email' && method === 'POST') {
      if (!body?.email || !body?.password) {
        return { status: 400, error: 'Email and password required' };
      }
      if (!body.email.includes('@') || !body.email.includes('.')) {
        return { status: 400, error: 'Invalid email address' };
      }
      if (typeof body.password !== 'string' || body.password.length < 6) {
        return { status: 400, error: 'Password too short' };
      }
      for (const u of users.values()) {
        if (u.email === body.email) {
          return { status: 409, error: 'User already exists' };
        }
      }
      const userId = randomUUID();
      const user = {
        id: userId,
        email: body.email,
        name: body.name || body.email.split('@')[0],
        password: body.password,
        avatarUrl: null,
        systemRole: 'user',
        createdAt: nowIso(),
      };
      users.set(userId, user);
      const token = randomUUID();
      sessions.set(token, { token, userId, expiresAt: new Date(Date.now() + 86400000).toISOString() });
      return { status: 201, data: { user: { id: user.id, email: user.email, name: user.name }, token } };
    }

    // Auth: Sign in
    if (pathname === '/auth/sign-in/email' && method === 'POST') {
      if (!body?.email || !body?.password) {
        return { status: 400, error: 'Email and password required' };
      }
      let found = null;
      for (const u of users.values()) {
        if (u.email === body.email && u.password === body.password) {
          found = u;
          break;
        }
      }
      if (!found) {
        return { status: 401, error: 'Invalid credentials' };
      }
      const token = randomUUID();
      sessions.set(token, { token, userId: found.id, expiresAt: new Date(Date.now() + 86400000).toISOString() });
      return { status: 200, data: { user: { id: found.id, email: found.email, name: found.name }, token } };
    }

    // Auth: Session
    if (pathname === '/auth/session' && method === 'GET') {
      if (actor.type !== 'user') return { status: 401, error: 'Unauthorized' };
      return { status: 200, data: { user: actor.user } };
    }

    // Auth: Sign out
    if (pathname === '/auth/sign-out' && method === 'POST') {
      if (options.token) sessions.delete(options.token);
      return { status: 200, data: { success: true } };
    }

    // Bootstrap claim
    if (pathname === '/bootstrap/claim' && method === 'POST') {
      if (actor.type !== 'user') return { status: 401, error: 'Unauthorized' };
      if (adminBootstrapped) return { status: 403, error: 'Admin already bootstrapped' };
      adminBootstrapped = true;
      actor.user.systemRole = 'admin';
      return { status: 200, data: { bootstrapped: true, user: actor.user } };
    }

    // 3. Companies
    if (pathname === '/companies' && method === 'POST') {
      if (actor.type !== 'user') return { status: 401, error: 'Unauthorized' };
      if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return { status: 400, error: 'Company name required' };
      }
      if (body.name.length > 100) {
        return { status: 400, error: 'Company name exceeds 100 characters' };
      }
      const companyId = randomUUID();
      const prefix = body.prefix || body.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 16);
      const company = {
        id: companyId,
        name: body.name.trim(),
        prefix,
        requireBoardApprovalForNewAgents: body.requireBoardApprovalForNewAgents ?? false,
        createdAt: nowIso(),
      };
      companies.set(companyId, company);
      // Add creator as admin member
      const memberId = randomUUID();
      members.set(memberId, {
        id: memberId,
        companyId,
        userId: actor.userId,
        role: 'admin',
        customRoleId: null,
        customRoleVersion: null,
        permissions: [...PERMISSION_KEYS],
        createdAt: nowIso(),
      });
      return { status: 201, data: company };
    }

    if (pathname === '/companies' && method === 'GET') {
      if (actor.type !== 'user') return { status: 401, error: 'Unauthorized' };
      const userCompanies = [];
      for (const m of members.values()) {
        if (m.userId === actor.userId) {
          const comp = companies.get(m.companyId);
          if (comp) userCompanies.push(comp);
        }
      }
      return { status: 200, data: userCompanies };
    }

    const companyPatchMatch = pathname.match(/^\/companies\/([^/]+)$/);
    if (companyPatchMatch && method === 'PATCH') {
      const compId = companyPatchMatch[1];
      const comp = companies.get(compId);
      if (!comp) return { status: 404, error: 'Company not found' };
      if (body.name) comp.name = body.name;
      if (typeof body.requireBoardApprovalForNewAgents === 'boolean') {
        comp.requireBoardApprovalForNewAgents = body.requireBoardApprovalForNewAgents;
      }
      return { status: 200, data: comp };
    }

    if (companyPatchMatch && method === 'GET') {
      const compId = companyPatchMatch[1];
      const comp = companies.get(compId);
      if (!comp) return { status: 404, error: 'Company not found' };
      return { status: 200, data: comp };
    }

    // 4. Custom Roles API
    const rolesMatch = pathname.match(/^\/companies\/([^/]+)\/roles$/);
    if (rolesMatch && method === 'POST') {
      const compId = rolesMatch[1];
      if (!companies.has(compId)) return { status: 404, error: 'Company not found' };
      if (actor.type !== 'user' || actor.role !== 'admin') {
        return { status: 403, error: 'Admin permission required' };
      }
      const parsed = companyRoleDefinitionSchema.safeParse(body);
      if (!parsed.success) {
        return { status: 400, error: parsed.error.issues.map(i => i.message).join(', ') };
      }
      const roleId = randomUUID();
      const role = {
        id: roleId,
        companyId: compId,
        name: parsed.data.name,
        description: parsed.data.description,
        permissions: parsed.data.permissions,
        version: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      roles.set(roleId, role);
      return { status: 201, data: role };
    }

    if (rolesMatch && method === 'GET') {
      const compId = rolesMatch[1];
      if (!companies.has(compId)) return { status: 404, error: 'Company not found' };
      const compRoles = [...roles.values()].filter(r => r.companyId === compId);
      return { status: 200, data: compRoles };
    }

    const roleDetailMatch = pathname.match(/^\/companies\/([^/]+)\/roles\/([^/]+)$/);
    if (roleDetailMatch && method === 'GET') {
      const [, compId, roleId] = roleDetailMatch;
      const role = roles.get(roleId);
      if (!role || role.companyId !== compId) return { status: 404, error: 'Role not found' };
      const assignedCount = [...members.values()].filter(m => m.customRoleId === roleId).length;
      return { status: 200, data: { ...role, assignedCount } };
    }

    if (roleDetailMatch && method === 'PUT') {
      const [, compId, roleId] = roleDetailMatch;
      if (actor.type !== 'user' || actor.role !== 'admin') return { status: 403, error: 'Forbidden' };
      const role = roles.get(roleId);
      if (!role || role.companyId !== compId) return { status: 404, error: 'Role not found' };
      const parsed = updateCompanyRoleSchema.safeParse(body);
      if (!parsed.success) return { status: 400, error: parsed.error.issues.map(i => i.message).join(', ') };
      if (body.version !== role.version) {
        return { status: 409, error: `Version conflict: expected ${role.version}, got ${body.version}` };
      }
      role.name = parsed.data.name;
      role.description = parsed.data.description;
      role.permissions = parsed.data.permissions;
      role.version += 1;
      role.updatedAt = nowIso();
      return { status: 200, data: role };
    }

    if (roleDetailMatch && method === 'DELETE') {
      const [, compId, roleId] = roleDetailMatch;
      if (actor.type !== 'user' || actor.role !== 'admin') return { status: 403, error: 'Forbidden' };
      const role = roles.get(roleId);
      if (!role || role.companyId !== compId) return { status: 404, error: 'Role not found' };
      const parsed = deleteCompanyRoleSchema.safeParse(body || { version: role.version });
      if (!parsed.success) return { status: 400, error: parsed.error.issues.map(i => i.message).join(', ') };
      if (parsed.data.version !== role.version) {
        return { status: 409, error: `Version conflict: expected ${role.version}, got ${parsed.data.version}` };
      }
      // Safe Role Deletion: Check if assigned to any member or agent
      const assignedMembers = [...members.values()].filter(m => m.customRoleId === roleId);
      if (assignedMembers.length > 0) {
        return { status: 409, error: 'Conflict: Cannot delete role assigned to active members or agents' };
      }
      roles.delete(roleId);
      return { status: 204, data: null };
    }

    // Role Member Assignment
    const memberRoleMatch = pathname.match(/^\/companies\/([^/]+)\/members\/([^/]+)\/custom-role$/);
    if (memberRoleMatch && method === 'PUT') {
      const [, compId, memberId] = memberRoleMatch;
      if (actor.type !== 'user' || actor.role !== 'admin') return { status: 403, error: 'Forbidden' };
      const member = members.get(memberId);
      if (!member || member.companyId !== compId) return { status: 404, error: 'Member not found' };
      const parsed = assignCompanyRoleSchema.safeParse(body);
      if (!parsed.success) return { status: 400, error: parsed.error.issues.map(i => i.message).join(', ') };
      const role = roles.get(parsed.data.roleId);
      if (!role || role.companyId !== compId) return { status: 404, error: 'Role not found' };
      if (parsed.data.version !== role.version) {
        return { status: 409, error: `Version conflict: expected ${role.version}, got ${parsed.data.version}` };
      }
      member.customRoleId = role.id;
      member.customRoleVersion = role.version;
      member.permissions = [...role.permissions];
      return {
        status: 200,
        data: {
          memberId: member.id,
          roleId: role.id,
          name: role.name,
          permissions: member.permissions,
          appliedByUserId: actor.userId,
          appliedAt: nowIso(),
        },
      };
    }

    // 5. Agents API
    const agentsMatch = pathname.match(/^\/companies\/([^/]+)\/agents$/);
    if (agentsMatch && method === 'POST') {
      const compId = agentsMatch[1];
      if (!companies.has(compId)) return { status: 404, error: 'Company not found' };
      if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return { status: 400, error: 'Agent name required' };
      }
      // Check duplicate agent name in company
      for (const a of agents.values()) {
        if (a.companyId === compId && a.name === body.name.trim()) {
          return { status: 409, error: 'Agent name already exists in this company' };
        }
      }
      const agentId = randomUUID();
      const agent = {
        id: agentId,
        companyId: compId,
        name: body.name.trim(),
        role: body.role || 'general',
        title: body.title || null,
        icon: body.icon || 'bot',
        appearance: body.appearance || { color: '#6366f1' },
        capabilities: Array.isArray(body.capabilities) ? body.capabilities : (body.capabilities ? [body.capabilities] : []),
        reportsTo: body.reportsTo || null,
        runner: body.runner || 'legacy',
        adapterType: body.adapterType || 'codex_local',
        adapterConfig: body.adapterConfig || {},
        runtimeConfig: body.runtimeConfig || { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: false, maxConcurrentRuns: 1 } },
        budgetMonthlyCents: body.budgetMonthlyCents || 0,
        status: 'idle',
        lifecycleState: 'ready',
        createdAt: nowIso(),
      };
      agents.set(agentId, agent);
      // Register agent as company member
      const agentMemberId = randomUUID();
      members.set(agentMemberId, {
        id: agentMemberId,
        companyId: compId,
        userId: null,
        agentId: agent.id,
        role: 'agent',
        customRoleId: null,
        customRoleVersion: null,
        permissions: ['issues:read', 'comments:create'],
        createdAt: nowIso(),
      });
      return { status: 201, data: agent };
    }

    if (agentsMatch && method === 'GET') {
      const compId = agentsMatch[1];
      const compAgents = [...agents.values()].filter(a => a.companyId === compId);
      return { status: 200, data: compAgents };
    }

    const agentDetailMatch = pathname.match(/^\/agents\/([^/]+)$/);
    if (agentDetailMatch && method === 'GET') {
      const agentId = agentDetailMatch[1];
      const agent = agents.get(agentId);
      if (!agent) return { status: 404, error: 'Agent not found' };
      return { status: 200, data: agent };
    }

    if (agentDetailMatch && method === 'PATCH') {
      const agentId = agentDetailMatch[1];
      const agent = agents.get(agentId);
      if (!agent) return { status: 404, error: 'Agent not found' };
      if (body.runtimeConfig) agent.runtimeConfig = { ...agent.runtimeConfig, ...body.runtimeConfig };
      if (body.status) agent.status = body.status;
      if (body.lifecycleState) agent.lifecycleState = body.lifecycleState;
      return { status: 200, data: agent };
    }

    // 6. Projects API
    const projectsMatch = pathname.match(/^\/companies\/([^/]+)\/projects$/);
    if (projectsMatch && method === 'POST') {
      const compId = projectsMatch[1];
      if (!companies.has(compId)) return { status: 404, error: 'Company not found' };
      if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        return { status: 400, error: 'Project name required' };
      }
      const projectId = randomUUID();
      const conversationIssueId = randomUUID();
      const project = {
        id: projectId,
        companyId: compId,
        name: body.name.trim(),
        primaryWorkspaceId: null,
        createdAt: nowIso(),
      };
      projects.set(projectId, project);
      // Create singleton project conversation issue
      issues.set(conversationIssueId, {
        id: conversationIssueId,
        projectId,
        companyId: compId,
        parentId: null,
        title: `Rozmowa projektu: ${project.name}`,
        status: 'in_progress',
        assigneeAgentId: null,
        createdAt: nowIso(),
      });
      conversations.set(projectId, {
        issueId: conversationIssueId,
        projectId,
        companyId: compId,
        coordinatorAgentId: null,
        createdAt: nowIso(),
      });
      return { status: 201, data: project };
    }

    if (projectsMatch && method === 'GET') {
      const compId = projectsMatch[1];
      const compProjects = [...projects.values()].filter(p => p.companyId === compId);
      return { status: 200, data: compProjects };
    }

    // Workspaces
    const workspaceMatch = pathname.match(/^\/projects\/([^/]+)\/workspaces$/);
    if (workspaceMatch && method === 'POST') {
      const projectId = workspaceMatch[1];
      const project = projects.get(projectId);
      if (!project) return { status: 404, error: 'Project not found' };
      const wsId = randomUUID();
      const ws = { id: wsId, projectId, name: body.name || 'Default Workspace', cwd: body.cwd || '/tmp', isPrimary: body.isPrimary ?? false };
      workspaces.set(wsId, ws);
      if (ws.isPrimary) project.primaryWorkspaceId = wsId;
      return { status: 201, data: ws };
    }

    // Project Conversation
    const conversationMatch = pathname.match(/^\/projects\/([^/]+)\/conversation$/);
    if (conversationMatch && method === 'GET') {
      const projectId = conversationMatch[1];
      const conv = conversations.get(projectId);
      if (!conv) return { status: 404, error: 'Conversation not found for project' };
      return { status: 200, data: conv };
    }

    const coordinatorMatch = pathname.match(/^\/projects\/([^/]+)\/conversation\/coordinator$/);
    if (coordinatorMatch && method === 'PUT') {
      const projectId = coordinatorMatch[1];
      const conv = conversations.get(projectId);
      if (!conv) return { status: 404, error: 'Conversation not found' };
      if (!body?.agentId) return { status: 400, error: 'agentId required' };
      const agent = agents.get(body.agentId);
      if (!agent || agent.companyId !== conv.companyId) {
        return { status: 404, error: 'Agent not found in company' };
      }
      conv.coordinatorAgentId = agent.id;
      return { status: 200, data: conv };
    }

    // 7. Issues & Comments
    const issueMatch = pathname.match(/^\/issues\/([^/]+)$/);
    if (issueMatch && method === 'GET') {
      const issueId = issueMatch[1];
      const issue = issues.get(issueId);
      if (!issue) return { status: 404, error: 'Issue not found' };
      return { status: 200, data: issue };
    }

    if (issueMatch && method === 'PATCH') {
      const issueId = issueMatch[1];
      const issue = issues.get(issueId);
      if (!issue) return { status: 404, error: 'Issue not found' };
      if (body.status) issue.status = body.status;
      if (body.assigneeAgentId) issue.assigneeAgentId = body.assigneeAgentId;
      return { status: 200, data: issue };
    }

    // Company issues query
    const companyIssuesMatch = pathname.match(/^\/companies\/([^/]+)\/issues$/);
    if (companyIssuesMatch && method === 'GET') {
      const compId = companyIssuesMatch[1];
      const projectId = url.searchParams.get('projectId');
      let compIssues = [...issues.values()].filter(i => i.companyId === compId);
      if (projectId) compIssues = compIssues.filter(i => i.projectId === projectId);
      return { status: 200, data: compIssues };
    }

    if (companyIssuesMatch && method === 'POST') {
      const compId = companyIssuesMatch[1];
      if (!body?.title) return { status: 400, error: 'Title required' };
      if (body.idempotencyKey && idempotencyMap.has(body.idempotencyKey)) {
        return { status: 200, data: idempotencyMap.get(body.idempotencyKey) };
      }
      const issueId = randomUUID();
      const issue = {
        id: issueId,
        companyId: compId,
        projectId: body.projectId || null,
        parentId: body.parentId || null,
        title: body.title,
        status: body.status || 'todo',
        assigneeAgentId: body.assigneeAgentId || null,
        idempotencyKey: body.idempotencyKey || null,
        createdAt: nowIso(),
      };
      issues.set(issueId, issue);
      if (body.idempotencyKey) idempotencyMap.set(body.idempotencyKey, issue);
      return { status: 201, data: issue };
    }

    const commentsMatch = pathname.match(/^\/issues\/([^/]+)\/comments$/);
    if (commentsMatch && method === 'POST') {
      const issueId = commentsMatch[1];
      if (!issues.has(issueId)) return { status: 404, error: 'Issue not found' };
      if (!body?.body || typeof body.body !== 'string' || body.body.trim().length === 0) {
        return { status: 400, error: 'Comment body required' };
      }
      if (body.body.length > 50000) {
        return { status: 400, error: 'Comment body exceeds maximum size' };
      }
      const commentId = randomUUID();
      const authorType = actor.type === 'agent' ? 'agent' : 'user';
      const comment = {
        id: commentId,
        issueId,
        authorType,
        authorUserId: actor.userId || null,
        authorAgentId: actor.agentId || null,
        recipientAgentId: body.metadata?.recipientAgentId || null,
        body: body.body,
        metadata: body.metadata || {},
        createdAt: nowIso(),
      };
      comments.set(commentId, comment);
      bus.emit('issue.comment_created', { issueId, comment });
      return { status: 201, data: comment };
    }

    if (commentsMatch && method === 'GET') {
      const issueId = commentsMatch[1];
      const issueComments = [...comments.values()].filter(c => c.issueId === issueId);
      return { status: 200, data: issueComments };
    }

    // 8. Project History with microsecond cursor pagination
    const historyMatch = pathname.match(/^\/issues\/([^/]+)\/project-history$/);
    if (historyMatch && method === 'GET') {
      const issueId = historyMatch[1];
      const issue = issues.get(issueId);
      if (!issue) return { status: 404, error: 'Issue not found' };
      const conv = [...conversations.values()].find(c => c.issueId === issueId);
      const coordinatorId = conv?.coordinatorAgentId || null;

      // Collect entries (comments and child task status changes)
      const rawEntries = [];
      for (const c of comments.values()) {
        if (c.issueId === issueId) {
          rawEntries.push({
            id: c.id,
            kind: 'comment',
            issueId,
            createdAt: c.createdAt,
            body: c.body,
            authorType: c.authorType,
            authorAgentId: c.authorAgentId,
            authorUserId: c.authorUserId,
            recipientAgentId: c.recipientAgentId,
          });
        }
      }
      for (const child of issues.values()) {
        if (child.parentId === issueId) {
          rawEntries.push({
            id: `task-created-${child.id}`,
            kind: 'task',
            issueId: child.id,
            createdAt: child.createdAt,
            body: `Delegowanie · ${child.title}`,
            authorType: 'agent',
            authorAgentId: coordinatorId,
          });
          if (child.status === 'done') {
            rawEntries.push({
              id: `task-done-${child.id}`,
              kind: 'task',
              issueId: child.id,
              createdAt: new Date(new Date(child.createdAt).getTime() + 1000).toISOString(),
              body: `Zmiana statusu · done`,
              authorType: 'agent',
              authorAgentId: child.assigneeAgentId,
            });
          }
        }
      }

      // Classify entries using authentic classifyConversationEntry
      const entries = rawEntries.map(e => ({
        ...e,
        category: classifyConversationEntry(e, coordinatorId),
      })).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      // Cursor pagination
      const cursor = url.searchParams.get('cursor');
      const limit = Math.min(Number(url.searchParams.get('limit') || 50), 1000);
      let startIndex = 0;
      if (cursor) {
        try {
          const cursorIso = Buffer.from(cursor, 'base64').toString('utf8');
          if (!cursorIso || isNaN(new Date(cursorIso).getTime())) {
            return { status: 400, error: 'Invalid cursor format' };
          }
          startIndex = entries.findIndex(e => e.createdAt > cursorIso);
          if (startIndex === -1) startIndex = entries.length;
        } catch {
          return { status: 400, error: 'Invalid cursor decoding' };
        }
      }

      const paged = entries.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < entries.length;
      const nextCursor = hasMore
        ? Buffer.from(paged[paged.length - 1].createdAt).toString('base64')
        : null;

      return { status: 200, data: { entries: paged, nextCursor } };
    }

    // 9. Executor Selection API
    if (pathname === '/executor-selection' && method === 'POST') {
      const companyId = body?.companyId;
      const requiredCapabilities = body?.capabilities || [];
      const companyAgents = [...agents.values()].filter(a => a.companyId === companyId && a.status !== 'paused');
      if (companyAgents.length === 0) {
        return { status: 422, error: 'No available agents in company' };
      }
      let selected = companyAgents.find(a =>
        requiredCapabilities.some(c => a.capabilities.includes(c))
      );
      if (!selected) {
        selected = companyAgents.find(a => a.role === 'general') || companyAgents[0];
      }
      return {
        status: 200,
        data: {
          agentId: selected.id,
          name: selected.name,
          role: selected.role,
          rationale: `Matched based on capabilities: ${selected.capabilities.join(', ')}`,
          estimatedCostCents: '1.20',
        },
      };
    }

    // 10. Human-in-the-Loop Interaction Gates
    if (pathname === '/interactions' && method === 'POST') {
      if (!body?.title || !body?.type) return { status: 400, error: 'Title and type required' };
      const id = randomUUID();
      const interaction = {
        id,
        companyId: body.companyId,
        projectId: body.projectId,
        type: body.type, // 'task_suggestion' | 'action_confirmation'
        title: body.title,
        body: body.body || '',
        status: 'pending',
        resolvedByUserId: null,
        resolution: null,
        createdAt: nowIso(),
      };
      interactions.set(id, interaction);
      return { status: 201, data: interaction };
    }

    const resolveInteractionMatch = pathname.match(/^\/interactions\/([^/]+)\/resolve$/);
    if (resolveInteractionMatch && method === 'POST') {
      const id = resolveInteractionMatch[1];
      const inter = interactions.get(id);
      if (!inter) return { status: 404, error: 'Interaction not found' };
      if (inter.status !== 'pending') {
        return { status: 409, error: 'Interaction already resolved' };
      }
      // HUMAN-ONLY DECISION RULE
      if (actor.type !== 'user') {
        return { status: 403, error: 'Forbidden: Human decision required; agents cannot approve interaction gates' };
      }
      if (!['approved', 'rejected'].includes(body?.decision)) {
        return { status: 400, error: 'Invalid decision: must be approved or rejected' };
      }
      inter.status = body.decision;
      inter.resolvedByUserId = actor.userId;
      inter.resolution = body.comment || null;
      return { status: 200, data: inter };
    }

    // 11. Personalization
    if (pathname === '/personalization' && method === 'GET') {
      if (actor.type !== 'user') return { status: 401, error: 'Unauthorized' };
      const p = personalizations.get(actor.userId) || defaultPersonalization();
      return { status: 200, data: p };
    }

    if (pathname === '/personalization' && method === 'PUT') {
      if (actor.type !== 'user') return { status: 401, error: 'Unauthorized' };
      const parsed = personalizationSchema.safeParse(body);
      if (!parsed.success) {
        return { status: 400, error: parsed.error.issues.map(i => i.message).join(', ') };
      }
      personalizations.set(actor.userId, parsed.data);
      return { status: 200, data: parsed.data };
    }

    // 12. Workspace Instructions
    const instructionsMatch = pathname.match(/^\/workspaces\/([^/]+)\/instructions$/);
    if (instructionsMatch && method === 'GET') {
      const wsId = instructionsMatch[1];
      const inst = instructions.get(wsId) || { text: '', canEdit: actor.type === 'user' };
      return { status: 200, data: inst };
    }

    if (instructionsMatch && method === 'PUT') {
      const wsId = instructionsMatch[1];
      if (actor.type !== 'user') return { status: 403, error: 'Only human users can edit workspace instructions' };
      const parsed = workspaceInstructionSchema.safeParse(body);
      if (!parsed.success) {
        return { status: 400, error: parsed.error.issues.map(i => i.message).join(', ') };
      }
      const data = { text: parsed.data.text, canEdit: true };
      instructions.set(wsId, data);
      return { status: 200, data };
    }

    // 13. Profile Sync
    if (pathname === '/profile' && method === 'PATCH') {
      if (actor.type !== 'user') return { status: 401, error: 'Unauthorized' };
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.trim().length === 0) {
          return { status: 400, error: 'Display name cannot be empty' };
        }
        if (body.name.length > 100) {
          return { status: 400, error: 'Display name exceeds 100 chars' };
        }
        actor.user.name = body.name.trim();
      }
      if (body.avatarUrl !== undefined) {
        if (body.avatarUrl && typeof body.avatarUrl === 'string' && (body.avatarUrl.startsWith('javascript:') || body.avatarUrl.startsWith('data:'))) {
          return { status: 400, error: 'Invalid avatar URL protocol' };
        }
        actor.user.avatarUrl = body.avatarUrl;
      }
      bus.emit('company.member.profile_updated', { userId: actor.userId, name: actor.user.name, avatarUrl: actor.user.avatarUrl });
      return { status: 200, data: actor.user };
    }

    // Heartbeat Runs
    const runsMatch = pathname.match(/^\/companies\/([^/]+)\/heartbeat-runs$/);
    if (runsMatch && method === 'GET') {
      const compId = runsMatch[1];
      const agentId = url.searchParams.get('agentId');
      let compRuns = [...heartbeatRuns.values()].filter(r => r.companyId === compId);
      if (agentId) compRuns = compRuns.filter(r => r.agentId === agentId);
      return { status: 200, data: compRuns };
    }

    if (runsMatch && method === 'POST') {
      const compId = runsMatch[1];
      const runId = randomUUID();
      const run = {
        id: runId,
        companyId: compId,
        agentId: body.agentId,
        status: body.status || 'succeeded',
        contextSnapshot: body.contextSnapshot || {},
        durationMs: body.durationMs || 1500,
        inputTokens: body.inputTokens || 450,
        outputTokens: body.outputTokens || 220,
        costCents: body.costCents || '0.35',
        costStatus: body.costStatus || 'reported',
        createdAt: nowIso(),
      };
      heartbeatRuns.set(runId, run);
      return { status: 201, data: run };
    }

    return { status: 404, error: `Route not found: ${method} ${pathname}` };
  }

  // Realtime WebSocket channel simulation
  function connectWebSocket(token) {
    const actor = getActor({ token });
    if (actor.type !== 'user') {
      throw new Error('WebSocket connection rejected: 401 Unauthorized');
    }
    const ws = new EventEmitter();
    ws.actor = actor;
    ws.subscriptions = new Set();

    const commentListener = event => {
      ws.emit('message', JSON.stringify({ type: 'issue.comment_created', ...event }));
    };
    const profileListener = event => {
      ws.emit('message', JSON.stringify({ type: 'company.member.profile_updated', ...event }));
    };
    const presenceListener = event => {
      ws.emit('message', JSON.stringify({ type: 'project.conversation.presence', ...event }));
    };
    const typingListener = event => {
      ws.emit('message', JSON.stringify({ type: 'typing', ...event }));
    };

    bus.on('issue.comment_created', commentListener);
    bus.on('company.member.profile_updated', profileListener);
    bus.on('project.conversation.presence', presenceListener);
    bus.on('typing', typingListener);

    ws.send = rawData => {
      try {
        const payload = JSON.parse(rawData);
        if (payload.type === 'typing') {
          bus.emit('typing', { userId: actor.userId, active: !!payload.active });
        } else if (payload.type === 'presence') {
          bus.emit('project.conversation.presence', {
            companyId: payload.companyId,
            projectId: payload.projectId,
            users: [{ userId: actor.userId, typingUntil: Date.now() + 5000 }],
          });
        }
      } catch (err) {
        ws.emit('error', new Error('Malformed frame'));
      }
    };

    ws.close = () => {
      bus.off('issue.comment_created', commentListener);
      bus.off('company.member.profile_updated', profileListener);
      bus.off('project.conversation.presence', presenceListener);
      bus.off('typing', typingListener);
      ws.emit('close');
    };

    return ws;
  }

  return {
    request,
    connectWebSocket,
    stores: {
      users,
      sessions,
      companies,
      members,
      roles,
      projects,
      workspaces,
      conversations,
      issues,
      comments,
      agents,
      interactions,
      personalizations,
      instructions,
      heartbeatRuns,
    },
  };
}

/**
 * Validates sensitive private file paths according to COSGRAL security rules:
 * Path must be strictly outside the repository root.
 */
export function validatePrivateAcceptancePath(filePath) {
  const normalizedFile = resolve(filePath);
  const normalizedRepo = resolve(REPO_ROOT);
  const rel = relative(normalizedRepo, normalizedFile);
  const isOutside = rel.startsWith('..') || isAbsolute(rel);
  if (!isOutside) {
    throw new Error('Security violation: private state or credentials file cannot be inside repository');
  }
  return normalizedFile;
}

/**
 * Checks Git worktree path formatting according to contract:
 * `worktrees/cosgral/<issueId>/<agentId>`
 */
export function validateWorktreePath(issueId, agentId) {
  if (!issueId || !agentId) throw new Error('issueId and agentId required');
  if (issueId.includes('..') || agentId.includes('..')) {
    throw new Error('Path traversal detected in worktree path');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(issueId) || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    throw new Error('Invalid characters in worktree identifiers');
  }
  return `worktrees/cosgral/${issueId}/${agentId}`;
}
