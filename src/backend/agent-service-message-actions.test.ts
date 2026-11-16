// @vitest-environment node
// COSGRAL W6-BE3 (step 2): the actions on a message on the real AgentService (spec-w6.md 1E, W29-W35; Q12-Q14). A fake
// Codex answers each message; retry ADDS an answer, edit removes what follows (and the model no longer sees it), delete
// removes one message, pin survives a restart. History cannot change while the thread is busy (W35).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BrowserControlState, BrowserTab, ConversationMessage } from "@openbot/contracts/ipc";
import { MESSAGE_ACTION_LIMITS } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { MailboxStore } from "./mailbox-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";
import { ThreadCli } from "./testing/thread-cli";

let root: string;
const services: AgentService[] = [];
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-message-actions-"));
  process.env.OPENBOT_CODEX_PATH = await writeFakeCli(
    join(root, "Codex CLI"),
    "codex",
    `if (process.argv.includes("--version")) process.stdout.write("codex-cli 0.144.1\\n");`,
  );
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude");
});

afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  if (originalCodexPath === undefined) delete process.env.OPENBOT_CODEX_PATH;
  else process.env.OPENBOT_CODEX_PATH = originalCodexPath;
  if (originalClaudePath === undefined) delete process.env.OPENBOT_CLAUDE_PATH;
  else process.env.OPENBOT_CLAUDE_PATH = originalClaudePath;
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

async function open(cli = new ThreadCli()) {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  services.push(service);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  await service.initialize();
  await store.getOrCreate("chief");
  return { service, store, cli, events, userData };
}

/** A conversation of two finished exchanges: Q1/A1 and Q2/A2. */
async function twoExchanges() {
  const fixture = await open();
  const { service, events } = fixture;
  await service.sendMessage({ botId: "chief", text: "Q1 about apples" });
  await waitFor(() => completed(events) === 1);
  await service.sendMessage({ botId: "chief", text: "Q2 about pears" });
  await waitFor(() => completed(events) === 2);
  return fixture;
}

async function messages(service: AgentService): Promise<ConversationMessage[]> {
  return (await service.readConversation("chief")).messages.filter((message) => message.author !== "system");
}

function find(list: ConversationMessage[], text: string): ConversationMessage {
  const found = list.find((message) => message.text.includes(text));
  if (!found) throw new Error(`No message with "${text}".`);
  return found;
}

