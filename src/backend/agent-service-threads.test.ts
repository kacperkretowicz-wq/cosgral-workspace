// @vitest-environment node
// COSGRAL W6-BE1: several threads per agent on the real AgentService, with an in-process fake Codex whose turns can be
// held open. One turn runs per agent at a time; each message, history, queue and card belongs to a thread.

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentEvent,
  BrowserControlState,
  BrowserTab,
  ConversationMessage,
  ThreadList,
  ThreadSummary,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentClient, AgentProvider } from "./agent-client";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { MailboxStore } from "./mailbox-store";
import type { AppServerNotification, RequestId, ResponseDecoder, RpcError } from "./protocol";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";

let root: string;
const services: AgentService[] = [];
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-agent-threads-"));
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

/** A fake Codex: answers at once, or holds a turn open until the test finishes it. */
class ThreadCli extends EventEmitter implements AgentClient {
  readonly provider: AgentProvider = "codex";
  readonly requests: Array<{ method: string; params: unknown }> = [];
  readonly pending: Array<{ threadId: string; turnId: string; text: string }> = [];
  hold = false;
  running = false;
  #threads = 0;

  start(): void {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  calls(method: string): unknown[] {
    return this.requests.filter((request) => request.method === method).map((request) => request.params);
  }

  /** The text of every turn started, in order. */
  turnTexts(): string[] {
    return this.calls("turn/start").map((params) => inputText(params));
  }

  async request<T>(method: string, params: unknown, decoder: ResponseDecoder<T>): Promise<T> {
    this.requests.push({ method, params: structuredClone(params) });
    let result: unknown;
    if (method === "initialize") result = {};
    if (method === "account/read")
      result = { account: { type: "chatgpt", email: "codex@example.com" }, requiresOpenaiAuth: false };
    if (method === "account/rateLimits/read") result = { rateLimits: null, rateLimitsByLimitId: null };
    if (method === "model/list") result = { data: ["gpt-5.6-luna", "gpt-5.6-terra"].map((model) => ({ model })) };
    if (method === "plugin/list") result = { marketplaces: [] };
    if (method === "thread/start") {
      this.#threads += 1;
      result = { thread: { id: `cli-thread-${this.#threads}` } };
    }
    if (method === "thread/resume" || method === "thread/read")
      result = { thread: { id: stringParam(params, "threadId"), turns: [] } };
    if (method === "thread/compact/start" || method === "turn/interrupt") result = {};
    if (method === "turn/start") {
      const threadId = stringParam(params, "threadId");
      const turnId = randomUUID();
      const text = inputText(params);
      setTimeout(() => {
        if (!this.running) return;
        this.emit("notification", notification("turn/started", { threadId, turn: { id: turnId } }));
        if (this.hold) this.pending.push({ threadId, turnId, text });
        else this.#answer({ threadId, turnId, text });
      }, 0);
      result = { turn: { id: turnId, status: "inProgress", items: [] } };
    }
    if (result === undefined) throw new Error(`Fake CLI does not implement ${method}.`);
    return decoder(result);
  }

  /** Finishes the oldest held turn. */
  finish(): void {
    const next = this.pending.shift();
    if (!next) throw new Error("No held turn.");
    this.#answer(next);
  }

  #answer(turn: { threadId: string; turnId: string; text: string }): void {
    const { threadId, turnId } = turn;
    const itemId = `${turnId}:assistant`;
    const answer = `ANSWER_TO[${firstLine(turn.text)}]`;
    const send = (method: string, params: unknown) => this.emit("notification", notification(method, params));
    send("item/started", { threadId, turnId, item: { id: itemId, type: "agentMessage", text: "" } });
    send("item/agentMessage/delta", { threadId, turnId, itemId, delta: answer });
    send("item/completed", { threadId, turnId, item: { id: itemId, type: "agentMessage", text: answer } });
    send("turn/completed", { threadId, turn: { id: turnId, status: "completed" } });
  }

  notify(): void {}
  respond(_id: RequestId, _result: unknown): void {}
  respondError(_id: RequestId, _error: RpcError): void {}
}

interface Fixture {
  service: AgentService;
  store: BotStore;
  mailbox: MailboxStore;
  cli: ThreadCli;
  events: AgentEvent[];
}

async function fixture(cli = new ThreadCli()): Promise<Fixture> {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  services.push(service);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  await service.initialize();
  await store.getOrCreate("chief");
  await store.getOrCreate("scout");
  return { service, store, mailbox, cli, events };
}

