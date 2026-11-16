// @vitest-environment node
// COSGRAL W5-BE5: the account pool (W5-K1), the fallback lists (W5-BE4) and own model endpoints (W5-K2) together, on the
// real AgentService, ProviderRegistry, EndpointStore and EndpointAgentClient. The Codex CLI of every account is an
// in-process fake; the endpoint is a loopback HTTP server. Order wanted: other accounts first, then the fallback model.

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AccountsSnapshot,
  AgentEvent,
  AgentModelId,
  BrowserControlState,
  BrowserTab,
  ProviderAccount,
} from "@openbot/contracts/ipc";
import { GENERAL_FALLBACK_SCOPE } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AccountPoolPort } from "./account-router";
import type { AgentClient, AgentProvider } from "./agent-client";
import { AgentService } from "./agent-service";
import { setApiKeySource } from "./api-key-env";
import { ApiKeyStore } from "./api-key-store";
import { BotStore } from "./bot-store";
import { EndpointAgentClient } from "./endpoint-client";
import { EndpointStore } from "./endpoint-store";
import { MailboxStore } from "./mailbox-store";
import type { AppServerNotification, RequestId, ResponseDecoder, RpcError } from "./protocol";
import { ProviderRegistry } from "./provider-registry";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";
import type { SecretBox } from "./vault-store";

const SYSTEM = "system-codex";
const WORK = "acc-aaaaaaaa";
const HOME = "acc-bbbbbbbb";
const OWN_MODEL = "gpt-5.6-luna";
const OTHER_CODEX_MODEL = "gpt-5.6-terra";

const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4), "base64").toString("utf8"),
};

let root: string;
let service: AgentService | null = null;
let server: Server | null = null;
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-fallback-accounts-"));
  process.env.OPENBOT_CODEX_PATH = await writeFakeCli(
    join(root, "Codex CLI"),
    "codex",
    `if (process.argv.includes("--version")) process.stdout.write("codex-cli 0.144.1\\n");`,
  );
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude");
});

