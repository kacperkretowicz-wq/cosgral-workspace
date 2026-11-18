// @vitest-environment node
// COSGRAL W5-K2: an agent whose model is "endpoint:<id>/<model>" talks through the person's own endpoint (a loopback
// server here), tested with the real AgentService, EndpointStore, EndpointAgentClient and ApiKeyStore.

import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BrowserControlState, BrowserTab } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentClient, AgentProvider } from "./agent-client";
import { AgentService } from "./agent-service";
import { setApiKeySource } from "./api-key-env";
import { ApiKeyStore } from "./api-key-store";
import { BotStore } from "./bot-store";
import { EndpointAgentClient } from "./endpoint-client";
import { EndpointStore } from "./endpoint-store";
import { MailboxStore } from "./mailbox-store";
import type { RequestId, ResponseDecoder, RpcError } from "./protocol";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";
import { suiteTimeout } from "./testing/timeouts";
import type { SecretBox } from "./vault-store";

// Test data only: no real key.
const KEY = "test-key-agent-endpoint-7777";

const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};

let root: string;
let service: AgentService | null = null;
let server: Server | null = null;
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-endpoint-agent-"));
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

/** The provider the agent does not use here: it only has to start. */
class IdleCodex extends EventEmitter implements AgentClient {
  readonly provider: AgentProvider = "codex";
  running = false;
  start(): void {
    this.running = true;
  }
  async stop(): Promise<void> {
    this.running = false;
  }
  async request<T>(method: string, _params: unknown, decoder: ResponseDecoder<T>): Promise<T> {
    if (method === "account/read")
      return decoder({ account: { type: "chatgpt", email: "codex@example.com" }, requiresOpenaiAuth: false });
    if (method === "model/list") return decoder({ data: [] });
    if (method === "plugin/list") return decoder({ marketplaces: [] });
    if (method === "account/rateLimits/read") return decoder({ rateLimits: null, rateLimitsByLimitId: null });
    return decoder({});
  }
  notify(): void {}
  respond(_id: RequestId, _result: unknown): void {}
  respondError(_id: RequestId, _error: RpcError): void {}
}

interface Seen {
  url: string;
  authorization: string | undefined;
  body: { model: string; messages: Array<{ role: string; content: string }> };
}

async function startServer(answer: string): Promise<{ base: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      if (request.url === "/v1/models") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: [{ id: "llama3:8b" }, { id: "qwen2:7b" }] }));
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      seen.push({ url: request.url ?? "", authorization: request.headers.authorization, body: JSON.parse(raw) });
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\n`);
      response.write("data: [DONE]\n\n");
      response.end();
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server?.address();
  if (!isDynamicRecord(address) || !isNumber(address.port)) throw new Error("not listening");
  return { base: `http://127.0.0.1:${address.port}/v1`, seen };
}

async function fixture() {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  let endpoints: EndpointStore | null = null;
  service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", (provider) =>
    provider === "endpoint"
      ? new EndpointAgentClient({
          resolve: (id) => endpoints?.resolve(id) ?? null,
          models: () => endpoints?.modelOptions() ?? [],
        })
      : new IdleCodex(),
  );
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  await service.initialize();
  // The database is open after initialize(), like in the program (the stores are made then).
  const keys = new ApiKeyStore(store.database, fakeBox);
  setApiKeySource(keys);
  endpoints = new EndpointStore(store.database, keys, { timeoutMs: 2_000 });
  service.useEndpoints(endpoints);
  await store.getOrCreate("chief");
  return { service, store, keys, endpoints, events };
}

