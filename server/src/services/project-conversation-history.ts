import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { activityLog, heartbeatRuns, issueComments, type Db } from "@paperclipai/db";
import { classifyConversationEntry, type ConversationEntry, type ConversationHistoryPage } from "@paperclipai/shared/project-conversation-history";
import { redactCurrentUserText } from "../log-redaction.js";
import { instanceSettingsService } from "./instance-settings.js";

type Scope = { id: string; title: string; identifier: string | null };
/** Authorized read projection, no second store. Caller supplies only readable children. */
export async function projectConversationHistory(db: Db, input: {
  companyId: string; conversationId: string; coordinatorId: string | null;
  children: Scope[]; cursor?: { at: string; id: string };
  canReadRun: (run: typeof heartbeatRuns.$inferSelect) => Promise<boolean>;
}): Promise<ConversationHistoryPage> {
  const ids = input.children.map(c => c.id);
  const titles = new Map(input.children.map(c => [c.id, `${c.identifier ?? "Zadanie"}: ${c.title}`]));
  const before = (at: typeof issueComments.createdAt, id: typeof issueComments.id) => input.cursor
    ? sql`(${at}, ${id}::text) < (${input.cursor.at}::timestamptz, ${input.cursor.id})` : undefined;
  const runAt = sql`coalesce(${heartbeatRuns.finishedAt}, ${heartbeatRuns.createdAt})`;
  const limit = 41;
  const [comments, events, runs] = await Promise.all([
    ids.length ? db.select({ row: issueComments, stamp: sql<string>`${issueComments.createdAt}::text` }).from(issueComments).where(and(
      eq(issueComments.companyId, input.companyId), inArray(issueComments.issueId, ids), isNull(issueComments.deletedAt), before(issueComments.createdAt, issueComments.id),
    )).orderBy(desc(issueComments.createdAt), desc(issueComments.id)).limit(limit) : [],
    ids.length ? db.select({ row: activityLog, stamp: sql<string>`${activityLog.createdAt}::text` }).from(activityLog).where(and(
      eq(activityLog.companyId, input.companyId), eq(activityLog.entityType, "issue"), inArray(activityLog.entityId, ids),
      sql`(${activityLog.action} = 'issue.created' or (${activityLog.action} = 'issue.updated' and ${activityLog.details}->>'status' is not null))`,
      input.cursor ? sql`(${activityLog.createdAt}, ${activityLog.id}::text) < (${input.cursor.at}::timestamptz, ${input.cursor.id})` : undefined,
    )).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(limit) : [],
    db.select({ row: heartbeatRuns, stamp: sql<string>`${runAt}::text` }).from(heartbeatRuns).where(and(
      eq(heartbeatRuns.companyId, input.companyId), inArray(heartbeatRuns.issueId, [input.conversationId, ...ids]), inArray(heartbeatRuns.status, ["failed", "timed_out"]),
      input.cursor ? sql`(${runAt}, ${heartbeatRuns.id}::text) < (${input.cursor.at}::timestamptz, ${input.cursor.id})` : undefined,
    )).orderBy(desc(runAt), desc(heartbeatRuns.id)).limit(limit),
  ]);
  const censor = (await instanceSettingsService(db).getGeneral()).censorUsernameInLogs;
  type Candidate = { entry: ConversationEntry; stamp: string; run?: typeof heartbeatRuns.$inferSelect };
  const candidates: Candidate[] = [
    ...comments.map(({ row: c, stamp }) => ({ stamp, entry: { id: c.id, kind: "comment" as const, issueId: c.issueId, createdAt: c.createdAt.toISOString(), body: redactCurrentUserText(c.body, { enabled: censor }), authorType: c.authorType, authorAgentId: c.authorAgentId, authorUserId: c.authorUserId, messageKind: c.metadata?.messageKind, recipientAgentId: c.metadata?.recipientAgentId } })),
    ...events.map(({ row: e, stamp }) => ({ stamp, entry: { id: e.id, kind: "task" as const, issueId: e.entityId, createdAt: e.createdAt.toISOString(), body: `${e.action === "issue.created" ? "Delegowanie" : "Zmiana statusu"} · ${titles.get(e.entityId)} · ${e.details?.status ?? "utworzone"}`, authorAgentId: e.actorType === "agent" ? e.actorId : null, authorUserId: e.actorType === "user" ? e.actorId : null } })),
    ...runs.map(({ row: r, stamp }) => ({ stamp, run: r, entry: { id: r.id, kind: "error" as const, issueId: r.issueId!, createdAt: (r.finishedAt ?? r.createdAt).toISOString(), body: `Wykonanie agenta: ${r.status}. Otwórz zadanie, aby sprawdzić błąd.`, authorAgentId: r.agentId } })),
  ];
  // ISO timestamps with microseconds normalized by PostgreSQL; keep the raw stamp
  // in the cursor so JS millisecond truncation cannot skip same-millisecond rows.
  // localeCompare ignores/reorders punctuation: a whole second could sort after
  // its later fractional timestamp. ASCII matches PostgreSQL's uniform text format.
  candidates.sort((a, b) => a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : a.entry.id < b.entry.id ? 1 : a.entry.id > b.entry.id ? -1 : 0);
  const page = candidates.slice(0, 40);
  const visible = await Promise.all(page.map(async c => !c.run || await input.canReadRun(c.run)));
  const last = page.at(-1);
  return { entries: page.filter((_, i) => visible[i]).map(({ entry }) => ({ ...entry, category: classifyConversationEntry(entry, input.coordinatorId) })),
    nextCursor: candidates.length > 40 && last ? JSON.stringify({ at: last.stamp, id: last.entry.id }) : null };
}