afterEach(async () => {
  setApiKeySource(null);
  await service?.stop();
  service = null;
  if (server) {
    const closing = server;
    server = null;
    closing.closeAllConnections();
    await new Promise<void>((resolve) => closing.close(() => resolve()));
  }
  if (originalCodexPath === undefined) delete process.env.OPENBOT_CODEX_PATH;
  else process.env.OPENBOT_CODEX_PATH = originalCodexPath;
  if (originalClaudePath === undefined) delete process.env.OPENBOT_CLAUDE_PATH;
  else process.env.OPENBOT_CLAUDE_PATH = originalClaudePath;
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

/** What a fake CLI does with its next turn: answer, or fail on a usage limit that ends in `resetsInSeconds`. */
type Step = "answer" | { limit: true; resetsInSeconds?: number };

class AccountCli extends EventEmitter implements AgentClient {
  readonly requests: Array<{ method: string; params: unknown }> = [];
  running = false;
  #threads = 0;

  constructor(
    readonly provider: AgentProvider,
    readonly name: string,
    readonly script: Step[],
    readonly usedPercent: number,
  ) {
    super();
  }

  start(): void {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  /** The model of every turn this account's CLI was asked to run. */
  turnModels(): string[] {
    return this.requests
      .filter((request) => request.method === "turn/start")
      .map((request) =>
        isDynamicRecord(request.params) && isString(request.params.model) ? request.params.model : "",
      );
  }

  async request<T>(method: string, params: unknown, decoder: ResponseDecoder<T>): Promise<T> {
    this.requests.push({ method, params: structuredClone(params) });
    let result: unknown;
    if (method === "initialize") result = {};
    if (method === "account/read")
      result = { account: { type: "chatgpt", email: `${this.name}@example.com` }, requiresOpenaiAuth: false };
    if (method === "account/rateLimits/read") {
      result = {
        rateLimits: {
          limitId: "codex",
          primary: { usedPercent: this.usedPercent, windowDurationMins: 300, resetsAt: nowSeconds() + 3600 },
          secondary: null,
        },
        rateLimitsByLimitId: null,
      };
    }
    if (method === "model/list")
      result = { data: [OWN_MODEL, OTHER_CODEX_MODEL, "gpt-5.6-sol"].map((model) => ({ model })) };
    if (method === "plugin/list") result = { marketplaces: [] };
    if (method === "thread/start") {
      this.#threads += 1;
      result = { thread: { id: `${this.name}-thread-${this.#threads}` } };
    }
    if (method === "thread/resume" || method === "thread/read")
      result = { thread: { id: stringParam(params, "threadId"), turns: [] } };
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
    send("error", {
      threadId,
      turnId,
      message: "You have reached your usage limit.",
      errorKind: "usage-limit",
      resetsAt: nowSeconds() + (step.resetsInSeconds ?? 3600),
    });
    send("turn/completed", { threadId, turn: { id: turnId, status: "failed" } });
  }

  notify(): void {}
  respond(_id: RequestId, _result: unknown): void {}
  respondError(_id: RequestId, _error: RpcError): void {}
}

/** The owner's accounts: this computer's own, then Work and Home, all in the pool. */
class FakePool implements AccountPoolPort {
  accounts: ProviderAccount[] = [
    account(SYSTEM, { label: "This computer", poolOrder: 1, isDefault: true, system: true }),
    account(WORK, { label: "Work", poolOrder: 2 }),
    account(HOME, { label: "Home", poolOrder: 3 }),
  ];
  active = new Map<string, string>();

  snapshot(): AccountsSnapshot {
    return structuredClone({
      accounts: this.accounts,
      pool: { maxAccountsPerProvider: 3, switchBeforeFirstAction: true },
      assignments: [],
    });
  }

  environment(id: string): NodeJS.ProcessEnv {
    return { CODEX_HOME: `state/${id}` };
  }

  async limitUntil(id: string, until: Date | null): Promise<ProviderAccount> {
    const found = this.accounts.find((item) => item.id === id);
    if (!found) throw new Error("Unknown account.");
    found.limitedUntil = until ? until.toISOString() : null;
    return found;
  }

  setActive(botId: string, accountId: string | null): void {
    if (accountId) this.active.set(botId, accountId);
    else this.active.delete(botId);
  }

  /** The limit of these accounts has passed (the router clears the mark on its timer; here the test says it). */
  free(...ids: string[]): void {
    for (const id of ids) {
      const found = this.accounts.find((item) => item.id === id);
      if (found) found.limitedUntil = null;
    }
  }
}

function account(id: string, fields: Partial<ProviderAccount>): ProviderAccount {
  return {
    id,
    provider: "codex",
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

/** The test clock of the provider registry (the router reads the pool's marks, which the test clears itself). */
let clockMs = Date.now();
function nowSeconds(): number {
  return Math.floor(clockMs / 1000);
}

/** A loopback model server with two models; it answers with the model's name so the test sees who answered. */
async function startModelServer(): Promise<{ base: string; models: string[] }> {
  const models: string[] = [];
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      if (request.url === "/v1/models") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: [{ id: "llama3:8b" }, { id: "qwen2:7b" }] }));
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      models.push(body.model);
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `ENDPOINT_${body.model}` } }] })}\n\n`);
      response.write("data: [DONE]\n\n");
      response.end();
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server?.address();
  if (!isDynamicRecord(address) || !isNumber(address.port)) throw new Error("not listening");
  return { base: `http://127.0.0.1:${address.port}/v1`, models };
}

interface Options {
  scripts?: Record<string, Step[]>;
  /** The Codex usage window of this computer's account (the provider's normal client). */
  systemUsedPercent?: number;
}

async function fixture(options: Options = {}) {
  clockMs = Date.now();
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const pool = new FakePool();
  const clis = new Map<string, AccountCli>();
  let endpoints: EndpointStore | null = null;
  const s = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", (provider, _cli, env) => {
    if (provider === "endpoint")
      return new EndpointAgentClient({
        resolve: (id) => endpoints?.resolve(id) ?? null,
        models: () => endpoints?.modelOptions() ?? [],
      });
    if (provider !== "codex") throw new Error("Only Codex and endpoints in this test.");
    const accountId = env?.CODEX_HOME?.replace("state/", "") ?? SYSTEM;
    const used = accountId === SYSTEM ? (options.systemUsedPercent ?? 10) : 10;
    const client = new AccountCli(provider, accountId, options.scripts?.[accountId] ?? [], used);
    clis.set(accountId, client);
    return client;
  });
  service = s;
  s.useAccounts(pool);
  const registry = new ProviderRegistry({
    database: store.database,
    emit: (event) => s.relay(event),
    timers: false,
    now: () => clockMs,
  });
  s.useProviders(registry);
  const events: AgentEvent[] = [];
  s.on("event", (event) => events.push(event));
  await s.initialize();
  const keys = new ApiKeyStore(store.database, fakeBox);
  setApiKeySource(keys);
  endpoints = new EndpointStore(store.database, keys, { timeoutMs: 2_000 });
  s.useEndpoints(endpoints);
  const { base, models: served } = await startModelServer();
  const local = endpoints.save({ label: "Local LLM", kind: "openai-compatible", baseUrl: base });
  await endpoints.check(local.id);
  await store.getOrCreate("chief");
  await s.updateBot({ botId: "chief", model: OWN_MODEL });
  const endpointModel = (model: string): AgentModelId => `endpoint:${local.id}/${model}`;
  return { s, store, pool, clis, events, registry, endpoints, served, endpointModel };
}