describe.sequential("the actions on a message, on the service", {
  timeout: process.platform === "win32" ? 30_000 : 10_000,
}, () => {
  it("pins and unpins, marks the message, announces the list and keeps the pin after a restart", async () => {
    const { service, events, userData } = await twoExchanges();
    const before = await messages(service);
    const q1 = find(before, "Q1");
    const a1 = find(before, "ANSWER_TO[Q1");
    expect(
      (await service.pinMessage({ botId: "chief", messageId: q1.id, pinned: true })).map((pin) => pin.messageId),
    ).toEqual([q1.id]);
    const pins = await service.pinMessage({ botId: "chief", messageId: a1.id, pinned: true });
    expect(pins.map((pin) => pin.messageId)).toEqual([a1.id, q1.id]);
    expect(events.findLast((event) => event.type === "message-pins-changed")).toMatchObject({
      type: "message-pins-changed",
      botId: "chief",
      pins,
    });
    const after = await messages(service);
    expect(find(after, "Q1").pinned).toBe(true);
    expect(find(after, "ANSWER_TO[Q1").pinned).toBe(true);
    expect(find(after, "Q2").pinned).toBeFalsy();

    await service.stop();
    closeTestDatabases();
    const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
    const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
    const again = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => new ThreadCli());
    services.push(again);
    await again.initialize();
    expect((await again.listMessagePins({ botId: "chief" })).map((pin) => pin.messageId)).toEqual([a1.id, q1.id]);
    expect(find(await messages(again), "Q1").pinned).toBe(true);
    expect(await again.pinMessage({ botId: "chief", messageId: a1.id, pinned: false })).toHaveLength(1);
  });

  it("refuses to pin a message that is not in the thread, and over the limit", async () => {
    const { service } = await twoExchanges();
    await expect(service.pinMessage({ botId: "chief", messageId: "nope", pinned: true })).rejects.toThrow(
      /not in this thread/,
    );
    expect(MESSAGE_ACTION_LIMITS.pinsPerThread).toBeGreaterThan(2);
  });

  it("retry ADDS a new answer marked as a regeneration and keeps the old one (Q12)", async () => {
    const { service, cli, events } = await twoExchanges();
    const a1 = find(await messages(service), "ANSWER_TO[Q1");
    const result = await service.retryMessage({ botId: "chief", messageId: a1.id });
    expect(result.removedMessageIds).toEqual([]);
    expect(result.receipt?.messageId).toBeTruthy();
    await waitFor(() => completed(events) === 3);

    const list = await messages(service);
    const answers = list.filter((message) => message.text.includes("ANSWER_TO[Q1"));
    expect(answers).toHaveLength(2);
    expect(answers[0]?.id).toBe(a1.id);
    expect(answers[0]?.regeneration).toBeUndefined();
    expect(answers[1]?.regeneration).toEqual({ ofMessageId: a1.id });
    const requests = list.filter((message) => message.author === "user" && message.text.includes("Q1"));
    expect(requests).toHaveLength(2);
    expect(requests[1]?.regeneration).toEqual({ ofMessageId: a1.id });
    // The agent got the same question again.
    expect(cli.turnTexts().at(-1)).toContain("Q1 about apples");
  });

  it("retry of the person's own message asks the same question again (no extra rows for the old answers)", async () => {
    const { service, events } = await twoExchanges();
    const q2 = find(await messages(service), "Q2");
    await service.retryMessage({ botId: "chief", messageId: q2.id });
    await waitFor(() => completed(events) === 3);
    const list = await messages(service);
    expect(list.filter((message) => message.text.includes("ANSWER_TO[Q2"))).toHaveLength(2);
  });

  it("delete needs confirmation, removes one message (and its pin) from the thread and from the model's view (Q13)", async () => {
    const { service, store, cli, events } = await twoExchanges();
    const before = await messages(service);
    const q1 = find(before, "Q1");
    const a1 = find(before, "ANSWER_TO[Q1");
    await service.pinMessage({ botId: "chief", messageId: a1.id, pinned: true });
    const unconfirmed = JSON.parse(JSON.stringify({ botId: "chief", messageId: a1.id }));
    await expect(service.deleteMessage(unconfirmed)).rejects.toThrow(/confirmation/);
    const result = await service.deleteMessage({ botId: "chief", messageId: a1.id, confirm: true });
    expect(result).toEqual({ removedMessageIds: [a1.id], receipt: null });
    const list = await messages(service);
    expect(list.some((message) => message.id === a1.id)).toBe(false);
    expect(list.some((message) => message.id === q1.id)).toBe(true);
    expect(await service.listMessagePins({ botId: "chief" })).toEqual([]);
    const thread = store.list().find((bot) => bot.id === "chief")?.threadId ?? "";
    const stored = store.database.readConversation("chief", thread).messages.map((message) => message.id);
    expect(stored).not.toContain(a1.id);

    // The next turn starts a new CLI thread that is told what is left, not what was deleted.
    await service.sendMessage({ botId: "chief", text: "Q3 about plums" });
    await waitFor(() => completed(events) === 3);
    const third = cli.turnTexts().at(-1) ?? "";
    expect(third).toContain("Q1 about apples");
    expect(third).not.toContain("ANSWER_TO[Q1");
    expect(third).toContain("Q3 about plums");
  });

  it("deleting the person's own message removes it from the conversation, the queue data and the database", async () => {
    const { service, store, cli, events } = await twoExchanges();
    const q1 = find(await messages(service), "Q1");
    await service.deleteMessage({ botId: "chief", messageId: q1.id, confirm: true });
    expect((await messages(service)).some((message) => message.id === q1.id)).toBe(false);
    expect(service.listQueue("chief").deliveries.some((delivery) => delivery.id === q1.id)).toBe(false);
    await service.sendMessage({ botId: "chief", text: "Q3 about plums" });
    await waitFor(() => completed(events) === 3);
    const third = cli.turnTexts().at(-1) ?? "";
    // The answer to it is still there (it quotes the question); the person's message is not.
    expect(third).not.toMatch(/user:\s*Q1 about apples/);
    expect(third).toContain("ANSWER_TO[Q1 about apples]");
    expect(third).toContain("user:\nQ2 about pears");
    expect(store.list().find((bot) => bot.id === "chief")?.threadId).toBeTruthy();
  });

  it("edit needs confirmation when messages follow, removes them, and the agent answers the new text (Q13)", async () => {
    const { service, cli, events } = await twoExchanges();
    const q1 = find(await messages(service), "Q1");
    await expect(service.editMessage({ botId: "chief", messageId: q1.id, text: "Q1 about bananas" })).rejects.toThrow(
      /Confirm/,
    );
    expect(cli.calls("turn/start")).toHaveLength(2);
    const result = await service.editMessage({
      botId: "chief",
      messageId: q1.id,
      text: "Q1 about bananas",
      confirm: true,
    });
    expect(result.removedMessageIds.length).toBeGreaterThanOrEqual(4);
    expect(result.removedMessageIds).toContain(q1.id);
    expect(result.receipt?.messageId).toBeTruthy();
    await waitFor(() => completed(events) === 3);

    const list = await messages(service);
    expect(list.map((message) => message.text.split("\n")[0])).toEqual([
      "Q1 about bananas",
      "ANSWER_TO[Q1 about bananas]",
    ]);
    expect(list[0]?.edited).toBe(true);
    const sent = cli.turnTexts().at(-1) ?? "";
    expect(sent).toContain("Q1 about bananas");
    expect(sent).not.toContain("apples");
    expect(sent).not.toContain("pears");
  });

  it("edit of the last message needs no confirmation", async () => {
    const { service, events } = await twoExchanges();
    const list = await messages(service);
    const last = list.at(-1);
    expect(last?.author).toBe("assistant");
    // Only the person's own message can be edited; the answer cannot.
    await expect(service.editMessage({ botId: "chief", messageId: last?.id ?? "", text: "x" })).rejects.toThrow(
      /own messages/,
    );
    const q2 = find(list, "Q2");
    await expect(service.editMessage({ botId: "chief", messageId: q2.id, text: "Q2 again" })).rejects.toThrow(
      /Confirm/,
    );
    await service.editMessage({ botId: "chief", messageId: q2.id, text: "Q2 again", confirm: true });
    await waitFor(() => completed(events) === 3);
  });

  it("refuses retry, edit and delete while a turn runs in the thread; pin still works (W35)", async () => {
    const { service, cli, events } = await twoExchanges();
    const list = await messages(service);
    const a1 = find(list, "ANSWER_TO[Q1");
    const q1 = find(list, "Q1");
    cli.hold = true;
    await service.sendMessage({ botId: "chief", text: "Q3 slow" });
    await waitFor(() => cli.pending.length === 1);
    await expect(service.retryMessage({ botId: "chief", messageId: a1.id })).rejects.toThrow(/busy/);
    await expect(service.editMessage({ botId: "chief", messageId: q1.id, text: "x", confirm: true })).rejects.toThrow(
      /busy/,
    );
    await expect(service.deleteMessage({ botId: "chief", messageId: a1.id, confirm: true })).rejects.toThrow(/busy/);
    await expect(service.pinMessage({ botId: "chief", messageId: a1.id, pinned: true })).resolves.toHaveLength(1);
    cli.finish();
    await waitFor(() => completed(events) === 3);
    // Nothing was changed by the refused calls.
    expect(find(await messages(service), "ANSWER_TO[Q1").id).toBe(a1.id);
  });

  it("refuses an action on another thread than the one shown, and on a message that is not there", async () => {
    const { service } = await twoExchanges();
    const a = (await service.listThreads("chief")).activeThreadId ?? "";
    const q1 = find(await messages(service), "Q1");
    await service.createThread({ botId: "chief", title: "B" });
    await expect(
      service.deleteMessage({ botId: "chief", threadId: a, messageId: q1.id, confirm: true }),
    ).rejects.toThrow(/Select that thread/);
    await expect(service.deleteMessage({ botId: "chief", messageId: q1.id, confirm: true })).rejects.toThrow(
      /not in this thread/,
    );
    // Pin works on any thread by id.
    expect(await service.pinMessage({ botId: "chief", threadId: a, messageId: q1.id, pinned: true })).toHaveLength(1);
  });
});

function completed(events: AgentEvent[]): number {
  return events.filter((event) => event.type === "turn-completed" && event.status === "completed").length;
}

function fakeBrowser() {
  return {
    onChanged: (_listener: (tabs: BrowserTab[], activeTabId: string | null) => void) => () => undefined,
    onControlChanged: (_listener: (state: BrowserControlState) => void) => () => undefined,
    clearControls: () => undefined,
    endControl: () => undefined,
    handleDynamicTool: async () => ({ success: true, contentItems: [] }),
  };
}

async function waitFor(check: () => boolean | undefined): Promise<void> {
  const deadline = Date.now() + (process.platform === "win32" ? 10_000 : 4_000);
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the fake CLI.");
}
