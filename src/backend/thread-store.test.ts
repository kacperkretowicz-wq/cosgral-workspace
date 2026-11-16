// @vitest-environment node
// COSGRAL W6-BE1: several threads per agent on the real database, bot store and mailbox. What only the running program
// knows (which thread a turn runs in, which cards are open) is a small fake.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversationMessage, ThreadSummary } from "@openbot/contracts/ipc";
import { THREAD_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BotStore } from "./bot-store";
import { ConversationReadStore } from "./conversation-read-store";
import { MailboxStore } from "./mailbox-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { ThreadStore } from "./thread-store";

let root: string;
let userData: string;
const live = { running: new Map<string, string>(), cards: new Map<string, Map<string, number>>() };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-threads-"));
  userData = join(root, "user-data");
  live.running.clear();
  live.cards.clear();
});

afterEach(async () => {
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

async function setup(options: { maxThreads?: number } = {}) {
  const database = testDatabase(userData);
  const bots = new BotStore(userData, join(root, "home"), database);
  await bots.initialize();
  const mailbox = new MailboxStore(userData, bots.sharedRoot, database);
  await mailbox.initialize();
  const reads = new ConversationReadStore(database);
  const threads = new ThreadStore({
    database,
    bots,
    mailbox,
    reads,
    live: {
      runningThread: (botId) => live.running.get(botId) ?? null,
      needsYou: (botId) => live.cards.get(botId) ?? new Map(),
    },
    maxThreads: options.maxThreads,
  });
  mailbox.useThreadResolver((botId) => threads.activeThreadId(botId));
  await bots.getOrCreate("chief");
  await bots.getOrCreate("scout");
  return { database, bots, mailbox, reads, threads };
}

function message(id: string, author: "user" | "assistant", text: string, minute: number): ConversationMessage {
  return {
    id,
    author,
    source: author === "user" ? "user" : undefined,
    text,
    createdAt: `2026-11-16T10:${String(minute).padStart(2, "0")}:00.000Z`,
    status: "completed",
  };
}

async function seed(
  ctx: Awaited<ReturnType<typeof setup>>,
  botId: string,
  threadId: string,
  messages: ConversationMessage[],
) {
  ctx.database.persistConversation({ botId, threadId, activeTurnId: null, revision: 0, messages }, "test.seed");
}

function find(list: { threads: ThreadSummary[] }, id: string): ThreadSummary {
  const thread = list.threads.find((item) => item.id === id);
  if (!thread) throw new Error(`No thread ${id}.`);
  return thread;
}

describe("ThreadStore: the threads of an agent (W6-BE1)", () => {
  it("an agent with no thread yet gets one empty active thread, and it is the same thread next time", async () => {
    const { threads } = await setup();
    const list = await threads.list("chief");
    expect(list.threads).toHaveLength(1);
    expect(list.threads[0]).toMatchObject({
      botId: "chief",
      title: "New thread",
      titled: false,
      state: "idle",
      active: true,
      unread: 0,
      queued: 0,
      needsYou: 0,
      preview: "",
      parentThreadId: null,
      archivedAt: null,
    });
    expect(list.activeThreadId).toBe(list.threads[0]?.id);
    expect((await threads.list("chief")).activeThreadId).toBe(list.activeThreadId);
    await expect(threads.list("nobody")).rejects.toThrow(/Unknown agent/);
  });

  it("the conversation an agent already has becomes its first thread, untouched, with a title from its first message", async () => {
    const ctx = await setup();
    const id = await ctx.bots.ensureThreadId("chief");
    await seed(ctx, "chief", id, [
      message("m1", "user", "Please fix the login page\nit crashes", 1),
      message("m2", "assistant", "Done, the page works now.", 2),
    ]);
    await ctx.threads.initialize();
    const list = await ctx.threads.list("chief");
    expect(list.threads).toHaveLength(1);
    expect(list.threads[0]).toMatchObject({
      id,
      active: true,
      titled: false,
      title: "Please fix the login page",
      preview: "Done, the page works now.",
    });
    expect(ctx.database.readConversation("chief", id).messages.map((item) => item.id)).toEqual(["m1", "m2"]);
  });

  it("a message queued before threads belongs to the first thread after the start", async () => {
    const ctx = await setup();
    // No resolver yet: a mailbox as it was before threads.
    const plain = new MailboxStore(join(root, "plain"), ctx.bots.sharedRoot, testDatabase(join(root, "plain")));
    await plain.initialize();
    await plain.enqueue({ sender: { kind: "user" }, recipientBotIds: ["chief"], text: "queued long ago" });
    const threads = new ThreadStore({
      database: ctx.database,
      bots: ctx.bots,
      mailbox: plain,
      reads: ctx.reads,
      live: { runningThread: () => null, needsYou: () => new Map() },
    });
    await threads.initialize();
    const first = (await threads.list("chief")).activeThreadId ?? "";
    expect(plain.listQueue("chief", first).deliveries).toHaveLength(1);
    expect(plain.listQueue("chief", "another-thread").deliveries).toEqual([]);
  });

  it("creates a thread, makes it active and keeps the old one with its history", async () => {
    const ctx = await setup();
    const first = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await seed(ctx, "chief", first, [message("a1", "user", "In the first thread", 1)]);
    const list = await ctx.threads.create({ botId: "chief", title: "  Launch  plan " });
    expect(list.threads).toHaveLength(2);
    expect(list.activeThreadId).not.toBe(first);
    expect(find(list, list.activeThreadId ?? "")).toMatchObject({ title: "Launch plan", titled: true, active: true });
    expect(find(list, first)).toMatchObject({ active: false, title: "In the first thread" });
    expect(ctx.bots.list().find((bot) => bot.id === "chief")?.threadId).toBe(list.activeThreadId);
    expect(ctx.database.readConversation("chief", first).messages).toHaveLength(1);
    expect(ctx.database.readConversation("chief", list.activeThreadId ?? "").messages).toEqual([]);
  });

  it("refuses a thread over the limit, and a title that is too long", async () => {
    const { threads } = await setup({ maxThreads: 2 });
    await threads.list("chief");
    await threads.create({ botId: "chief" });
    await expect(threads.create({ botId: "chief" })).rejects.toThrow(/at most 2 threads/);
    await expect(threads.create({ botId: "scout", title: "x".repeat(THREAD_LIMITS.title + 1) })).rejects.toThrow(
      /at most 120/,
    );
    expect(THREAD_LIMITS.threadsPerAgent).toBe(200);
  });

  it("renames a thread, an empty title goes back to the automatic one, and the title survives a restart", async () => {
    const ctx = await setup();
    const id = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await seed(ctx, "chief", id, [message("m1", "user", "Write the release notes", 1)]);
    expect(find(await ctx.threads.rename({ botId: "chief", threadId: id, title: " Notes " }), id)).toMatchObject({
      title: "Notes",
      titled: true,
    });
    closeTestDatabases();
    const again = await setup();
    expect(find(await again.threads.list("chief"), id)).toMatchObject({ title: "Notes", titled: true });
    expect(find(await again.threads.rename({ botId: "chief", threadId: id, title: "" }), id)).toMatchObject({
      title: "Write the release notes",
      titled: false,
    });
    await expect(again.threads.rename({ botId: "chief", threadId: "nope", title: "x" })).rejects.toThrow(
      /Unknown thread/,
    );
    await expect(again.threads.rename({ botId: "scout", threadId: id, title: "x" })).rejects.toThrow(/Unknown thread/);
  });

  it("selects a thread and keeps each thread's own provider session", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    ctx.bots.bindProviderSession("chief", "cli-session-a");
    const b = (await ctx.threads.create({ botId: "chief" })).activeThreadId ?? "";
    expect(ctx.bots.activeProviderSession("chief")).toBeNull();
    ctx.bots.bindProviderSession("chief", "cli-session-b");
    expect((await ctx.threads.select({ botId: "chief", threadId: a })).activeThreadId).toBe(a);
    expect(ctx.bots.activeProviderSession("chief")?.externalSessionId).toBe("cli-session-a");
    expect((await ctx.threads.select({ botId: "chief", threadId: b })).activeThreadId).toBe(b);
    expect(ctx.bots.activeProviderSession("chief")?.externalSessionId).toBe("cli-session-b");
    await expect(ctx.threads.select({ botId: "chief", threadId: "nope" })).rejects.toThrow(/Unknown thread/);
    // The active thread survives a restart.
    closeTestDatabases();
    expect((await (await setup()).threads.list("chief")).activeThreadId).toBe(b);
  });

  it("archives the active thread: the newest other open thread takes over; the archived one cannot be selected", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await seed(ctx, "chief", a, [message("a1", "user", "A", 1)]);
    const b = (await ctx.threads.create({ botId: "chief", title: "B" })).activeThreadId ?? "";
    await seed(ctx, "chief", b, [message("b1", "user", "B", 5)]);
    const list = await ctx.threads.archive({ botId: "chief", threadId: b });
    expect(list.activeThreadId).toBe(a);
    expect(find(list, b)).toMatchObject({ state: "archived", active: false });
    expect(find(list, b).archivedAt).not.toBeNull();
    await expect(ctx.threads.select({ botId: "chief", threadId: b })).rejects.toThrow(/Restore the thread first/);
    // Its history is still there.
    expect(ctx.database.readConversation("chief", b).messages).toHaveLength(1);
    const restored = await ctx.threads.restore({ botId: "chief", threadId: b });
    expect(find(restored, b)).toMatchObject({ state: "idle", archivedAt: null });
    expect(restored.activeThreadId).toBe(a);
    expect((await ctx.threads.select({ botId: "chief", threadId: b })).activeThreadId).toBe(b);
  });

  it("archiving the only open thread makes a new empty one active", async () => {
    const { threads } = await setup();
    const a = (await threads.list("chief")).activeThreadId ?? "";
    const list = await threads.archive({ botId: "chief", threadId: a });
    expect(list.threads).toHaveLength(2);
    expect(list.activeThreadId).not.toBe(a);
    expect(find(list, list.activeThreadId ?? "")).toMatchObject({ state: "idle", title: "New thread" });
    expect(find(list, a).state).toBe("archived");
  });

  it("archiving a thread while its turn runs is allowed: the turn keeps its thread, and the state stays archived", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await ctx.threads.create({ botId: "chief" });
    live.running.set("chief", a);
    const list = await ctx.threads.archive({ botId: "chief", threadId: a });
    expect(find(list, a).state).toBe("archived");
    expect(live.running.get("chief")).toBe(a);
    // After the turn the thread is archived and idle work does not wake it.
    live.running.delete("chief");
    expect(find(await ctx.threads.list("chief"), a).state).toBe("archived");
  });

  it("shows the state of each thread: running, waiting on a card, waiting on a paused queue, idle", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    const b = (await ctx.threads.create({ botId: "chief" })).activeThreadId ?? "";
    const c = (await ctx.threads.create({ botId: "chief" })).activeThreadId ?? "";
    live.running.set("chief", a);
    live.cards.set("chief", new Map([[b, 2]]));
    const list = await ctx.threads.list("chief");
    expect(find(list, a).state).toBe("running");
    expect(find(list, b)).toMatchObject({ state: "waiting", needsYou: 2 });
    expect(find(list, c).state).toBe("idle");
    // A paused queue with messages waits too.
    await ctx.mailbox.enqueue({ sender: { kind: "user" }, recipientBotIds: ["chief"], text: "later" });
    await ctx.mailbox.setPaused("chief", true);
    expect(find(await ctx.threads.list("chief"), c)).toMatchObject({ state: "waiting", queued: 1 });
  });

  it("counts the queue of each thread and the unread answers of each thread", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await ctx.mailbox.enqueue({ sender: { kind: "user" }, recipientBotIds: ["chief"], text: "one" });
    await ctx.mailbox.enqueue({ sender: { kind: "user" }, recipientBotIds: ["chief"], text: "two" });
    const b = (await ctx.threads.create({ botId: "chief" })).activeThreadId ?? "";
    await ctx.mailbox.enqueue({ sender: { kind: "user" }, recipientBotIds: ["chief"], text: "three" });
    let list = await ctx.threads.list("chief");
    expect(find(list, a).queued).toBe(2);
    expect(find(list, b).queued).toBe(1);
    // The person read thread A up to its first answer; a second answer arrives in the background.
    await seed(ctx, "chief", a, [message("a1", "user", "one", 1), message("a2", "assistant", "first", 2)]);
    ctx.reads.markRead("local-owner", ctx.database.readConversation("chief", a), "a2");
    await seed(ctx, "chief", a, [
      message("a1", "user", "one", 1),
      message("a2", "assistant", "first", 2),
      message("a3", "assistant", "second", 3),
    ]);
    list = await ctx.threads.list("chief");
    expect(find(list, a).unread).toBe(1);
    expect(find(list, b).unread).toBe(0);
  });

  it("deletes a thread for good: history, queue, session, reads and event traces; the other threads stay", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await seed(ctx, "chief", a, [message("a1", "user", "secret plan", 1)]);
    await ctx.mailbox.enqueue({ sender: { kind: "user" }, recipientBotIds: ["chief"], text: "queued in A" });
    ctx.bots.bindProviderSession("chief", "cli-session-a");
    ctx.reads.readState("local-owner", ctx.database.readConversation("chief", a));
    const b = (await ctx.threads.create({ botId: "chief", title: "B" })).activeThreadId ?? "";
    await seed(ctx, "chief", b, [message("b1", "user", "keep me", 2)]);
    // @ts-expect-error a delete without the flag must be refused
    await expect(ctx.threads.delete({ botId: "chief", threadId: a })).rejects.toThrow(/confirmation/);
    const list = await ctx.threads.delete({ botId: "chief", threadId: a, confirm: true });
    expect(list.threads.map((thread) => thread.id)).toEqual([b]);
    expect(ctx.database.readConversation("chief", a).messages).toEqual([]);
    expect(ctx.mailbox.listQueue("chief").deliveries.filter((item) => item.text === "queued in A")).toEqual([]);
    expect(ctx.database.listProviderSessions(a)).toEqual([]);
    const traces = ctx.database.connection
      .prepare("SELECT COUNT(*) AS n FROM orchestration_events WHERE aggregate_id = ?")
      .get(a);
    expect(traces?.n).toBe(0);
    const reads = ctx.database.connection
      .prepare("SELECT COUNT(*) AS n FROM projection_thread_reads WHERE thread_id = ?")
      .get(a);
    expect(reads?.n).toBe(0);
    expect(ctx.database.readConversation("chief", b).messages).toHaveLength(1);
  });

  it("deleting the active thread moves on to another one, or makes a new one", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    const b = (await ctx.threads.create({ botId: "chief" })).activeThreadId ?? "";
    expect((await ctx.threads.delete({ botId: "chief", threadId: b, confirm: true })).activeThreadId).toBe(a);
    const last = await ctx.threads.delete({ botId: "chief", threadId: a, confirm: true });
    expect(last.threads).toHaveLength(1);
    expect(last.activeThreadId).toBe(last.threads[0]?.id);
    expect([a, b]).not.toContain(last.activeThreadId);
  });

  it("refuses to delete a thread while its turn runs", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await ctx.threads.create({ botId: "chief" });
    live.running.set("chief", a);
    await expect(ctx.threads.delete({ botId: "chief", threadId: a, confirm: true })).rejects.toThrow(/turn is running/);
    expect(find(await ctx.threads.list("chief"), a).id).toBe(a);
  });

  it("branches from a message: a new active thread with the history up to it and a link back; the original stays", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await ctx.threads.rename({ botId: "chief", threadId: a, title: "Plan" });
    await seed(ctx, "chief", a, [
      message("m1", "user", "First question", 1),
      message("m2", "assistant", "First answer", 2),
      message("m3", "user", "Second question", 3),
      message("m4", "assistant", "Second answer", 4),
    ]);
    const list = await ctx.threads.branch({ botId: "chief", threadId: a, fromMessageId: "m2" });
    const branchId = list.activeThreadId ?? "";
    expect(branchId).not.toBe(a);
    expect(find(list, branchId)).toMatchObject({
      title: "Branch of Plan",
      titled: false,
      active: true,
      parentThreadId: a,
      parentTitle: "Plan",
      branchedFromMessageId: "m2",
      unread: 0,
    });
    expect(ctx.database.readConversation("chief", branchId).messages.map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(ctx.database.readConversation("chief", a).messages.map((item) => item.id)).toEqual(["m1", "m2", "m3", "m4"]);
    // The branch still has to tell its agent what happened before: no CLI session yet and a history to hand over.
    expect(ctx.threads.needsHistoryHandoff(branchId)).toBe(true);
    expect(ctx.threads.needsHistoryHandoff(a)).toBe(false);
    await expect(ctx.threads.branch({ botId: "chief", threadId: a, fromMessageId: "nope" })).rejects.toThrow(
      /message is not in this thread/,
    );
  });

  it("a branch keeps the name of its parent when the parent is deleted, and loses the link", async () => {
    const ctx = await setup();
    const a = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await ctx.threads.rename({ botId: "chief", threadId: a, title: "Plan" });
    await seed(ctx, "chief", a, [message("m1", "user", "Hello", 1)]);
    const branchId =
      (await ctx.threads.branch({ botId: "chief", threadId: a, fromMessageId: "m1" })).activeThreadId ?? "";
    const list = await ctx.threads.delete({ botId: "chief", threadId: a, confirm: true });
    expect(find(list, branchId)).toMatchObject({ parentThreadId: null, parentTitle: "Plan" });
  });

  it("keeps two agents apart, and deleting an agent deletes every thread it had", async () => {
    const ctx = await setup();
    const chiefA = (await ctx.threads.list("chief")).activeThreadId ?? "";
    await seed(ctx, "chief", chiefA, [message("c1", "user", "chief", 1)]);
    const chiefB = (await ctx.threads.create({ botId: "chief" })).activeThreadId ?? "";
    await seed(ctx, "chief", chiefB, [message("c2", "user", "chief again", 2)]);
    // An agent that had none gets its first thread, then the new one.
    const scout = (await ctx.threads.create({ botId: "scout", title: "Scout only" })).activeThreadId ?? "";
    const scoutThreads = (await ctx.threads.list("scout")).threads.map((thread) => thread.id);
    expect(scoutThreads).toHaveLength(2);
    expect(scoutThreads).toContain(scout);
    expect(scoutThreads).not.toContain(chiefA);
    expect((await ctx.threads.list("chief")).threads).toHaveLength(2);
    await expect(ctx.threads.select({ botId: "scout", threadId: chiefA })).rejects.toThrow(/Unknown thread/);
    await ctx.bots.deleteBot("chief");
    const left = ctx.database.connection
      .prepare("SELECT thread_id FROM projection_threads WHERE agent_id = ?")
      .all("chief");
    expect(left).toEqual([]);
    const meta = ctx.database.connection
      .prepare("SELECT COUNT(*) AS n FROM projection_thread_meta WHERE agent_id = ?")
      .get("chief");
    expect(meta?.n).toBe(0);
    expect((await ctx.threads.list("scout")).threads).toHaveLength(2);
  });

  it("opens a database made before threads: the table is added and the old conversation is the first thread", async () => {
    const ctx = await setup();
    const id = await ctx.bots.ensureThreadId("chief");
    await seed(ctx, "chief", id, [message("m1", "user", "Old conversation", 1)]);
    ctx.database.connection.exec("DROP TABLE projection_thread_meta");
    closeTestDatabases();
    const again = await setup();
    await again.threads.initialize();
    const list = await again.threads.list("chief");
    expect(list.threads).toHaveLength(1);
    expect(list.threads[0]).toMatchObject({ id, title: "Old conversation", active: true });
  });
});