describe.sequential("an agent on an own model endpoint", {
  timeout: suiteTimeout(20_000, 8_000),
}, () => {
  it("offers the models of an endpoint as agent models once the list was fetched, and not before", async () => {
    const { base } = await startServer("hi");
    const { service: s, endpoints } = await fixture();
    const saved = endpoints.save({ label: "Local LLM", kind: "openai-compatible", baseUrl: base });
    expect(s.listModels().some((model) => model.id.startsWith("endpoint:"))).toBe(false);
    await endpoints.check(saved.id);
    const ids = s.listModels().map((model) => model.id);
    expect(ids).toContain(`endpoint:${saved.id}/llama3:8b`);
    expect(ids).toContain(`endpoint:${saved.id}/qwen2:7b`);
    expect(ids).toContain("gpt-5.6-luna");
    expect(s.listModels().find((model) => model.id === `endpoint:${saved.id}/llama3:8b`)?.name).toMatch(/chat only/);
  });

  it("answers through the endpoint with the key, the instructions and a chat-only note", async () => {
    const { base, seen } = await startServer("ENDPOINT_SAYS_HI");
    const { service: s, endpoints, events } = await fixture();
    const saved = endpoints.save({ label: "Local LLM", kind: "openai-compatible", baseUrl: base, key: KEY });
    await endpoints.check(saved.id);
    await s.updateBot({ botId: "chief", model: `endpoint:${saved.id}/llama3:8b` });
    await s.sendMessage({ botId: "chief", text: "Say hi" });
    await waitFor(() => events.some((event) => event.type === "turn-completed"));
    const completed = events.find((event) => event.type === "turn-completed");
    expect(completed).toMatchObject({ status: "completed" });
    const conversation = await s.readConversation("chief");
    expect(
      conversation.messages.filter((message) => message.author === "assistant").map((message) => message.text),
    ).toEqual(["ENDPOINT_SAYS_HI"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0]?.body.model).toBe("llama3:8b");
    expect(seen[0]?.body.messages[0]?.content).toMatch(/cannot use tools/);
    expect(seen[0]?.body.messages.at(-1)?.content).toContain("Say hi");
    // Nothing the person typed as a key reaches the window.
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it("gives a readable error, and no hanging turn, when the endpoint was removed", async () => {
    const { base, seen } = await startServer("never");
    const { service: s, endpoints, events } = await fixture();
    const saved = endpoints.save({ label: "Local LLM", kind: "openai-compatible", baseUrl: base });
    await endpoints.check(saved.id);
    await s.updateBot({ botId: "chief", model: `endpoint:${saved.id}/llama3:8b` });
    endpoints.remove(saved.id);
    expect(s.listModels().some((model) => model.id.startsWith("endpoint:"))).toBe(false);
    await s.sendMessage({ botId: "chief", text: "Anyone there?" });
    await waitFor(() =>
      events.some((event) => event.type === "error" && /endpoint of this model was removed/.test(event.message)),
    );
    await waitFor(() => s.listQueue("chief").deliveries.every((delivery) => delivery.status !== "starting"));
    expect(seen).toEqual([]);
    expect((await s.readConversation("chief")).activeTurnId).toBeNull();
    expect(events.some((event) => event.type === "turn-started")).toBe(false);
  });

  it("does not move a refused key to another model: the person sees the reason", async () => {
    const { base } = await startServer("x");
    const { service: s, endpoints, events } = await fixture();
    const saved = endpoints.save({ label: "Local LLM", kind: "openai-compatible", baseUrl: base });
    await s.updateBot({ botId: "chief", model: `endpoint:${saved.id}/llama3:8b` });
    // The model server starts refusing: replace the server by one that answers 401.
    await new Promise<void>((resolve) => {
      server?.closeAllConnections();
      server?.close(() => resolve());
    });
    const address = new URL(base);
    server = createServer((_request, response) => {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "invalid api key" } }));
    });
    await new Promise<void>((resolve) => server?.listen(Number(address.port), "127.0.0.1", resolve));
    await s.sendMessage({ botId: "chief", text: "Hello" });
    await waitFor(() => events.some((event) => event.type === "turn-completed"));
    expect(events.find((event) => event.type === "turn-completed")).toMatchObject({ status: "failed" });
    expect(events.some((event) => event.type === "error" && /did not accept the key/.test(event.message))).toBe(true);
    expect(events.some((event) => event.type === "model-fallback")).toBe(false);
  });
});

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
  const deadline = Date.now() + suiteTimeout(10_000, 4_000);
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the endpoint turn.");
}
