// COSGRAL W6-BE1: several threads per agent (spec-w6.md 1A; decisions Q1-Q5, Q14).
//
// The database already keeps every message, turn, provider session and read mark per thread (`thread_id`), and the agent
// record names one thread: the ACTIVE one. This store adds what a person sets on a thread (title, archive, where a branch
// came from) in `projection_thread_meta`, and the calls that create, switch, archive, restore, delete and branch threads.
// A thread from before W6 has no row there: it is an ordinary thread with an automatic title. The conversation an agent
// already had is its first thread; nothing is moved or copied.
//
// What only the running program knows (which thread a turn runs in, which cards are open) comes in as `live`.

import { randomUUID } from "node:crypto";
import {
  autoThreadTitle,
  type BotSummary,
  type BranchThreadInput,
  branchThreadTitle,
  type ConversationMessage,
  type CreateThreadInput,
  type DeleteThreadInput,
  type DeleteThreadUndoResult,
  NEW_THREAD_TITLE,
  newPendingThreadDelete,
  nextActiveThreadId,
  normalizeThreadTitle,
  type PendingThreadDelete,
  type RenameThreadInput,
  THREAD_LIMITS,
  THREAD_UNDO_WINDOW_MS,
  type ThreadInput,
  type ThreadList,
  type ThreadSummary,
  threadStateOf,
  threadTitleProblem,
  undoDeleteProblem,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { ConversationReadStore } from "./conversation-read-store";
import type { MailboxStore } from "./mailbox-store";
import type { OpenBotDatabase } from "./openbot-database";

/** The window is one person's: its read marks belong to this member (see `readConversationFor`). */
const LOCAL_MEMBER = "local-owner";

export interface ThreadBots {
  list(): BotSummary[];
  ensureThreadId(id: string): Promise<string>;
  setActiveThread(id: string, threadId: string): Promise<void>;
}

/** What only the running program knows. */
export interface ThreadLive {
  /** The thread a turn of this agent runs in now (also after the person switched away); null when none runs. */
  runningThread(botId: string): string | null;
  /** Open "Needs you" cards of this agent, per thread. */
  needsYou(botId: string): ReadonlyMap<string, number>;
}

export interface ThreadStoreDeps {
  database: OpenBotDatabase;
  bots: ThreadBots;
  mailbox: MailboxStore;
  reads: ConversationReadStore;
  live: ThreadLive;
  /** Threads one agent may have (default THREAD_LIMITS.threadsPerAgent). */
  maxThreads?: number;
  now?: () => Date;
}

interface Meta {
  id: string;
  agentId: string;
  title: string;
  archivedAt: string | null;
  parentThreadId: string | null;
  parentTitle: string | null;
  branchedFromMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The facts of one agent that every thread summary needs, read once. */
interface ThreadContext {
  counts: Map<string, { queued: number; running: number }>;
  paused: boolean;
  running: string | null;
  cards: ReadonlyMap<string, number>;
}

export class ThreadStore {
  readonly #deps: ThreadStoreDeps;

  constructor(deps: ThreadStoreDeps) {
    this.#deps = deps;
  }

  get #db() {
    return this.#deps.database.connection;
  }

  #now(): string {
    return (this.#deps.now?.() ?? new Date()).toISOString();
  }

  #max(): number {
    return this.#deps.maxThreads ?? THREAD_LIMITS.threadsPerAgent;
  }

  /** Run once when the program starts: every message from before threads belongs to the thread the agent has. */
  async initialize(): Promise<void> {
    // An agent that was sent a message but never started has no thread yet: it gets its first one now, so that message
    // is not shown in every thread the person makes later. (Agents with nothing waiting are left alone.)
    for (const botId of this.#deps.mailbox.unstampedRecipients()) await this.activeThreadId(botId);
    await this.#deps.mailbox.stampLegacyThreads(
      (botId) => this.#deps.bots.list().find((bot) => bot.id === botId)?.threadId ?? null,
    );
  }

  /** The thread a new message for this agent belongs to (the active one); null for an agent that does not exist. */
  async activeThreadId(botId: string): Promise<string | null> {
    const bot = this.#deps.bots.list().find((candidate) => candidate.id === botId);
    if (!bot) return null;
    return bot.threadId ?? (await this.#deps.bots.ensureThreadId(botId));
  }

  async list(botId: string): Promise<ThreadList> {
    const bot = await this.#prepare(botId);
    const summaries = this.#summaries(bot);
    return { botId, activeThreadId: bot.threadId, threads: summaries };
  }

  /** One thread, for a light activity update; null when it does not exist. */
  summary(botId: string, threadId: string): ThreadSummary | null {
    const bot = this.#deps.bots.list().find((candidate) => candidate.id === botId);
    const meta = bot ? this.#knownMeta(bot, threadId) : null;
    return bot && meta ? this.#summary(bot, meta, this.#context(bot)) : null;
  }

  /** Whether a thread belongs to this agent, and whether it is archived. Cheap: reads no history. Null when it does not exist. */
  lookup(botId: string, threadId: string): { archived: boolean } | null {
    const bot = this.#deps.bots.list().find((candidate) => candidate.id === botId);
    const meta = bot ? this.#knownMeta(bot, threadId) : null;
    return meta ? { archived: meta.archivedAt !== null } : null;
  }

  /** The title of one thread without reading its history (for the agent row); null when it does not exist. */
  title(botId: string, threadId: string): string | null {
    const bot = this.#deps.bots.list().find((candidate) => candidate.id === botId);
    const meta = bot ? this.#knownMeta(bot, threadId) : null;
    if (!meta) return null;
    if (meta.title) return meta.title;
    if (meta.parentTitle) return branchThreadTitle(meta.parentTitle);
    return autoThreadTitle(this.#deps.mailbox.firstUserText(botId, threadId) ?? "") || NEW_THREAD_TITLE;
  }

  /** The row of a thread of this agent; a thread from before W6 (no row yet) gets one when it is asked about. */
  #knownMeta(bot: BotSummary, threadId: string): Meta | null {
    const existing = this.#meta(threadId);
    if (existing) return existing.agentId === bot.id && !this.#isPending(threadId) ? existing : null;
    const stored = this.#db
      .prepare("SELECT created_at FROM projection_threads WHERE thread_id = ? AND agent_id = ?")
      .get(threadId, bot.id);
    if (!isDynamicRecord(stored) && bot.threadId !== threadId) return null;
    const createdAt = isDynamicRecord(stored) && isString(stored.created_at) ? stored.created_at : this.#now();
    this.#insert({ id: threadId, agentId: bot.id, title: "", createdAt });
    return this.#meta(threadId);
  }

  async create(input: CreateThreadInput): Promise<ThreadList> {
    const problem = threadTitleProblem(input.title ?? "");
    if (problem) throw new Error(problem);
    const bot = await this.#prepare(input.botId);
    this.#assertRoom(bot.id);
    await this.#addAndActivate(bot.id, { title: normalizeThreadTitle(input.title ?? "") });
    return this.list(bot.id);
  }

  async rename(input: RenameThreadInput): Promise<ThreadList> {
    const problem = threadTitleProblem(input.title);
    if (problem) throw new Error(problem);
    const bot = await this.#prepare(input.botId);
    const meta = this.#require(bot.id, input.threadId);
    this.#update(meta.id, { title: normalizeThreadTitle(input.title), updatedAt: this.#now() });
    return this.list(bot.id);
  }

  /**
   * Hides the thread. A turn that runs in it finishes (nothing stops it); nothing new reaches it because only the
   * active thread takes messages and an archived thread cannot be active.
   */
  async archive(input: ThreadInput): Promise<ThreadList> {
    const bot = await this.#prepare(input.botId);
    const meta = this.#require(bot.id, input.threadId);
    if (!meta.archivedAt) {
      const at = this.#now();
      this.#update(meta.id, { archivedAt: at, updatedAt: at });
      if (bot.threadId === meta.id) await this.#moveActiveOn(bot.id, meta.id);
    }
    return this.list(bot.id);
  }

  async restore(input: ThreadInput): Promise<ThreadList> {
    const bot = await this.#prepare(input.botId);
    const meta = this.#require(bot.id, input.threadId);
    if (meta.archivedAt) this.#update(meta.id, { archivedAt: null, updatedAt: this.#now() });
    return this.list(bot.id);
  }

  async select(input: ThreadInput): Promise<ThreadList> {
    const bot = await this.#prepare(input.botId);
    const meta = this.#require(bot.id, input.threadId);
    if (meta.archivedAt) throw new Error("Restore the thread first.");
    await this.#deps.bots.setActiveThread(bot.id, meta.id);
    return this.list(bot.id);
  }

  /** Removes the thread, its history, its queue and its traces. Refused without `confirm: true`. */
  async delete(input: DeleteThreadInput): Promise<ThreadList> {
    // The type says `true`; a call from the window may still say anything.
    if (!isDynamicRecord(input) || input.confirm !== true) {
      throw new Error("Deleting a thread for good needs confirmation.");
    }
    const bot = await this.#prepare(input.botId);
    // "Delete now" also works on a thread that waits in the undo window.
    const meta = this.#requireAny(bot.id, input.threadId);
    if (this.#running(bot.id, meta.id)) throw new Error("A turn is running in this thread. Stop it first.");
    // The agent must not point at a thread that is about to disappear.
    if (bot.threadId === meta.id) await this.#moveActiveOn(bot.id, meta.id);
    await this.#deps.mailbox.deleteThreadData(bot.id, meta.id);
    this.#deleteRows(bot.id, meta.id);
    return this.list(bot.id);
  }

  // --- COSGRAL W12 (BE-K): delete with undo ---

  /**
   * Hides the thread for the undo window and removes nothing: history, queue, cards and the rest stay as they are, so `unhide` brings back
   * the same thread. Same refusals as `delete`. The thread is removed for good by `delete` (the service calls it when the window ends).
   */
  async hide(input: DeleteThreadInput, windowMs: number = THREAD_UNDO_WINDOW_MS): Promise<DeleteThreadUndoResult> {
    if (!isDynamicRecord(input) || input.confirm !== true) {
      throw new Error("Deleting a thread for good needs confirmation.");
    }
    const bot = await this.#prepare(input.botId);
    const meta = this.#require(bot.id, input.threadId);
    if (this.#running(bot.id, meta.id)) throw new Error("A turn is running in this thread. Stop it first.");
    const title = this.#displayTitle(bot.id, meta);
    const wasActive = bot.threadId === meta.id;
    if (wasActive) await this.#moveActiveOn(bot.id, meta.id);
    const pending = newPendingThreadDelete(
      { botId: bot.id, threadId: meta.id, title, wasActive },
      this.#nowDate(),
      windowMs,
    );
    this.#pendingTable()
      .prepare(
        `INSERT OR REPLACE INTO projection_thread_pending_delete (thread_id, agent_id, title, was_active, deleted_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        pending.threadId,
        pending.botId,
        pending.title,
        pending.wasActive ? 1 : 0,
        pending.deletedAt,
        pending.expiresAt,
      );
    return { list: await this.list(bot.id), pending };
  }

  /** Brings a hidden thread back. It is shown again when it was the shown one. Refused when the time is out or the agent has no room. */
  async unhide(input: ThreadInput): Promise<ThreadList> {
    const bot = await this.#prepare(input.botId);
    const pending = this.#pendingOf(input.threadId, bot.id);
    const problem = undoDeleteProblem(pending, this.#nowDate(), this.hasRoom(bot.id), this.#max());
    if (problem || !pending) throw new Error(problem ?? "There is nothing to undo for this thread.");
    this.#pendingTable()
      .prepare("DELETE FROM projection_thread_pending_delete WHERE thread_id = ?")
      .run(pending.threadId);
    if (pending.wasActive) await this.#deps.bots.setActiveThread(bot.id, pending.threadId);
    return this.list(bot.id);
  }

  /** The hidden threads that can still be brought back (of one agent, or of all), newest first. */
  listPending(botId?: string): PendingThreadDelete[] {
    const now = this.#nowDate().toISOString();
    return this.#pendingRows(botId)
      .filter((row) => row.expiresAt > now)
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  /** The hidden threads whose time is out (of agents that still exist): the service removes them for good. */
  expiredPending(): PendingThreadDelete[] {
    const now = this.#nowDate().toISOString();
    const known = new Set(this.#deps.bots.list().map((bot) => bot.id));
    return this.#pendingRows().filter((row) => row.expiresAt <= now && known.has(row.botId));
  }

  #nowDate(): Date {
    return this.#deps.now?.() ?? new Date();
  }

  #pendingReady = false;

  /** The connection, with the table of hidden threads made (once). */
  #pendingTable() {
    if (!this.#pendingReady) {
      this.#db.exec(`
        CREATE TABLE IF NOT EXISTS projection_thread_pending_delete (
          thread_id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          title TEXT NOT NULL,
          was_active INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
      `);
      this.#pendingReady = true;
    }
    return this.#db;
  }

  #pendingRows(botId?: string): PendingThreadDelete[] {
    const statement = this.#pendingTable().prepare(
      botId === undefined
        ? "SELECT * FROM projection_thread_pending_delete"
        : "SELECT * FROM projection_thread_pending_delete WHERE agent_id = ?",
    );
    return (botId === undefined ? statement.all() : statement.all(botId)).filter(isDynamicRecord).map(toPending);
  }

  #pendingOf(threadId: string, botId: string): PendingThreadDelete | null {
    return this.#pendingRows(botId).find((row) => row.threadId === threadId) ?? null;
  }

  #isPending(threadId: string): boolean {
    return isDynamicRecord(
      this.#pendingTable()
        .prepare("SELECT 1 AS found FROM projection_thread_pending_delete WHERE thread_id = ?")
        .get(threadId),
    );
  }

  /** The threads of the agent that are not hidden in the undo window. */
  #visibleRows(botId: string): Meta[] {
    const hidden = new Set(this.#pendingRows(botId).map((row) => row.threadId));
    return this.#metaRows(botId).filter((meta) => !hidden.has(meta.id));
  }

  /** A new thread with the history of `threadId` up to and including `fromMessageId`; the original is not touched. */
  async branch(input: BranchThreadInput): Promise<ThreadList> {
    const problem = threadTitleProblem(input.title ?? "");
    if (problem) throw new Error(problem);
    const bot = await this.#prepare(input.botId);
    const source = this.#require(bot.id, input.threadId);
    const history = this.#deps.database.readConversation(bot.id, source.id).messages;
    const index = history.findIndex((message) => message.id === input.fromMessageId);
    if (index < 0) throw new Error("That message is not in this thread.");
    this.#assertRoom(bot.id);
    const copied = history.slice(0, index + 1).map(copyForBranch);
    const created = await this.#addAndActivate(bot.id, {
      title: normalizeThreadTitle(input.title ?? ""),
      parent: { id: source.id, title: this.#displayTitle(bot.id, source), messageId: input.fromMessageId },
    });
    const snapshot = this.#deps.database.persistConversation(
      { botId: bot.id, threadId: created, activeTurnId: null, revision: 0, messages: copied },
      "thread.branched",
      { fromThreadId: source.id, fromMessageId: input.fromMessageId },
    );
    // What was copied is history the person has read.
    const last = copied.at(-1);
    if (last) this.#deps.reads.markRead(LOCAL_MEMBER, snapshot, last.id);
    return this.list(bot.id);
  }

  /** A branch whose agent has not been told yet what happened before: it needs a hand-over of the copied history. */
  needsHistoryHandoff(threadId: string): boolean {
    const meta = this.#meta(threadId);
    if (!meta?.branchedFromMessageId) return false;
    if (this.#deps.database.listProviderSessions(threadId).length > 1) return false;
    const owner = this.#deps.bots.list().find((bot) => bot.id === meta.agentId);
    return owner ? this.#deps.database.readConversation(owner.id, threadId).messages.length > 0 : false;
  }

  // --- the pieces ---

  async #prepare(botId: string): Promise<BotSummary & { threadId: string }> {
    const known = this.#deps.bots.list().find((candidate) => candidate.id === botId);
    if (!known) throw new Error(`Unknown agent: ${botId}.`);
    const threadId = known.threadId ?? (await this.#deps.bots.ensureThreadId(botId));
    this.#ensureMeta(botId, threadId);
    const bot = this.#deps.bots.list().find((candidate) => candidate.id === botId) ?? known;
    return { ...bot, threadId };
  }

  /** Every thread of the agent gets a row (threads from before W6 have none). */
  #ensureMeta(botId: string, activeThreadId: string): void {
    const known = new Set(this.#metaRows(botId).map((row) => row.id));
    const rows = this.#db
      .prepare("SELECT thread_id, created_at FROM projection_threads WHERE agent_id = ?")
      .all(botId)
      .filter(isDynamicRecord);
    const found = new Map(rows.map((row) => [text(row, "thread_id"), text(row, "created_at")]));
    if (!found.has(activeThreadId)) found.set(activeThreadId, this.#now());
    for (const [id, createdAt] of found) {
      if (known.has(id)) continue;
      this.#insert({ id, agentId: botId, title: "", createdAt });
    }
  }

  /** One more thread may be made for this agent (a branch makes one). */
  hasRoom(botId: string): boolean {
    return this.#visibleRows(botId).length < this.#max();
  }

  #assertRoom(botId: string): void {
    if (this.#visibleRows(botId).length >= this.#max()) throw new Error(`An agent has at most ${this.#max()} threads.`);
  }

  #require(botId: string, threadId: string): Meta {
    const meta = this.#requireAny(botId, threadId);
    // A thread in the undo window (W12 BE-K) is hidden: nothing but undo and "delete now" can reach it.
    if (this.#isPending(threadId)) throw new Error("Unknown thread.");
    return meta;
  }

  #requireAny(botId: string, threadId: string): Meta {
    const meta = this.#meta(threadId);
    if (!meta || meta.agentId !== botId) throw new Error("Unknown thread.");
    return meta;
  }

  #running(botId: string, threadId: string): boolean {
    return (
      this.#deps.live.runningThread(botId) === threadId ||
      (this.#deps.mailbox.threadQueueCounts(botId).get(threadId)?.running ?? 0) > 0
    );
  }

  /** The thread left (archived or deleted): the newest other open thread, else a new empty one. */
  async #moveActiveOn(botId: string, leavingId: string): Promise<void> {
    const bot = this.#deps.bots.list().find((candidate) => candidate.id === botId);
    if (!bot) return;
    const nextId = nextActiveThreadId(this.#summaries(bot), leavingId);
    if (nextId) {
      await this.#deps.bots.setActiveThread(botId, nextId);
      return;
    }
    await this.#addAndActivate(botId, { title: "" });
  }

  async #addAndActivate(
    botId: string,
    input: { title: string; parent?: { id: string; title: string; messageId: string } },
  ): Promise<string> {
    const id = `openbot-thread-${randomUUID()}`;
    this.#insert({
      id,
      agentId: botId,
      title: input.title,
      parentThreadId: input.parent?.id ?? null,
      parentTitle: input.parent?.title ?? null,
      branchedFromMessageId: input.parent?.messageId ?? null,
      createdAt: this.#now(),
    });
    // Making it active also gives it its row in the thread projection (the agent record names it).
    await this.#deps.bots.setActiveThread(botId, id);
    return id;
  }

  #deleteRows(botId: string, threadId: string): void {
    this.#deps.database.dispatch(
      `thread:delete:${randomUUID()}`,
      [
        {
          aggregateType: "thread-deleted",
          aggregateId: botId,
          eventType: "thread.deleted",
          payload: { threadId },
        },
      ],
      (db) => {
        // Nothing of the thread is kept, also not in the event log: its events and its read marks go.
        db.prepare(
          `DELETE FROM orchestration_command_receipts WHERE command_id IN (
             SELECT DISTINCT command_id FROM orchestration_events
             WHERE aggregate_id = ? OR substr(aggregate_id, 1, length(?) + 1) = ? || ':'
           )`,
        ).run(threadId, threadId, threadId);
        db.prepare(
          "DELETE FROM orchestration_events WHERE aggregate_id = ? OR substr(aggregate_id, 1, length(?) + 1) = ? || ':'",
        ).run(threadId, threadId, threadId);
        db.prepare("DELETE FROM projection_threads WHERE thread_id = ? AND agent_id = ?").run(threadId, botId);
        db.prepare("DELETE FROM projection_thread_meta WHERE thread_id = ?").run(threadId);
        db.prepare("DELETE FROM projection_thread_pending_delete WHERE thread_id = ?").run(threadId);
        // A branch keeps the name of its parent, not the link.
        db.prepare("UPDATE projection_thread_meta SET parent_thread_id = NULL WHERE parent_thread_id = ?").run(
          threadId,
        );
        return null;
      },
    );
  }

  // --- summaries ---

  #context(bot: BotSummary): ThreadContext {
    const queue = this.#deps.mailbox.listQueue(bot.id);
    return {
      counts: this.#deps.mailbox.threadQueueCounts(bot.id),
      paused: queue.paused,
      running: this.#deps.live.runningThread(bot.id),
      cards: this.#deps.live.needsYou(bot.id),
    };
  }

  #summaries(bot: BotSummary): ThreadSummary[] {
    const context = this.#context(bot);
    return this.#visibleRows(bot.id)
      .map((meta) => this.#summary(bot, meta, context))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
  }

  #displayTitle(botId: string, meta: Meta): string {
    return this.#summaryTitle(botId, meta, this.#deps.database.readConversation(botId, meta.id).messages);
  }

  #summaryTitle(botId: string, meta: Meta, messages: ConversationMessage[]): string {
    if (meta.title) return meta.title;
    if (meta.parentTitle) return branchThreadTitle(meta.parentTitle);
    const first = messages.find((message) => message.author === "user" && message.text.trim());
    const text = first?.text ?? this.#deps.mailbox.firstUserText(botId, meta.id) ?? "";
    return autoThreadTitle(text) || NEW_THREAD_TITLE;
  }

  #summary(bot: BotSummary, meta: Meta, context: ThreadContext): ThreadSummary {
    const snapshot = this.#deps.database.readConversation(bot.id, meta.id);
    const messages = snapshot.messages;
    const visible = messages.filter((message) => message.itemType !== "commentary" && message.text.trim());
    const last = visible.at(-1);
    const queued = context.counts.get(meta.id)?.queued ?? 0;
    const needsYou = context.cards.get(meta.id) ?? 0;
    const turnRunning = context.running === meta.id || (context.counts.get(meta.id)?.running ?? 0) > 0;
    const updated = [meta.updatedAt, last?.createdAt ?? ""].sort().at(-1) ?? meta.updatedAt;
    return {
      id: meta.id,
      botId: bot.id,
      title: this.#summaryTitle(bot.id, meta, messages),
      titled: meta.title.length > 0,
      state: threadStateOf({
        archived: meta.archivedAt !== null,
        turnRunning,
        needsYou,
        queuedWaitingOnPause: context.paused && queued > 0,
      }),
      active: bot.threadId === meta.id,
      unread: messages.length > 0 ? this.#deps.reads.readState(LOCAL_MEMBER, snapshot).unreadCount : 0,
      queued,
      needsYou,
      createdAt: meta.createdAt,
      updatedAt: updated,
      archivedAt: meta.archivedAt,
      preview: last ? oneLine(last.text) : "",
      parentThreadId: meta.parentThreadId,
      parentTitle: meta.parentTitle,
      branchedFromMessageId: meta.branchedFromMessageId,
    };
  }

  // --- the meta table ---

  #metaRows(botId: string): Meta[] {
    return this.#db
      .prepare("SELECT * FROM projection_thread_meta WHERE agent_id = ? ORDER BY created_at, thread_id")
      .all(botId)
      .filter(isDynamicRecord)
      .map(toMeta);
  }

  #meta(threadId: string): Meta | null {
    const row = this.#db.prepare("SELECT * FROM projection_thread_meta WHERE thread_id = ?").get(threadId);
    return isDynamicRecord(row) ? toMeta(row) : null;
  }

  #insert(input: {
    id: string;
    agentId: string;
    title: string;
    createdAt: string;
    parentThreadId?: string | null;
    parentTitle?: string | null;
    branchedFromMessageId?: string | null;
  }): void {
    this.#db
      .prepare(
        `INSERT OR IGNORE INTO projection_thread_meta
           (thread_id, agent_id, title, archived_at, parent_thread_id, parent_title, branched_from_message_id,
            created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.agentId,
        input.title,
        input.parentThreadId ?? null,
        input.parentTitle ?? null,
        input.branchedFromMessageId ?? null,
        input.createdAt,
        input.createdAt,
      );
  }

  #update(threadId: string, patch: { title?: string; archivedAt?: string | null; updatedAt: string }): void {
    const current = this.#meta(threadId);
    if (!current) return;
    this.#db
      .prepare("UPDATE projection_thread_meta SET title = ?, archived_at = ?, updated_at = ? WHERE thread_id = ?")
      .run(
        patch.title ?? current.title,
        patch.archivedAt === undefined ? current.archivedAt : patch.archivedAt,
        patch.updatedAt,
        threadId,
      );
  }
}

function toPending(row: DynamicRecord): PendingThreadDelete {
  return {
    botId: text(row, "agent_id"),
    threadId: text(row, "thread_id"),
    title: text(row, "title"),
    wasActive: row.was_active === 1,
    deletedAt: text(row, "deleted_at"),
    expiresAt: text(row, "expires_at"),
  };
}

function toMeta(row: DynamicRecord): Meta {
  return {
    id: text(row, "thread_id"),
    agentId: text(row, "agent_id"),
    title: text(row, "title"),
    archivedAt: nullableText(row, "archived_at"),
    parentThreadId: nullableText(row, "parent_thread_id"),
    parentTitle: nullableText(row, "parent_title"),
    branchedFromMessageId: nullableText(row, "branched_from_message_id"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

function text(row: DynamicRecord, key: string): string {
  const value = row[key];
  if (!isString(value)) throw new Error(`Invalid thread column ${key}.`);
  return value;
}

function nullableText(row: DynamicRecord, key: string): string | null {
  const value = row[key];
  return isString(value) ? value : null;
}

/** One line of a message, at most THREAD_LIMITS.preview characters. */
function oneLine(value: string): string {
  const line = normalizeThreadTitle(value);
  return line.length > THREAD_LIMITS.preview ? `${line.slice(0, THREAD_LIMITS.preview - 1).trimEnd()}…` : line;
}

/** A message copied into a branch is history: finished, and not tied to a delivery of the original thread. */
function copyForBranch(message: ConversationMessage): ConversationMessage {
  const copy = structuredClone(message);
  copy.status = "completed";
  copy.delivery = undefined;
  return copy;
}
