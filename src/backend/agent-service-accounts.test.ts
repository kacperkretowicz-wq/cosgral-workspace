// @vitest-environment node
// COSGRAL W5-K1: provider accounts in front of the real AgentService: which account answers a turn and what a usage
// limit does, tested with fake CLI processes (one per account) and a fake pool of accounts.

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AccountsSnapshot,
  AgentEvent,
  BrowserControlState,
  BrowserTab,
  ProviderAccount,
  ProviderAccountProvider,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AccountPoolPort } from "./account-router";
import { AcpAgentClient } from "./acp-client";
import type { AgentClient, AgentProvider } from "./agent-client";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { MailboxStore } from "./mailbox-store";
import type { AppServerNotification, RequestId, ResponseDecoder, RpcError } from "./protocol";
import { ProviderRegistry } from "./provider-registry";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";

const SYSTEM = "system-codex";
const WORK = "acc-aaaaaaaa";
const HOME = "acc-bbbbbbbb";

let root: string;
let service: AgentService | null = null;
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-accounts-test-"));
  // Only `--version` is ever run: the clients themselves are in-process fakes.
  process.env.OPENBOT_CODEX_PATH = await writeFakeCli(
    join(root, "Codex CLI"),
    "codex",
    `if (process.argv.includes("--version")) process.stdout.write("codex-cli 0.144.1\\n");`,
  );
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude");
});

