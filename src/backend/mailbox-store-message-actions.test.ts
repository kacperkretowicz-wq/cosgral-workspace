// @vitest-environment node
// COSGRAL W6-BE3: the mailbox side of the actions on a message (spec-w6.md 1E). A retry or an edit sends a message that is
// marked (regeneration, edited); a delete removes the person's message from one thread, with its files, and touches
// nothing of another thread or of another agent's queue.

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MailboxStore } from "./mailbox-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

let root: string;
let userData: string;
let store: MailboxStore;
const active: Record<string, string> = { chief: "thread-a", scout: "thread-s" };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-mailbox-actions-"));
  userData = join(root, "user-data");
  store = new MailboxStore(userData, join(root, "Shared"), testDatabase(userData));
  await store.initialize();
  store.useThreadResolver(async (botId) => active[botId] ?? null);
  active.chief = "thread-a";
});

afterEach(async () => {
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

async function send(text: string, extra: { regenerationOf?: string; edited?: boolean; sourcePaths?: string[] } = {}) {
  const receipt = await store.enqueue({ sender: { kind: "user" }, recipientBotIds: ["chief"], text, ...extra });
  return receipt.deliveries[0]?.id ?? "";
}

/** A message the agent has answered: its delivery is finished. */
async function finish(id: string) {
  await store.markStarting(id);
  await store.markRunning(id, `turn-${id}`);
  await store.markTerminal(id, "completed");
}

function row(id: string) {
  return store.conversationMessages("chief", "thread-a").find((message) => message.id === id);
}

describe("MailboxStore: marks for retry and edit (W29-W35)", () => {
  it("shows a regeneration request and an edited message with their marks, also after a restart", async () => {
    const first = await send("Question");
    const again = await send("Question", { regenerationOf: "answer-1" });
    const edited = await send("Question, better", { edited: true });
    expect(row(first)?.regeneration).toBeUndefined();
    expect(row(first)?.edited).toBeUndefined();
    expect(row(again)?.regeneration).toEqual({ ofMessageId: "answer-1" });
    expect(row(edited)?.edited).toBe(true);

    closeTestDatabases();
    const reopened = new MailboxStore(userData, join(root, "Shared"), testDatabase(userData));
    await reopened.initialize();
    const messages = reopened.conversationMessages("chief", "thread-a");
    expect(messages.find((message) => message.id === again)?.regeneration).toEqual({ ofMessageId: "answer-1" });
    expect(messages.find((message) => message.id === edited)?.edited).toBe(true);
  });
});

describe("MailboxStore: removing deliveries (W29-W35 delete and edit)", () => {
  it("removes the asked delivery and its message from one thread only", async () => {
    const a1 = await send("in A, one");
    const a2 = await send("in A, two");
    active.chief = "thread-b";
    const b1 = await send("in B");
    await finish(a1);
    await store.removeDeliveries("chief", "thread-a", [a1]);
    expect(store.conversationMessages("chief", "thread-a").map((message) => message.id)).toEqual([a2]);
    expect(store.conversationMessages("chief", "thread-b").map((message) => message.id)).toEqual([b1]);
    expect(
      store
        .listQueue("chief")
        .deliveries.map((delivery) => delivery.id)
        .sort(),
    ).toEqual([a2, b1].sort());
  });

  it("refuses a delivery of another thread or another agent, and one that is not finished", async () => {
    const a1 = await send("in A");
    await expect(store.removeDeliveries("chief", "thread-b", [a1])).rejects.toThrow(/not in this thread/i);
    await expect(store.removeDeliveries("scout", "thread-a", [a1])).rejects.toThrow(/not in this thread/i);
    await expect(store.removeDeliveries("chief", "thread-a", [a1])).rejects.toThrow(/waiting|running|queue/i);
    expect(store.conversationMessages("chief", "thread-a")).toHaveLength(1);
  });

  it("removes the files of the message, its reaction and its idempotency key", async () => {
    const file = join(root, "note.txt");
    await mkdir(root, { recursive: true });
    await writeFile(file, "hello");
    const id = await send("With a file", { sourcePaths: [file] });
    const before = store.conversationMessages("chief", "thread-a")[0];
    const attachment = before?.attachments?.[0];
    expect(attachment).toBeDefined();
    const stored = await store.resolveAttachment(attachment?.id ?? "");
    expect(stored).not.toBeNull();
    await store.setReaction("chief", id, "👍");
    await finish(id);
    await store.removeDeliveries("chief", "thread-a", [id]);
    await expect(access(stored?.path ?? "")).rejects.toThrow();
    expect(store.reactionFor("chief", id)).toBeNull();
    expect(await store.resolveAttachment(attachment?.id ?? "")).toBeNull();
  });

  it("keeps a message that another agent still has in its queue", async () => {
    const receipt = await store.enqueue({
      sender: { kind: "user" },
      recipientBotIds: ["chief", "scout"],
      text: "To both",
    });
    const chief = receipt.deliveries.find((delivery) => delivery.recipientBotId === "chief")?.id ?? "";
    const scout = receipt.deliveries.find((delivery) => delivery.recipientBotId === "scout")?.id ?? "";
    for (const id of [chief, scout]) await finish(id);
    await store.removeDeliveries("chief", "thread-a", [chief]);
    expect(store.conversationMessages("chief", "thread-a")).toEqual([]);
    expect(store.conversationMessages("scout", "thread-s").map((message) => message.id)).toEqual([scout]);
  });
});