describe.sequential("AgentService with several threads per agent", {
  timeout: process.platform === "win32" ? 30_000 : 10_000,
}, () => {
  it("keeps the history of each thread apart, and gives each thread its own CLI thread", async () => {
    const { service: s, cli, events } = await fixture();
    await s.sendMessage({ botId: "chief", text: "Question in A" });
    await waitFor(() => completed(events) === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const b = (await s.createThread({ botId: "chief", title: "Thread B" })).activeThreadId ?? "";
    expect(b).not.toBe(a);
    await s.sendMessage({ botId: "chief", text: "Question in B" });
    await waitFor(() => completed(events) === 2);

    let conversation = await s.readConversation("chief");
    expect(conversation.threadId).toBe(b);
    expect(texts(conversation.messages)).toEqual(["Question in B", "ANSWER_TO[Question in B]"]);
    await s.selectThread({ botId: "chief", threadId: a });
    conversation = await s.readConversation("chief");
    expect(conversation.threadId).toBe(a);
    expect(texts(conversation.messages)).toEqual(["Question in A", "ANSWER_TO[Question in A]"]);
    // Two threads of the agent are two threads of the CLI, each asked in its own.
    expect(cli.calls("thread/start")).toHaveLength(2);
    expect(new Set(cli.calls("turn/start").map((params) => stringParam(params, "threadId"))).size).toBe(2);
    // The window is told: the agent's thread changed and the list changed.
    expect(events.some((event) => event.type === "threads-changed" && event.activeThreadId === a)).toBe(true);
    expect(s.listBots().find((bot) => bot.id === "chief")?.threadId).toBe(a);
  });

  it("a turn goes on in its own thread when the person switches away, and the answer lands there", async () => {
    const { service: s, store, cli, events } = await fixture();
    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "Long question in A" });
    await waitFor(() => cli.pending.length === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    expect(find(await s.listThreads("chief"), a).state).toBe("running");

    const b = (await s.createThread({ botId: "chief" })).activeThreadId ?? "";
    // The window shows thread B: empty, and no turn of its own.
    const shown = await s.readConversation("chief");
    expect(shown).toMatchObject({ threadId: b, activeTurnId: null });
    expect(shown.messages).toEqual([]);
    const list = await s.listThreads("chief");
    expect(find(list, a).state).toBe("running");
    expect(find(list, b).state).toBe("idle");

    cli.finish();
    await waitFor(() => completed(events) === 1);
    const after = await s.listThreads("chief");
    expect(find(after, a)).toMatchObject({ state: "idle", unread: 1, preview: "ANSWER_TO[Long question in A]" });
    expect(texts(store.database.readConversation("chief", a).messages)).toContain("ANSWER_TO[Long question in A]");
    expect(store.database.readConversation("chief", b).messages).toEqual([]);
    expect((await s.readConversation("chief")).messages).toEqual([]);
    // The light updates the window follows: running first, idle at the end.
    const states = events.flatMap((event) =>
      event.type === "thread-activity" && event.threadId === a ? [event.state] : [],
    );
    expect(states).toContain("running");
    expect(states.at(-1)).toBe("idle");
  });

  it("nothing from a background thread reaches the window's live conversation: only light thread updates do", async () => {
    const { service: s, cli, events } = await fixture();
    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "Streams in A" });
    await waitFor(() => cli.pending.length === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const b = (await s.createThread({ botId: "chief" })).activeThreadId ?? "";
    const from = events.length;
    cli.hold = false;
    cli.finish();
    await waitFor(() => completed(events) === 1);
    // Let the delta timer (100 ms) fire as well.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const leaked = events.slice(from).filter((event) => {
      if (event.type === "conversation-delta") return event.threadId !== b;
      if (event.type === "conversation") return event.snapshot.threadId !== b;
      return false;
    });
    expect(leaked).toEqual([]);
    // What the window is told instead: the thread's state, the unread answer.
    expect(
      events
        .slice(from)
        .some((event) => event.type === "thread-activity" && event.threadId === a && event.unread === 1),
    ).toBe(true);
  });

  it("a message sent in another thread waits for the running turn, then runs in its own thread", async () => {
    const { service: s, store, cli, events } = await fixture();
    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "First in A" });
    await waitFor(() => cli.pending.length === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const b = (await s.createThread({ botId: "chief" })).activeThreadId ?? "";
    await s.sendMessage({ botId: "chief", text: "Second in B" });
    // One turn per agent: B's message is queued, in B's queue.
    expect(s.listQueue("chief").deliveries.map((item) => `${item.status}:${item.text}`)).toEqual([
      "queued:Second in B",
    ]);
    expect(cli.calls("turn/start")).toHaveLength(1);
    cli.hold = false;
    cli.finish();
    await waitFor(() => completed(events) === 2);
    expect(texts(store.database.readConversation("chief", a).messages)).toEqual([
      "First in A",
      "ANSWER_TO[First in A]",
    ]);
    expect(texts(store.database.readConversation("chief", b).messages)).toEqual([
      "Second in B",
      "ANSWER_TO[Second in B]",
    ]);
  });

  it("keeps the queue of each thread: what waits in A does not run, or show, while B is active, and comes back with A", async () => {
    const { service: s, cli, events } = await fixture();
    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "A1" });
    await waitFor(() => cli.pending.length === 1);
    await s.sendMessage({ botId: "chief", text: "A2" });
    await s.sendMessage({ botId: "chief", text: "A3" });
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    expect(s.listQueue("chief").deliveries.filter((item) => item.status === "queued")).toHaveLength(2);

    const b = (await s.createThread({ botId: "chief" })).activeThreadId ?? "";
    expect(s.listQueue("chief").deliveries).toEqual([]);
    expect(find(await s.listThreads("chief"), a).queued).toBe(2);
    expect(find(await s.listThreads("chief"), b).queued).toBe(0);

    cli.hold = false;
    cli.finish();
    await waitFor(() => completed(events) === 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    // A's turn ended; the active thread is B and has nothing to run: A2 and A3 still wait.
    expect(cli.calls("turn/start")).toHaveLength(1);
    expect(find(await s.listThreads("chief"), a).queued).toBe(2);

    await s.selectThread({ botId: "chief", threadId: a });
    await waitFor(() => completed(events) === 3);
    expect(cli.turnTexts().map(firstLine)).toEqual(["A1", "A2", "A3"]);
    expect(s.listQueue("chief").deliveries.filter((item) => item.status === "queued")).toEqual([]);
  });

  it("archiving the thread of a running turn lets the turn finish, and nothing new reaches the archived thread", async () => {
    const { service: s, store, cli, events } = await fixture();
    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "Running in A" });
    await waitFor(() => cli.pending.length === 1);
    await s.sendMessage({ botId: "chief", text: "Waiting in A" });
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const list = await s.archiveThread({ botId: "chief", threadId: a });
    expect(find(list, a).state).toBe("archived");
    expect(list.activeThreadId).not.toBe(a);
    cli.hold = false;
    cli.finish();
    await waitFor(() => completed(events) === 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const after = await s.listThreads("chief");
    expect(find(after, a)).toMatchObject({ state: "archived", queued: 1 });
    expect(texts(store.database.readConversation("chief", a).messages)).toContain("ANSWER_TO[Running in A]");
    // The message that waited in the archived thread was not started.
    expect(cli.calls("turn/start")).toHaveLength(1);
    // Restored and selected, it goes on.
    await s.restoreThread({ botId: "chief", threadId: a });
    await s.selectThread({ botId: "chief", threadId: a });
    await waitFor(() => completed(events) === 2);
    expect(cli.turnTexts().map(firstLine)).toEqual(["Running in A", "Waiting in A"]);
  });

  it("deletes a thread with its queue, and refuses while its turn runs", async () => {
    const { service: s, mailbox, cli } = await fixture();
    await s.setQueuePaused("chief", true);
    await s.sendMessage({ botId: "chief", text: "Queued 1" });
    await s.sendMessage({ botId: "chief", text: "Queued 2" });
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const b = (await s.createThread({ botId: "chief" })).activeThreadId ?? "";
    expect(find(await s.listThreads("chief"), a).queued).toBe(2);
    const list = await s.deleteThread({ botId: "chief", threadId: a, confirm: true });
    expect(list.threads.map((thread) => thread.id)).toEqual([b]);
    expect(mailbox.listQueue("chief").deliveries).toEqual([]);
    await s.setQueuePaused("chief", false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cli.calls("turn/start")).toEqual([]);

    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "Now running in B" });
    await waitFor(() => cli.pending.length === 1);
    await s.createThread({ botId: "chief" });
    await expect(s.deleteThread({ botId: "chief", threadId: b, confirm: true })).rejects.toThrow(/turn is running/);
  });

  it("keeps two agents apart: each runs its own turn in its own thread", async () => {
    const { service: s, cli, events } = await fixture();
    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "Chief asks" });
    await s.sendMessage({ botId: "scout", text: "Scout asks" });
    await waitFor(() => cli.pending.length === 2);
    const chiefB = (await s.createThread({ botId: "chief" })).activeThreadId ?? "";
    expect((await s.listThreads("scout")).threads).toHaveLength(1);
    expect(find(await s.listThreads("scout"), (await s.listThreads("scout")).activeThreadId ?? "").state).toBe(
      "running",
    );
    expect((await s.readConversation("scout")).activeTurnId).not.toBeNull();
    expect((await s.readConversation("chief")).threadId).toBe(chiefB);
    cli.hold = false;
    cli.finish();
    cli.finish();
    await waitFor(() => completed(events) === 2);
    expect(texts((await s.readConversation("scout")).messages)).toEqual(["Scout asks", "ANSWER_TO[Scout asks]"]);
  });

  it("remembers the threads, their titles, the active thread and every history after a restart", async () => {
    const first = await fixture();
    await first.service.sendMessage({ botId: "chief", text: "Before restart in A" });
    await waitFor(() => completed(first.events) === 1);
    const a = (await first.service.listThreads("chief")).activeThreadId ?? "";
    const b = (await first.service.createThread({ botId: "chief", title: "Kept title" })).activeThreadId ?? "";
    await first.service.sendMessage({ botId: "chief", text: "Before restart in B" });
    await waitFor(() => completed(first.events) === 2);
    const sessionOfA = first.store.database.listProviderSessions(a)[0]?.externalSessionId ?? "";
    await first.service.stop();
    closeTestDatabases();

    const second = await fixture();
    const list = await second.service.listThreads("chief");
    expect(list.activeThreadId).toBe(b);
    expect(find(list, b)).toMatchObject({ title: "Kept title", titled: true });
    expect(find(list, a).title).toBe("Before restart in A");
    expect(texts((await second.service.readConversation("chief")).messages)).toEqual([
      "Before restart in B",
      "ANSWER_TO[Before restart in B]",
    ]);
    await second.service.selectThread({ botId: "chief", threadId: a });
    expect(texts((await second.service.readConversation("chief")).messages)).toEqual([
      "Before restart in A",
      "ANSWER_TO[Before restart in A]",
    ]);
    // The thread of the CLI is found again: the next message goes to the same CLI thread as before, resumed.
    await second.service.sendMessage({ botId: "chief", text: "After restart in A" });
    await waitFor(() => completed(second.events) === 1);
    expect(second.cli.calls("thread/start")).toHaveLength(0);
    expect(second.cli.calls("turn/start").map((params) => stringParam(params, "threadId"))).toEqual([sessionOfA]);
  });

  it("opens a database made before threads: the old conversation is the first thread and keeps working", async () => {
    const first = await fixture();
    await first.service.sendMessage({ botId: "chief", text: "Written before threads" });
    await waitFor(() => completed(first.events) === 1);
    const id = first.store.list().find((bot) => bot.id === "chief")?.threadId ?? "";
    first.store.database.connection.exec("DROP TABLE projection_thread_meta");
    await first.service.stop();
    closeTestDatabases();

    const second = await fixture();
    const list = await second.service.listThreads("chief");
    expect(list.threads).toHaveLength(1);
    expect(list.threads[0]).toMatchObject({ id, active: true, title: "Written before threads" });
    expect(texts((await second.service.readConversation("chief")).messages)).toEqual([
      "Written before threads",
      "ANSWER_TO[Written before threads]",
    ]);
    await second.service.sendMessage({ botId: "chief", text: "Still the same thread" });
    await waitFor(() => completed(second.events) === 1);
    expect((await second.service.readConversation("chief")).threadId).toBe(id);
  });

  it("shows the open cards of each thread: the card stays in its thread when the person switches", async () => {
    const { service: s } = await fixture();
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const answer = s.confirmForPerson("chief", { title: "Send the report?", preview: "To the team." });
    await waitFor(() => s.listPendingRequests().length === 1);
    expect(find(await s.listThreads("chief"), a)).toMatchObject({ state: "waiting", needsYou: 1 });
    const b = (await s.createThread({ botId: "chief" })).activeThreadId ?? "";
    const list = await s.listThreads("chief");
    expect(find(list, a)).toMatchObject({ state: "waiting", needsYou: 1 });
    expect(find(list, b)).toMatchObject({ state: "idle", needsYou: 0 });
    const request = s.listPendingRequests()[0];
    if (request?.kind !== "draft-preview") throw new Error("Expected a card.");
    await s.respondToDraftPreview({ requestId: request.card.requestId, decision: "send" });
    await expect(answer).resolves.toBe("send");
    expect(find(await s.listThreads("chief"), a).state).toBe("idle");
  });

  it("branches a thread from a message: the new thread starts with that history and tells its agent about it", async () => {
    const { service: s, cli, events } = await fixture();
    await s.sendMessage({ botId: "chief", text: "Question in A" });
    await waitFor(() => completed(events) === 1);
    await s.sendMessage({ botId: "chief", text: "Second question in A" });
    await waitFor(() => completed(events) === 2);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    const conversation = await s.readConversation("chief");
    const answer = conversation.messages.find((message) => message.text === "ANSWER_TO[Question in A]");
    if (!answer) throw new Error("No first answer.");
    const list = await s.branchThread({ botId: "chief", threadId: a, fromMessageId: answer.id });
    const branch = list.activeThreadId ?? "";
    expect(find(list, branch)).toMatchObject({ parentThreadId: a, branchedFromMessageId: answer.id, active: true });
    expect(texts((await s.readConversation("chief")).messages)).toEqual(["Question in A", "ANSWER_TO[Question in A]"]);
    // The original thread is untouched.
    expect(
      texts(
        (
          await s
            .readConversation("chief")
            .then(() => s.selectThread({ botId: "chief", threadId: a }).then(() => s.readConversation("chief")))
        ).messages,
      ),
    ).toHaveLength(4);
    await s.selectThread({ botId: "chief", threadId: branch });
    await s.sendMessage({ botId: "chief", text: "Continue from the branch" });
    await waitFor(() => completed(events) === 3);
    // The CLI thread of the branch is new, and its first message carries what was said before.
    const last = cli.turnTexts().at(-1) ?? "";
    expect(last).toContain("Question in A");
    expect(last).toContain("Continue from the branch");
    expect(last).not.toContain("Second question in A");
  });

  it("the agent row says in which thread it works, also when that is not the thread on screen", async () => {
    const { service: s, cli } = await fixture();
    cli.hold = true;
    await s.sendMessage({ botId: "chief", text: "Work in A" });
    await waitFor(() => cli.pending.length === 1);
    const a = (await s.listThreads("chief")).activeThreadId ?? "";
    await s.createThread({ botId: "chief", title: "Elsewhere" });
    const row = s.listActivity().find((item) => item.botId === "chief");
    expect(row).toMatchObject({ kind: "working", workingThread: { id: a, title: "Work in A", background: true } });
    cli.hold = false;
    cli.finish();
    await waitFor(() => s.listActivity().find((item) => item.botId === "chief")?.kind === "idle");
    expect(s.listActivity().find((item) => item.botId === "chief")?.workingThread ?? null).toBeNull();
  });
});

function completed(events: AgentEvent[]): number {
  return events.filter((event) => event.type === "turn-completed" && event.status === "completed").length;
}

function find(list: ThreadList, id: string): ThreadSummary {
  const thread = list.threads.find((item) => item.id === id);
  if (!thread) throw new Error(`No thread ${id}.`);
  return thread;
}

/** The visible text of a conversation, in order (the answers of the fake included). */
function texts(messages: ConversationMessage[]): string[] {
  return messages.filter((message) => message.text.trim()).map((message) => message.text);
}

function firstLine(value: string): string {
  return value.split("\n")[0]?.trim() ?? "";
}

function inputText(params: unknown): string {
  if (!isDynamicRecord(params) || !Array.isArray(params.input)) return "";
  const first = params.input[0];
  return isDynamicRecord(first) && isString(first.text) ? first.text : "";
}

function notification(method: string, params: unknown): AppServerNotification {
  return { method, params };
}

function stringParam(value: unknown, key: string): string {
  if (!isDynamicRecord(value)) throw new Error(`${key} is missing.`);
  const result = value[key];
  if (!isString(result)) throw new Error(`${key} is missing.`);
  return result;
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
