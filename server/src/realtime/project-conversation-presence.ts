import type { ProjectConversationPresence } from "@paperclipai/shared";
import { and, eq } from "drizzle-orm";
import { companyMemberships, instanceUserRoles, issues, projectConversations, projects, type Db } from "@paperclipai/db";
import { authorizationService, type AuthorizationActor } from "../services/authorization.js";

/** Same project/issue read boundary as shared conversation comments for humans.
 * Typing additionally requires comment authority; no comment, activity or wake is written. */
export async function authorizeProjectPresence(db: Db, actor: AuthorizationActor, companyId: string, projectId: string, typing: boolean) {
  if (actor.type !== "board" || !actor.userId || actor.source === "local_implicit") return false;
  const access = authorizationService(db);
  if (typing) {
    const [member] = await db.select({ role: companyMemberships.membershipRole }).from(companyMemberships).where(and(
      eq(companyMemberships.companyId, companyId), eq(companyMemberships.principalType, "user"),
      eq(companyMemberships.principalId, actor.userId), eq(companyMemberships.status, "active"))).limit(1);
    if (!member) return false;
    if (member.role === "viewer") {
      const [admin] = actor.source === "cloud_tenant" ? [] : await db.select({ id: instanceUserRoles.id }).from(instanceUserRoles)
        .where(and(eq(instanceUserRoles.userId, actor.userId), eq(instanceUserRoles.role, "instance_admin"))).limit(1);
      if (!admin) return false;
    }
  }
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.companyId, companyId), eq(projects.id, projectId))).limit(1);
  if (!project || !(await access.decide({ actor, action: "project:read", resource: { type: "project", companyId, projectId } })).allowed) return false;
  const [conversation] = await db.select({ issueId: issues.id, status: issues.status, assigneeAgentId: issues.assigneeAgentId, assigneeUserId: issues.assigneeUserId }).from(projectConversations)
    .innerJoin(issues, and(eq(issues.id, projectConversations.issueId), eq(issues.companyId, projectConversations.companyId)))
    .where(and(eq(projectConversations.companyId, companyId), eq(projectConversations.projectId, projectId))).limit(1);
  return !conversation || (await access.decide({ actor, action: typing ? "issue:comment" : "issue:read",
    resource: { type: "issue", companyId, ...conversation } })).allowed;
}

interface Socket { readyState: number; bufferedAmount?: number; send(data: string): void; close(code?: number, reason?: string): void }
interface Peer { socket: Socket; userId: string; typingUntil: number; authorize: (typing: boolean) => Promise<boolean> }

/** Per-server ephemeral rooms, separate from durable company live-event delivery. */
export function createProjectConversationPresence() {
  const rooms = new Map<string, Set<Peer>>();
  const work = new Map<string, Promise<void>>();
  const enqueue = (key: string, fn: () => Promise<void>) => {
    const next = (work.get(key) ?? Promise.resolve()).then(fn).catch(() => {});
    work.set(key, next);
    void next.then(() => { if (work.get(key) === next) work.delete(key); });
  };
  async function publish(key: string, companyId: string, projectId: string) {
    const room = rooms.get(key);
    if (!room) return;
    await Promise.all([...room].map(async peer => {
      try { if (await peer.authorize(false)) return; } catch { /* Fail closed. */ }
      room.delete(peer); peer.socket.close(1008, "forbidden");
    }));
    if (!room.size) { rooms.delete(key); return; }
    const users = new Map<string, number>();
    for (const peer of room) users.set(peer.userId, Math.max(users.get(peer.userId) ?? 0, peer.typingUntil));
    const snapshot: ProjectConversationPresence = { type: "project.conversation.presence", companyId, projectId,
      users: [...users].map(([userId, typingUntil]) => ({ userId, typingUntil })) };
    const frame = JSON.stringify(snapshot);
    for (const { socket } of room) {
      if (socket.readyState !== 1) continue;
      if ((socket.bufferedAmount ?? 0) > 65536) { socket.close(1013, "slow client"); continue; }
      try { socket.send(frame); } catch { socket.close(); }
    }
  }
  return {
    connect(socket: Socket, companyId: string, projectId: string, userId: string, authorize: Peer["authorize"]) {
      const key = `${companyId}:${projectId}`;
      const peer: Peer = { socket, userId, authorize, typingUntil: 0 };
      let closed = false;
      let pending = false;
      let lastTyping = -Infinity;
      enqueue(key, async () => {
        if (closed) return;
        const room = rooms.get(key) ?? new Set<Peer>();
        rooms.set(key, room); room.add(peer);
        await publish(key, companyId, projectId);
      });
      return {
        receive(raw: string) {
          const now = Date.now();
          if (closed || pending || raw.length > 256) return;
          let value: unknown;
          try { value = JSON.parse(raw); } catch { return; }
          if (!value || typeof value !== "object") return;
          const frame = value as Record<string, unknown>;
          if (frame.type !== "typing" || typeof frame.active !== "boolean" || Object.keys(frame).length !== 2) return;
          if (!frame.active && peer.typingUntil === 0) return;
          if (frame.active && now - lastTyping < 1500) return;
          if (frame.active) lastTyping = now;
          pending = true;
          enqueue(key, async () => {
            pending = false;
            if (closed) return;
            try {
              if (!(await authorize(true))) { peer.typingUntil = 0; socket.close(1008, "forbidden"); return; }
              peer.typingUntil = frame.active ? Date.now() + 5000 : 0;
              await publish(key, companyId, projectId);
            } catch { socket.close(1008, "forbidden"); }
          });
        },
        close() {
          closed = true;
          enqueue(key, async () => {
            rooms.get(key)?.delete(peer);
            await publish(key, companyId, projectId);
          });
        },
      };
    },
    settled: () => Promise.all([...work.values()]),
  };
}