describe.sequential("accounts first, then the fallback models (K1 + BE4 + K2)", {
  timeout: process.platform === "win32" ? 30_000 : 10_000,
}, () => {
  it("(a) a limit before any action moves the turn to the next account, not to another model", async () => {
    const f = await fixture({ scripts: { [SYSTEM]: [{ limit: true }] } });
    f.registry.setFallbackModels({ botId: "chief", fallbackModels: [f.endpointModel("llama3:8b")] });
    await f.s.sendMessage({ botId: "chief", text: "Please help" });
    await waitFor(() => completed(f.events).includes("completed"));
    expect(f.clis.get(WORK)?.turnModels()).toEqual([OWN_MODEL]);
    expect(f.events.some((event) => event.type === "model-fallback")).toBe(false);
    expect(f.served).toEqual([]);
    expect(bot(f.s).activeModel ?? bot(f.s).model).toBe(OWN_MODEL);
    // One account's limit is not a provider limit: the own model stays usable.
    expect(f.registry.isUsable(OWN_MODEL)).toBe(true);
    expect(await answers(f.s)).toEqual(["ANSWER_FROM_acc-aaaaaaaa"]);
  });

  it("(b) only when every account is at its limit, the agent's own fallback list is used", async () => {
    const f = await fixture({
      scripts: { [SYSTEM]: [{ limit: true }], [WORK]: [{ limit: true }], [HOME]: [{ limit: true }] },
    });
    f.registry.setFallbackModels({ botId: GENERAL_FALLBACK_SCOPE, fallbackModels: [f.endpointModel("qwen2:7b")] });
    f.registry.setFallbackModels({ botId: "chief", fallbackModels: [f.endpointModel("llama3:8b")] });
    await f.s.sendMessage({ botId: "chief", text: "Anything" });
    await waitFor(() => completed(f.events).includes("completed"));
    expect(order(f.events)).toEqual(["limit:switched", "limit:switched", "limit:exhausted", "model"]);
    expect(f.served).toEqual(["llama3:8b"]);
    expect(await lastAnswer(f.s)).toBe("ENDPOINT_llama3:8b");
  });

  it("(b) an agent without its own list follows the general list; an empty own list adds nothing (W5-BE7)", async () => {
    const f = await fixture({
      scripts: {
        [SYSTEM]: [{ limit: true }, { limit: true }],
        [WORK]: [{ limit: true }, { limit: true }],
        [HOME]: [{ limit: true }, { limit: true }],
      },
    });
    f.registry.setFallbackModels({ botId: GENERAL_FALLBACK_SCOPE, fallbackModels: [f.endpointModel("qwen2:7b")] });
    expect(f.registry.getFallbackInfo("chief").own).toBeNull();
    await f.s.sendMessage({ botId: "chief", text: "General list" });
    await waitFor(() => completed(f.events).includes("completed"));
    expect(f.served).toEqual(["qwen2:7b"]);

    // W5-BE7: the layers add up, so an own empty list no longer stops the general list after the accounts.
    f.registry.setFallbackModels({ botId: "chief", fallbackModels: [] });
    clockMs += 3 * 3600 * 1000;
    f.registry.tick();
    f.pool.free(SYSTEM, WORK, HOME);
    await f.s.sendMessage({ botId: "chief", text: "Own empty list" });
    await waitFor(() => completed(f.events).filter((status) => status === "completed").length === 2);
    expect(f.served).toEqual(["qwen2:7b", "qwen2:7b"]);
  });

  it("W5-BE7: after the accounts, the agent's own list comes before its provider's list", async () => {
    const f = await fixture({
      scripts: { [SYSTEM]: [{ limit: true }], [WORK]: [{ limit: true }], [HOME]: [{ limit: true }] },
    });
    f.registry.setFallbackModels({ botId: GENERAL_FALLBACK_SCOPE, fallbackModels: [f.endpointModel("llama3:8b")] });
    f.registry.setFallbackModels({ botId: "provider:codex", fallbackModels: [f.endpointModel("llama3:8b")] });
    // Another Codex model first: the Codex limit blocks it, so the next model of the own list answers.
    f.registry.setFallbackModels({ botId: "chief", fallbackModels: [OTHER_CODEX_MODEL, f.endpointModel("qwen2:7b")] });
    await f.s.sendMessage({ botId: "chief", text: "Anything" });
    await waitFor(() => completed(f.events).includes("completed"));
    expect(order(f.events)).toEqual(["limit:switched", "limit:switched", "limit:exhausted", "model"]);
    expect(f.served).toEqual(["qwen2:7b"]);
    expect(f.registry.getFallbackInfo("chief").chain.map((entry) => entry.source)).toEqual(["own", "own", "provider"]);
  });

  it("W5-BE7: without an own list the provider list comes before the general list", async () => {
    const f = await fixture({
      scripts: { [SYSTEM]: [{ limit: true }], [WORK]: [{ limit: true }], [HOME]: [{ limit: true }] },
    });
    f.registry.setFallbackModels({ botId: GENERAL_FALLBACK_SCOPE, fallbackModels: [f.endpointModel("qwen2:7b")] });
    f.registry.setFallbackModels({ botId: "provider:codex", fallbackModels: [f.endpointModel("llama3:8b")] });
    // A Claude list is not for this Codex agent.
    f.registry.setFallbackModels({ botId: "provider:claude", fallbackModels: [f.endpointModel("qwen2:7b")] });
    await f.s.sendMessage({ botId: "chief", text: "Anything" });
    await waitFor(() => completed(f.events).includes("completed"));
    expect(f.served).toEqual(["llama3:8b"]);
    expect(fallbacks(f.events)).toEqual([{ from: OWN_MODEL, to: f.endpointModel("llama3:8b") }]);
    expect(f.registry.getFallbackInfo("chief")).toMatchObject({
      providerScope: "provider:codex",
      chain: [
        { model: f.endpointModel("llama3:8b"), source: "provider", available: true },
        { model: f.endpointModel("qwen2:7b"), source: "general", available: true },
      ],
    });
  });

  it("(c) a provider limit blocks all its models: another Codex model is no way around it", async () => {
    const f = await fixture({
      scripts: { [SYSTEM]: [{ limit: true }], [WORK]: [{ limit: true }], [HOME]: [{ limit: true }] },
    });
    f.registry.setFallbackModels({
      botId: "chief",
      fallbackModels: [OTHER_CODEX_MODEL, f.endpointModel("llama3:8b")],
    });
    await f.s.sendMessage({ botId: "chief", text: "Anything" });
    await waitFor(() => completed(f.events).includes("completed"));
    const codexTurns = [SYSTEM, WORK, HOME].flatMap((id) => f.clis.get(id)?.turnModels() ?? []);
    expect(codexTurns).toEqual([OWN_MODEL, OWN_MODEL, OWN_MODEL]);
    expect(f.registry.isUsable(OTHER_CODEX_MODEL)).toBe(false);
    expect(fallbacks(f.events)).toEqual([{ from: OWN_MODEL, to: f.endpointModel("llama3:8b") }]);
    expect(f.served).toEqual(["llama3:8b"]);
  });

  it("(d) an endpoint model as fallback: a removed endpoint is skipped, the next model answers", async () => {
    const f = await fixture({
      scripts: { [SYSTEM]: [{ limit: true }], [WORK]: [{ limit: true }], [HOME]: [{ limit: true }] },
    });
    const gone = f.endpoints.save({ label: "Old box", kind: "openai-compatible", baseUrl: "http://127.0.0.1:9/v1" });
    const goneModel: AgentModelId = `endpoint:${gone.id}/llama3:8b`;
    f.registry.setFallbackModels({ botId: "chief", fallbackModels: [goneModel, f.endpointModel("qwen2:7b")] });
    f.endpoints.remove(gone.id);
    expect(f.registry.getFallbackInfo("chief")).toMatchObject({
      effective: [f.endpointModel("qwen2:7b")],
      unavailable: [goneModel],
    });
    await f.s.sendMessage({ botId: "chief", text: "Anything" });
    await waitFor(() => completed(f.events).includes("completed"));
    expect(fallbacks(f.events)).toEqual([{ from: OWN_MODEL, to: f.endpointModel("qwen2:7b") }]);
    expect(await lastAnswer(f.s)).toBe("ENDPOINT_qwen2:7b");
  });

  it("(e) after the limits reset, the agent is back on its first account and its own model", async () => {
    const f = await fixture({
      scripts: { [SYSTEM]: [{ limit: true }], [WORK]: [{ limit: true }], [HOME]: [{ limit: true }] },
    });
    f.registry.setFallbackModels({ botId: "chief", fallbackModels: [f.endpointModel("llama3:8b")] });
    await f.s.sendMessage({ botId: "chief", text: "First" });
    await waitFor(() => completed(f.events).includes("completed"));
    expect(bot(f.s).activeModel).toBe(f.endpointModel("llama3:8b"));

    clockMs += 2 * 3600 * 1000;
    f.registry.tick();
    f.pool.free(SYSTEM, WORK, HOME);
    await f.s.sendMessage({ botId: "chief", text: "Second" });
    await waitFor(() => completed(f.events).filter((status) => status === "completed").length === 2);
    expect(f.clis.get(SYSTEM)?.turnModels()).toEqual([OWN_MODEL, OWN_MODEL]);
    expect(bot(f.s).activeModel ?? bot(f.s).model).toBe(OWN_MODEL);
    expect(fallbacks(f.events).at(-1)).toEqual({ from: f.endpointModel("llama3:8b"), to: OWN_MODEL });
    expect(f.pool.active.get("chief")).toBe(SYSTEM);
    expect(await lastAnswer(f.s)).toBe("ANSWER_FROM_system-codex");
  });

  it("(e) goes back as soon as the first account is free, even when another account's limit lasts longer", async () => {
    const f = await fixture({
      scripts: {
        [SYSTEM]: [{ limit: true, resetsInSeconds: 600 }],
        [WORK]: [{ limit: true, resetsInSeconds: 3600 }],
        [HOME]: [{ limit: true, resetsInSeconds: 7200 }],
      },
    });
    f.registry.setFallbackModels({ botId: "chief", fallbackModels: [f.endpointModel("llama3:8b")] });
    await f.s.sendMessage({ botId: "chief", text: "First" });
    await waitFor(() => completed(f.events).includes("completed"));
    expect(bot(f.s).activeModel).toBe(f.endpointModel("llama3:8b"));

    // Ten minutes later only this computer's account is free again.
    clockMs += 601 * 1000;
    f.registry.tick();
    f.pool.free(SYSTEM);
    await f.s.sendMessage({ botId: "chief", text: "Second" });
    await waitFor(() => completed(f.events).filter((status) => status === "completed").length === 2);
    expect(f.clis.get(SYSTEM)?.turnModels()).toEqual([OWN_MODEL, OWN_MODEL]);
    expect(bot(f.s).activeModel ?? bot(f.s).model).toBe(OWN_MODEL);
    expect(f.served).toEqual(["llama3:8b"]);
  });

  it("the usage window of this computer's account alone does not skip the pool for a fallback model", async () => {
    const f = await fixture({ systemUsedPercent: 100, scripts: { [SYSTEM]: [{ limit: true }] } });
    f.registry.setFallbackModels({ botId: "chief", fallbackModels: [f.endpointModel("llama3:8b")] });
    await waitFor(() => !f.registry.isUsable(OWN_MODEL));
    await f.s.sendMessage({ botId: "chief", text: "Please help" });
    await waitFor(() => completed(f.events).includes("completed"));
    expect(f.events.some((event) => event.type === "model-fallback")).toBe(false);
    expect(f.served).toEqual([]);
    expect(f.clis.get(WORK)?.turnModels()).toEqual([OWN_MODEL]);
  });
});

function bot(target: AgentService) {
  const found = target.listBots().find((item) => item.id === "chief");
  if (!found) throw new Error("No chief.");
  return found;
}

function completed(events: AgentEvent[]): string[] {
  return events.flatMap((event) => (event.type === "turn-completed" ? [event.status] : []));
}

function order(events: AgentEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === "account-limit-reached"
      ? [`limit:${event.outcome}`]
      : event.type === "model-fallback"
        ? ["model"]
        : [],
  );
}

function fallbacks(events: AgentEvent[]) {
  return events.flatMap((event) =>
    event.type === "model-fallback" ? [{ from: event.fromModel, to: event.toModel }] : [],
  );
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
