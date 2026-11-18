// @vitest-environment node
// COSGRAL W12 (BE-K): delete with undo on the real database, bot store and mailbox. A thread is hidden for the undo window and nothing
// of it is touched; undo brings back the very same thread; "delete now" and the end of the window remove it for good.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversationMessage } from "@openbot/contracts/ipc";
import { THREAD_UNDO_WINDOW_MS } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BotStore } from "./bot-store";
import { ConversationReadStore } from "./conversation-read-store";
import { MailboxStore } from "./mailbox-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { ThreadStore } from "./thread-store";

let root: string;
let userData: string;
let now: Date;
const running = new Map<string, string>();

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-thread-undo-"));
  userData = join(root, "user-data");
  now = new Date("2026-11-17T01:00:00.000Z");
  running.clear();
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
    live: { runningThread: (botId) => running.get(botId) ?? null, needsYou: () => new Map() },
    maxThreads: options.maxThreads,
    now: () => now,
  });
  mailbox.useThreadResolver((botId) => threads.activeThreadId(botId));
  await bots.getOrCreate("chief");
  return { database, bots, mailbox, reads, threads };
}

function message(id: string, text: string, minute: number): ConversationMessage {
  return {
    id,
    author: "user",
    source: "user",
    text,
    createdAt: `2026-11-16T10:${String(minute).padStart(2, "0")}:00.000Z`,
    status: "completed",
  };
}

const minutes = (count: number) => new Date(now.getTime() + count * 60_000);

describe("ThreadStore: delete with undo (W12 BE-K)", () => {
  it("hides a thread without touching it, and brings back the same thread with its history as the active one", async () => {
    const { database, threads } = await setup();
    const first = (await threads.list("chief")).threads[0]?.id ?? "";
    database.persistConversation(
      {
        botId: "chief",
        threadId: first,
        activeTurnId: null,
        revision: 0,
        messages: [message("m1", "Plan the launch", 1)],
      },
      "test.seed",
    );
    await threads.rename({ botId: "chief", threadId: first, title: "Launch" });
    await threads.create({ botId: "chief", title: "Other" });
    await threads.select({ botId: "chief", threadId: first });

    const hidden = await threads.hide({ botId: "chief", threadId: first, confirm: true });
    expect(hidden.list.threads.map((thread) => thread.title)).toEqual(["Other"]);
    expect(hidden.list.activeThreadId).not.toBe(first);
    expect(hidden.pending).toMatchObject({
      botId: "chief",
      threadId: first,
      title: "Launch",
      wasActive: true,
      deletedAt: "2026-11-17T01:00:00.000Z",
      expiresAt: new Date(now.getTime() + THREAD_UNDO_WINDOW_MS).toISOString(),
    });
    // Hidden: nothing reaches it, and nothing of it was removed.
    expect(threads.lookup("chief", first)).toBeNull();
    await expect(threads.select({ botId: "chief", threadId: first })).rejects.toThrow("Unknown thread.");
    await expect(threads.rename({ botId: "chief", threadId: first, title: "x" })).rejects.toThrow("Unknown thread.");
    expect(database.readConversation("chief", first).messages.map((item) => item.id)).toEqual(["m1"]);
    expect(threads.listPending("chief")).toHaveLength(1);

    now = minutes(5);
    const back = await threads.unhide({ botId: "chief", threadId: first });
    expect(back.activeThreadId).toBe(first);
    expect(back.threads.map((thread) => thread.title).sort()).toEqual(["Launch", "Other"]);
    expect(back.threads.find((thread) => thread.id === first)).toMatchObject({ preview: "Plan the launch" });
    expect(threads.listPending("chief")).toEqual([]);
  });

  it("does not make the thread active again when it was not the shown one", async () => {
    const { threads } = await setup();
    const first = (await threads.list("chief")).threads[0]?.id ?? "";
    const second = (await threads.create({ botId: "chief", title: "Shown" })).activeThreadId ?? "";
    await threads.hide({ botId: "chief", threadId: first, confirm: true });
    const back = await threads.unhide({ botId: "chief", threadId: first });
    expect(back.activeThreadId).toBe(second);
  });

  it("keeps the list across a restart, does not extend the window, and refuses undo when the time is out", async () => {
    const { threads } = await setup();
    const first = (await threads.list("chief")).threads[0]?.id ?? "";
    await threads.create({ botId: "chief", title: "Other" });
    await threads.hide({ botId: "chief", threadId: first, confirm: true });
    closeTestDatabases();
    const reopened = await setup();
    expect(reopened.threads.listPending("chief").map((item) => item.threadId)).toEqual([first]);
    now = minutes(11);
    expect(reopened.threads.listPending("chief")).toEqual([]);
    expect(reopened.threads.expiredPending().map((item) => item.threadId)).toEqual([first]);
    await expect(reopened.threads.unhide({ botId: "chief", threadId: first })).rejects.toThrow(
      "The time to undo has passed.",
    );
    await expect(reopened.threads.unhide({ botId: "chief", threadId: "nothing" })).rejects.toThrow(
      "There is nothing to undo for this thread.",
    );
  });

  it("removes a hidden thread for good with delete (now, or when the window ended), and its row goes with it", async () => {
    const { database, threads } = await setup();
    const first = (await threads.list("chief")).threads[0]?.id ?? "";
    await threads.create({ botId: "chief", title: "Other" });
    database.persistConversation(
      { botId: "chief", threadId: first, activeTurnId: null, revision: 0, messages: [message("m1", "Secret", 1)] },
      "test.seed",
    );
    await threads.hide({ botId: "chief", threadId: first, confirm: true });
    await threads.delete({ botId: "chief", threadId: first, confirm: true });
    expect(threads.listPending("chief")).toEqual([]);
    expect(threads.expiredPending()).toEqual([]);
    expect(database.readConversation("chief", first).messages).toEqual([]);
    await expect(threads.unhide({ botId: "chief", threadId: first })).rejects.toThrow("nothing to undo");
  });

  it("gives the room of a hidden thread back to the agent, and refuses undo when the room was taken", async () => {
    const { threads } = await setup({ maxThreads: 2 });
    const first = (await threads.list("chief")).threads[0]?.id ?? "";
    await threads.create({ botId: "chief", title: "Two" });
    await threads.hide({ botId: "chief", threadId: first, confirm: true });
    expect(threads.hasRoom("chief")).toBe(true);
    await threads.create({ botId: "chief", title: "Three" });
    expect(threads.hasRoom("chief")).toBe(false);
    await expect(threads.unhide({ botId: "chief", threadId: first })).rejects.toThrow("at most 2 threads");
  });

  it("has the same refusals as delete: no confirmation, a turn that runs, a thread that does not exist", async () => {
    const { threads } = await setup();
    const first = (await threads.list("chief")).threads[0]?.id ?? "";
    await expect(
      threads.hide(JSON.parse(JSON.stringify({ botId: "chief", threadId: first, confirm: false }))),
    ).rejects.toThrow("confirmation");
    running.set("chief", first);
    await expect(threads.hide({ botId: "chief", threadId: first, confirm: true })).rejects.toThrow("turn is running");
    running.clear();
    await expect(threads.hide({ botId: "chief", threadId: "missing", confirm: true })).rejects.toThrow(
      "Unknown thread.",
    );
    expect(threads.listPending("chief")).toEqual([]);
  });
});