afterEach(async () => {
  await service?.stop();
  service = null;
  if (originalCodexPath === undefined) delete process.env.OPENBOT_CODEX_PATH;
  else process.env.OPENBOT_CODEX_PATH = originalCodexPath;
  if (originalClaudePath === undefined) delete process.env.OPENBOT_CLAUDE_PATH;
  else process.env.OPENBOT_CLAUDE_PATH = originalClaudePath;
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

/** What a fake CLI does with its next turn. */
type Step = "answer" | { limit: true; action?: boolean; resetsInSeconds?: number; before?: () => void };

/** A fake CLI process of one account (or of the system account): scripted turns, its own thread ids. */
class AccountCli extends EventEmitter implements AgentClient {
  readonly requests: Array<{ method: string; params: unknown }> = [];
  running = false;
  #threads = 0;

  constructor(
    readonly provider: AgentProvider,
    readonly name: string,
    readonly script: Step[] = [],
  ) {
    super();
  }

  start(): void {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  calls(method: string): unknown[] {
    return this.requests.filter((request) => request.method === method).map((request) => request.params);
  }

  async request<T>(method: string, params: unknown, decoder: ResponseDecoder<T>): Promise<T> {
    this.requests.push({ method, params: structuredClone(params) });
    let result: unknown;
    if (method === "initialize") result = {};
    if (method === "account/read") {
      result = { account: { type: "chatgpt", email: `${this.name}@example.com` }, requiresOpenaiAuth: false };
    }
    if (method === "account/rateLimits/read") result = { rateLimits: null, rateLimitsByLimitId: null };
    if (method === "model/list") {
      result = { data: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"].map((model) => ({ model })) };
    }
    if (method === "plugin/list") result = { marketplaces: [] };
    if (method === "thread/start") {
      this.#threads += 1;
      result = { thread: { id: `${this.name}-thread-${this.#threads}` } };
    }
    if (method === "thread/resume" || method === "thread/read") {
      result = { thread: { id: stringParam(params, "threadId"), turns: [] } };
    }
    if (method === "thread/compact/start" || method === "turn/interrupt") result = {};
    if (method === "turn/start") {
      const threadId = stringParam(params, "threadId");
      const turnId = randomUUID();
      const step = this.script.shift() ?? "answer";
      setTimeout(() => this.#play(step, threadId, turnId), 0);
      result = { turn: { id: turnId, status: "inProgress", items: [] } };
    }
    if (result === undefined) throw new Error(`Fake CLI does not implement ${method}.`);
    return decoder(result);
  }

  #play(step: Step, threadId: string, turnId: string): void {
    if (!this.running) return;
    const send = (method: string, params: unknown) => this.emit("notification", notification(method, params));
    send("turn/started", { threadId, turn: { id: turnId } });
    if (step === "answer") {
      const itemId = `${turnId}:assistant`;
      const text = `ANSWER_FROM_${this.name}`;
      send("item/started", { threadId, turnId, item: { id: itemId, type: "agentMessage", text: "" } });
      send("item/agentMessage/delta", { threadId, turnId, itemId, delta: text });
      send("item/completed", { threadId, turnId, item: { id: itemId, type: "agentMessage", text } });
      send("turn/completed", { threadId, turn: { id: turnId, status: "completed" } });
      return;
    }
    step.before?.();
    if (step.action) {
      const item = { id: `${turnId}:command`, type: "commandExecution", command: "touch file" };
      send("item/started", { threadId, turnId, item });
      send("item/completed", { threadId, turnId, item });
    }
    send("error", {
      threadId,
      turnId,
      message: "You have reached your usage limit.",
      errorKind: "usage-limit",
      resetsAt: Math.floor(Date.now() / 1000) + (step.resetsInSeconds ?? 3600),
    });
    send("turn/completed", { threadId, turn: { id: turnId, status: "failed" } });
  }

  notify(): void {}
  respond(_id: RequestId, _result: unknown): void {}
  respondError(_id: RequestId, _error: RpcError): void {}
}

/** The accounts the program knows: this computer's own plus two more, in the order system, Work, Home. */
class FakePool implements AccountPoolPort {
  accounts: ProviderAccount[] = [
    makeAccount(SYSTEM, "codex", { label: "This computer", poolOrder: 1, isDefault: true, system: true }),
    makeAccount(WORK, "codex", { label: "Work", poolOrder: 2 }),
    makeAccount(HOME, "codex", { label: "Home", poolOrder: 3 }),
  ];
  assignments: Array<{ botId: string; accountId: string | null }> = [];
  active = new Map<string, string>();
  limitCalls: Array<{ id: string; until: string | null }> = [];

  snapshot(): AccountsSnapshot {
    return structuredClone({
      accounts: this.accounts,
      pool: { maxAccountsPerProvider: 3, switchBeforeFirstAction: true },
      assignments: this.assignments,
    });
  }

  environment(id: string): NodeJS.ProcessEnv {
    return { CODEX_HOME: `state/${id}` };
  }

  async limitUntil(id: string, until: Date | null): Promise<ProviderAccount> {
    const found = this.accounts.find((item) => item.id === id);
    if (!found) throw new Error("Unknown account.");
    found.limitedUntil = until ? until.toISOString() : null;
    this.limitCalls.push({ id, until: found.limitedUntil });
    return found;
  }

  setActive(botId: string, accountId: string | null): void {
    if (accountId) this.active.set(botId, accountId);
    else this.active.delete(botId);
  }

  assign(botId: string, accountId: string): void {
    this.assignments = [...this.assignments.filter((item) => item.botId !== botId), { botId, accountId }];
  }

  remove(id: string): void {
    this.accounts = this.accounts.filter((item) => item.id !== id);
    this.assignments = this.assignments.filter((item) => item.accountId !== id);
  }

  set(id: string, fields: Partial<ProviderAccount>): void {
    Object.assign(this.accounts.find((item) => item.id === id) ?? {}, fields);
  }
}

function makeAccount(
  id: string,
  provider: ProviderAccountProvider,
  fields: Partial<ProviderAccount> = {},
): ProviderAccount {
  return {
    id,
    provider,
    label: id,
    stateDir: fields.system ? "System" : id,
    system: false,
    loggedIn: true,
    account: null,
    plan: null,
    isDefault: false,
    inPool: true,
    poolOrder: 1,
    enabled: true,
    limitedUntil: null,
    login: { phase: "idle", message: null, url: null, userCode: null },
    checkedAt: "2026-11-16T11:00:00.000Z",
    ...fields,
  };
}

interface Fixture {
  service: AgentService;
  pool: FakePool;
  store: BotStore;
  events: AgentEvent[];
  /** The fake CLI of each account, by account id (the system account is the provider's normal client). */
  clis: Map<string, AccountCli>;
}

/** An AgentService on fake CLIs; `scripts` are the turn scripts per account id. */
async function fixture(
  scripts: Record<string, Step[]> = {},
  options: { attach?: boolean; backupModel?: boolean } = {},
): Promise<Fixture> {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const pool = new FakePool();
  const clis = new Map<string, AccountCli>();
  let registry: ProviderRegistry | null = null;
  service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", (provider, _cli, env) => {
    // The fallback model is an ACP stub program: the real client talks to it; every other provider is not part of this test.
    if (provider === "acp") return new AcpAgentClient({ agents: () => registry?.listAcpAgents() ?? [] });
    if (provider !== "codex") throw new Error("No Claude CLI in this test.");
    const accountId = env?.CODEX_HOME?.replace("state/", "") ?? SYSTEM;
    const client = new AccountCli(provider, accountId, scripts[accountId] ?? []);
    clis.set(accountId, client);
    return client;
  });
  if (options.attach !== false) service.useAccounts(pool);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  const current = service;
  if (options.backupModel) {
    registry = new ProviderRegistry({ database: store.database, emit: (event) => current.relay(event), timers: false });
    current.useProviders(registry);
  }
  await service.initialize();
  if (registry) {
    // A model of another provider as the fallback: the ACP stub (a program, not a model).
    registry.saveAcpAgent({
      id: "backup",
      name: "ACP backup",
      command: process.execPath,
      args: [join(__dirname, "testing", "acp-stub.mjs"), "backup"],
    });
    await store.getOrCreate("chief");
    registry.setFallbackModels({ botId: "chief", fallbackModels: ["acp:backup"] });
  }
  return { service, pool, store, events, clis };
}

describe.sequential("AgentService with provider accounts", {
  timeout: process.platform === "win32" ? 20_000 : 8_000,
}, () => {
  it("changes nothing when no account pool is attached", async () => {
    const { service: s, clis, events } = await fixture({}, { attach: false });
    await s.sendMessage({ botId: "chief", text: "Hello" });
    await waitFor(() => completed(events).length === 1);
    expect([...clis.keys()]).toEqual([SYSTEM]);
    expect(await answers(s)).toEqual(["ANSWER_FROM_system-codex"]);
    expect(events.some((event) => event.type === "account-switched" || event.type === "account-limit-reached")).toBe(
      false,
    );
  });

  it("changes nothing when the other accounts are switched off", async () => {
    const { service: s, pool, clis, events } = await fixture();
    pool.set(WORK, { enabled: false });
    pool.set(HOME, { inPool: false });
    await s.sendMessage({ botId: "chief", text: "Hello" });
    await waitFor(() => completed(events).length === 1);
    expect([...clis.keys()]).toEqual([SYSTEM]);
    expect(pool.active.size).toBe(0);
  });

  it("starts the agent's own account first, with that account's state folder as the CLI environment only", async () => {
    const { service: s, pool, clis, events } = await fixture();
    await s.sendMessage({ botId: "chief", text: "Warm up" });
    await waitFor(() => completed(events).length === 1);
    pool.assign("chief", WORK);
    await s.sendMessage({ botId: "chief", text: "Hello from the work account" });
    await waitFor(() => completed(events).length === 2);
    const work = clis.get(WORK);
    expect(work?.calls("turn/start")).toHaveLength(1);
    expect(clis.get(SYSTEM)?.calls("turn/start")).toHaveLength(1);
    expect(pool.active.get("chief")).toBe(WORK);
    expect(await answers(s)).toContain("ANSWER_FROM_acc-aaaaaaaa");
    // The thread of that account is new and carries a hand-off of the earlier conversation.
    expect(work?.calls("thread/start")).toHaveLength(1);
    expect(firstInputText(work?.calls("turn/start")[0])).toContain("Hello from the work account");
    // Assigning an account is the person's choice: no "switched" card for it.
    expect(events.some((event) => event.type === "account-switched")).toBe(false);
  });

  it("moves a turn that hit the limit before any action to the next account, and says so", async () => {
    const { service: s, pool, clis, events } = await fixture({ [SYSTEM]: [{ limit: true }] });
    await s.sendMessage({ botId: "chief", text: "Please help" });
    await waitFor(() => completed(events).some((status) => status === "completed"));
    expect(clis.get(SYSTEM)?.calls("turn/start")).toHaveLength(1);
    expect(clis.get(WORK)?.calls("turn/start")).toHaveLength(1);
    // The request is repeated word for word on the next account.
    expect(firstInputText(clis.get(WORK)?.calls("turn/start")[0])).toContain("Please help");
    expect(pool.limitCalls.map((call) => call.id)).toEqual([SYSTEM]);
    expect(pool.accounts.find((item) => item.id === SYSTEM)?.limitedUntil).not.toBeNull();
    expect(pool.active.get("chief")).toBe(WORK);
    expect(limitEvents(events)).toMatchObject([
      {
        botId: "chief",
        accountId: SYSTEM,
        accountLabel: "This computer",
        outcome: "switched",
        nextAccountId: WORK,
        nextAccountLabel: "Work",
        afterAction: false,
        resetsAtAssumed: false,
      },
    ]);
    expect(switchEvents(events)).toMatchObject([
      { botId: "chief", fromAccountId: SYSTEM, toAccountId: WORK, toLabel: "Work", reason: "usage-limit" },
    ]);
    // The failed attempt is not the end of the conversation: one answer, from the next account.
    expect(await answers(s)).toEqual(["ANSWER_FROM_acc-aaaaaaaa"]);
    expect(completed(events)).toEqual(["failed", "completed"]);
  });

  it("does not switch silently after the turn changed something: it asks, and Continue repeats it on the next account", async () => {
    const { service: s, clis, events } = await fixture({ [SYSTEM]: [{ limit: true, action: true }] });
    await s.sendMessage({ botId: "chief", text: "Rename the files" });
    await waitFor(() => pendingCards(s).length === 1);
    const card = pendingCards(s)[0];
    expect(card?.title).toBe("Limit reached on This computer. Continue on Work?");
    expect(limitEvents(events)).toMatchObject([{ outcome: "asks", afterAction: true, nextAccountId: WORK }]);
    // Nothing moved on its own.
    expect(clis.get(WORK)).toBeUndefined();
    expect(switchEvents(events)).toEqual([]);

    await s.respondToDraftPreview({ requestId: card?.requestId ?? "", decision: "send" });
    await waitFor(() => completed(events).includes("completed"));
    expect(clis.get(WORK)?.calls("turn/start")).toHaveLength(1);
    expect(switchEvents(events)).toMatchObject([{ fromAccountId: SYSTEM, toAccountId: WORK, reason: "usage-limit" }]);
  });

  it("repeats nothing when the person keeps the draft instead of continuing", async () => {
    const { service: s, clis, events } = await fixture({ [SYSTEM]: [{ limit: true, action: true }] });
    await s.sendMessage({ botId: "chief", text: "Rename the files" });
    await waitFor(() => pendingCards(s).length === 1);
    await s.respondToDraftPreview({ requestId: pendingCards(s)[0]?.requestId ?? "", decision: "keep-draft" });
    await waitFor(() => pendingCards(s).length === 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(clis.get(WORK)).toBeUndefined();
    expect(completed(events)).toEqual(["failed"]);
  });

  it("stops after every account has hit its limit: one try each, no loop, and says when it is free again", async () => {
    const {
      service: s,
      pool,
      clis,
      events,
    } = await fixture({
      [SYSTEM]: [{ limit: true, resetsInSeconds: 7200 }],
      [WORK]: [{ limit: true, resetsInSeconds: 3600 }],
      [HOME]: [{ limit: true, resetsInSeconds: 5400 }],
    });
    await s.sendMessage({ botId: "chief", text: "Anything" });
    await waitFor(() => completed(events).length === 3);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(completed(events)).toEqual(["failed", "failed", "failed"]);
    expect([SYSTEM, WORK, HOME].map((id) => clis.get(id)?.calls("turn/start").length)).toEqual([1, 1, 1]);
    expect(limitEvents(events).map((event) => event.outcome)).toEqual(["switched", "switched", "exhausted"]);
    const last = limitEvents(events)[2];
    expect(last).toMatchObject({ accountId: HOME, nextAccountId: null, nextAccountLabel: null });
    expect(pool.limitCalls.map((call) => call.id)).toEqual([SYSTEM, WORK, HOME]);
    // Nothing waits in the queue and the chat shows no answer.
    expect(s.listQueue("chief").deliveries.filter((delivery) => delivery.status === "queued")).toEqual([]);
    expect(await answers(s)).toEqual([]);
  });

  it("tries every other account before the fallback model (account layer first, then the next model)", async () => {
    const {
      service: s,
      clis,
      events,
    } = await fixture(
      { [SYSTEM]: [{ limit: true }], [WORK]: [{ limit: true }], [HOME]: [{ limit: true }] },
      { backupModel: true },
    );
    await s.sendMessage({ botId: "chief", text: "Anything" });
    await waitFor(() => events.some((event) => event.type === "model-fallback"));
    await waitFor(() => completed(events).includes("completed"));
    const order = events.flatMap((event) =>
      event.type === "account-limit-reached"
        ? [`limit:${event.outcome}`]
        : event.type === "model-fallback"
          ? ["model"]
          : [],
    );
    // Two accounts hand the turn over, the third has nobody to hand it to, and only then the model changes.
    expect(order).toEqual(["limit:switched", "limit:switched", "limit:exhausted", "model"]);
    expect([SYSTEM, WORK, HOME].map((id) => clis.get(id)?.calls("turn/start").length)).toEqual([1, 1, 1]);
    expect(await lastAnswer(s)).toContain("ACP stub (not a model)");
  });

  it("goes back to the first account after its limit has passed", async () => {
    const { service: s, pool, clis, events } = await fixture({ [SYSTEM]: [{ limit: true }] });
    await s.sendMessage({ botId: "chief", text: "First" });
    await waitFor(() => completed(events).includes("completed"));
    expect(pool.active.get("chief")).toBe(WORK);
    // The window has reset (the router clears the mark on its timer; here the pool says it directly).
    pool.set(SYSTEM, { limitedUntil: null });
    await s.sendMessage({ botId: "chief", text: "Second" });
    await waitFor(() => completed(events).length === 3);
    expect(clis.get(SYSTEM)?.calls("turn/start")).toHaveLength(2);
    expect(pool.active.get("chief")).toBe(SYSTEM);
    expect(switchEvents(events).map((event) => event.reason)).toEqual(["usage-limit", "returned"]);
    // The conversation goes on in a new thread of the first account, with the earlier history handed over.
    expect(clis.get(SYSTEM)?.calls("thread/start")).toHaveLength(2);
    expect(firstInputText(clis.get(SYSTEM)?.calls("turn/start")[1])).toContain("Second");
  });

  it("goes on without the account when it is removed while its turn runs", async () => {
    let remove = (): void => undefined;
    const { service: s, pool, clis, events } = await fixture({ [WORK]: [{ limit: true, before: () => remove() }] });
    remove = () => pool.remove(WORK);
    pool.assign("chief", WORK);
    await s.sendMessage({ botId: "chief", text: "On the work account" });
    await waitFor(() => completed(events).length === 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    // There is no account to mark: no switch, no card for it, and the message is not lost in a loop.
    expect(completed(events)).toEqual(["failed"]);
    expect(limitEvents(events)).toEqual([]);
    expect(clis.get(WORK)?.calls("turn/start")).toHaveLength(1);
    // The next message uses the default account again.
    await s.sendMessage({ botId: "chief", text: "Again" });
    await waitFor(() => completed(events).includes("completed"));
    expect(clis.get(SYSTEM)?.calls("turn/start")).toHaveLength(1);
    expect(await answers(s)).toEqual(["ANSWER_FROM_system-codex"]);
  });

  it("keeps two agents on their own accounts, and one agent's limit does not move the other", async () => {
    const { service: s, pool, store, clis, events } = await fixture({ [WORK]: [{ limit: true }] });
    await store.getOrCreate("scout");
    pool.assign("chief", WORK);
    pool.assign("scout", HOME);
    await Promise.all([
      s.sendMessage({ botId: "chief", text: "Chief asks" }),
      s.sendMessage({ botId: "scout", text: "Scout asks" }),
    ]);
    await waitFor(() => completed(events).filter((status) => status === "completed").length === 2);
    // Chief's first account is at its limit: the pool moves it on, in pool order (this computer first).
    expect(clis.get(WORK)?.calls("turn/start")).toHaveLength(1);
    expect(clis.get(SYSTEM)?.calls("turn/start")).toHaveLength(1);
    expect(pool.active.get("chief")).toBe(SYSTEM);
    // Scout never left its account, and heard nothing about the other agent's limit.
    expect(clis.get(HOME)?.calls("turn/start")).toHaveLength(1);
    expect(pool.active.get("scout")).toBe(HOME);
    expect(switchEvents(events).map((event) => event.botId)).toEqual(["chief"]);
    expect(limitEvents(events).map((event) => event.botId)).toEqual(["chief"]);
    expect(pool.limitCalls.map((call) => call.id)).toEqual([WORK]);
  });
});

describe.sequential("a confirm card without an agent (CLI download consent)", () => {
  it("lands in the conversation the window opened last, not in the first agent of the list", async () => {
    const { service: s, store } = await fixture();
    await store.getOrCreate("chief");
    await store.getOrCreate("scout");
    const names = s.listBots().map((bot) => bot.id);
    const first = names[0] ?? "";
    const other = names.find((id) => id !== first) ?? "";
    expect(other).not.toBe("");
    // Nothing opened yet: the first agent, as before.
    void s.confirmForPerson(null, { title: "Download the Codex CLI?", preview: "From the official source." });
    expect(pendingCards(s).map((card) => card.botId)).toEqual([first]);
    await s.readConversationFor(other, "local-owner");
    void s.confirmForPerson(null, { title: "Download the Claude CLI?", preview: "From the official source." });
    expect(pendingCards(s).find((card) => card.title === "Download the Claude CLI?")?.botId).toBe(other);
    // An agent named by the caller still wins.
    void s.confirmForPerson(first, { title: "Named agent", preview: "x" });
    expect(pendingCards(s).find((card) => card.title === "Named agent")?.botId).toBe(first);
  });
});

function completed(events: AgentEvent[]): string[] {
  return events.flatMap((event) => (event.type === "turn-completed" ? [event.status] : []));
}

function limitEvents(events: AgentEvent[]) {
  return events.flatMap((event) => (event.type === "account-limit-reached" ? [event] : []));
}

function switchEvents(events: AgentEvent[]) {
  return events.flatMap((event) => (event.type === "account-switched" ? [event] : []));
}

function pendingCards(target: AgentService) {
  return target.listPendingRequests().flatMap((request) => (request.kind === "draft-preview" ? [request.card] : []));
}

async function answers(target: AgentService): Promise<string[]> {
  const conversation = await target.readConversation("chief");
  return conversation.messages
    .filter((message) => message.author === "assistant" && message.text.startsWith("ANSWER_FROM_"))
    .map((message) => message.text);
}

async function lastAnswer(target: AgentService): Promise<string> {
  const conversation = await target.readConversation("chief");
  return [...conversation.messages].reverse().find((message) => message.author === "assistant")?.text ?? "";
}

function firstInputText(params: unknown): string | null {
  if (!isDynamicRecord(params) || !Array.isArray(params.input)) return null;
  const first = params.input[0];
  return isDynamicRecord(first) && isString(first.text) ? first.text : null;
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

async function waitFor(check: () => boolean | undefined | Promise<boolean | undefined>): Promise<void> {
  const deadline = Date.now() + (process.platform === "win32" ? 10_000 : 4_000);
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the fake CLI.");
}
