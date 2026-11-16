// @vitest-environment node
// COSGRAL W6-BE1: the mailbox keeps a queue per thread of an agent. A delivery belongs to the thread that was active
// when it was sent; the queue the person sees and the queue that runs are those of one thread.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MailboxStore } from "./mailbox-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

let root: string;
let userData: string;
let store: MailboxStore;
/** The thread each agent has active now, as the program tells the mailbox. */
const active: Record<string, string> = { chief: "thread-a", scout: "thread-s" };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-mailbox-threads-"));
  userData = join(root, "user-data");
  store = new MailboxStore(userData, join(root, "Shared"), testDatabase(userData));
  await store.initialize();
  store.useThreadResolver(async (botId) => active[botId] ?? null);
  active.chief = "thread-a";
  active.scout = "thread-s";
});

afterEach(async () => {
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

async function send(text: string, bots = ["chief"], extra: { senderThreadId?: string; botSender?: string } = {}) {
  return store.enqueue({
    sender: extra.botSender ? { kind: "bot", botId: extra.botSender } : { kind: "user" },
    recipientBotIds: bots,
    text,
    senderThreadId: extra.senderThreadId,
  });
}

describe("MailboxStore: a queue per thread (W6-BE1)", () => {
  it("stamps a message with the thread that is active when it is sent, and each queue shows only its own", async () => {
    await send("first in A");
    active.chief = "thread-b";
    await send("first in B");
    await send("second in B");
    expect(store.listQueue("chief", "thread-a").deliveries.map((item) => item.text)).toEqual(["first in A"]);
    expect(store.listQueue("chief", "thread-b").deliveries.map((item) => item.text)).toEqual([
      "first in B",
      "second in B",
    ]);
    // Without a thread the whole queue of the agent is shown, as before threads.
    expect(store.listQueue("chief").deliveries).toHaveLength(3);
    expect(store.listQueue("chief", "thread-a").deliveries[0]?.threadId).toBe("thread-a");
    // The position of a message is its place in its own thread's queue.
    expect(store.listQueue("chief", "thread-b").deliveries.map((item) => item.position)).toEqual([1, 2]);
    expect(store.listQueue("chief", "thread-a").deliveries.map((item) => item.position)).toEqual([1]);
  });

  it("starts only the next message of the thread it is asked about, and not while any turn of the agent runs", async () => {
    await send("A1");
    active.chief = "thread-b";
    const b = await send("B1");
    expect(store.nextQueued("chief", "thread-a")?.delivery.text).toBe("A1");
    expect(store.nextQueued("chief", "thread-b")?.delivery.text).toBe("B1");
    expect(store.nextQueued("chief", "thread-c")).toBeNull();
    const delivery = b.deliveries[0];
    if (!delivery) throw new Error("No delivery.");
    await store.markStarting(delivery.id);
    // One turn per agent at a time: nothing else starts, in any thread.
    expect(store.nextQueued("chief", "thread-a")).toBeNull();
    await store.markRunning(delivery.id, "turn-1");
    expect(store.nextQueued("chief", "thread-a")).toBeNull();
    expect(store.threadQueueCounts("chief").get("thread-b")).toEqual({ queued: 0, running: 1 });
    expect(store.threadQueueCounts("chief").get("thread-a")).toEqual({ queued: 1, running: 0 });
  });

  it("keeps the threads of two agents apart", async () => {
    await send("for chief", ["chief"]);
    await send("for scout", ["scout"]);
    expect(store.listQueue("scout", "thread-s").deliveries.map((item) => item.text)).toEqual(["for scout"]);
    expect(store.listQueue("scout", "thread-a").deliveries).toEqual([]);
    expect(store.nextQueued("scout", "thread-s")?.delivery.text).toBe("for scout");
  });

  it("shows the messages of a conversation per thread; an outgoing exchange belongs to the thread that sent it", async () => {
    await send("in A");
    active.chief = "thread-b";
    await send("in B");
    expect(store.conversationMessages("chief", "thread-a").map((message) => message.text)).toEqual(["in A"]);
    expect(store.conversationMessages("chief", "thread-b").map((message) => message.text)).toEqual(["in B"]);
    // chief (in thread A) asks scout something: the outgoing row is in A, not in B.
    await send("please check", ["scout"], { botSender: "chief", senderThreadId: "thread-a" });
    const inA = store.conversationMessages("chief", "thread-a").filter((message) => message.exchange);
    const inB = store.conversationMessages("chief", "thread-b").filter((message) => message.exchange);
    expect(inA).toHaveLength(1);
    expect(inB).toHaveLength(0);
    // The question arrives in the thread scout has active, not in a thread of chief.
    expect(store.conversationMessages("scout", "thread-s").map((message) => message.text)).toEqual(["please check"]);
  });

  it("takes a message from before threads for every thread, then gives it to one thread for good", async () => {
    // A mailbox written before threads: no resolver, nothing stamped.
    const old = new MailboxStore(join(root, "old"), join(root, "Shared"), testDatabase(join(root, "old")));
    await old.initialize();
    await old.enqueue({ sender: { kind: "user" }, recipientBotIds: ["chief"], text: "from before" });
    expect(old.listQueue("chief", "thread-x").deliveries.map((item) => item.text)).toEqual(["from before"]);
    expect(old.listQueue("chief", "thread-y").deliveries.map((item) => item.text)).toEqual(["from before"]);
    expect(await old.stampLegacyThreads((botId) => (botId === "chief" ? "thread-x" : null))).toBe(1);
    expect(old.listQueue("chief", "thread-x").deliveries).toHaveLength(1);
    expect(old.listQueue("chief", "thread-y").deliveries).toEqual([]);
    // A second run changes nothing.
    expect(await old.stampLegacyThreads(() => "thread-z")).toBe(0);
  });

  it("deletes the queue of one thread and nothing else", async () => {
    await send("A1");
    await send("A2");
    active.chief = "thread-b";
    await send("B1");
    await store.deleteThreadData("chief", "thread-a");
    expect(store.listQueue("chief").deliveries.map((item) => item.text)).toEqual(["B1"]);
    expect(store.conversationMessages("chief", "thread-a")).toEqual([]);
    expect(store.conversationMessages("chief", "thread-b").map((message) => message.text)).toEqual(["B1"]);
  });

  it("finds the first message of a thread for its automatic title", async () => {
    await send("  Please fix\nthe login  ");
    active.chief = "thread-b";
    expect(store.firstUserText("chief", "thread-a")).toBe("Please fix\nthe login");
    expect(store.firstUserText("chief", "thread-b")).toBeNull();
  });

  it("remembers the thread of a message after a restart", async () => {
    await send("in A");
    closeTestDatabases();
    const again = new MailboxStore(userData, join(root, "Shared"), testDatabase(userData));
    await again.initialize();
    expect(again.listQueue("chief", "thread-a").deliveries).toHaveLength(1);
    expect(again.listQueue("chief", "thread-b").deliveries).toEqual([]);
  });
});
