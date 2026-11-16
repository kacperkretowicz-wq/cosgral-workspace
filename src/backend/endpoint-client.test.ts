// @vitest-environment node
// COSGRAL W5-K2: the chat client of an own model endpoint, tested against a real HTTP server on 127.0.0.1.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type DynamicRecord, isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { setApiKeySource } from "./api-key-env";
import { EndpointAgentClient } from "./endpoint-client";
import type { ResolvedEndpoint } from "./endpoint-store";
import type { AppServerNotification } from "./protocol";

// Test data only: no real key.
const KEY = "test-key-chat-9999abcd";

interface ChatRequest {
  url: string;
  authorization: string | undefined;
  body: { model: string; stream: boolean; messages: Array<{ role: string; content: string }> };
}

type Handler = (request: ChatRequest, response: ServerResponse, count: number) => void;

const servers: Server[] = [];
afterEach(async () => {
  setApiKeySource(null);
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function chatServer(handler: Handler): Promise<{ base: string; requests: ChatRequest[] }> {
  const requests: ChatRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? JSON.parse(raw) : {};
      const seen: ChatRequest = { url: request.url ?? "", authorization: request.headers.authorization, body };
      requests.push(seen);
      handler(seen, response, requests.length);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!isDynamicRecord(address) || !isNumber(address.port)) throw new Error("not listening");
  return { base: `http://127.0.0.1:${address.port}/v1`, requests };
}

function sse(response: ServerResponse, pieces: string[], done = true): void {
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const piece of pieces)
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
  if (done) response.write("data: [DONE]\n\n");
  response.end();
}

function endpoint(base: string, key: string | null = null): ResolvedEndpoint {
  return { id: "local", label: "Local LLM", baseUrl: base, key };
}

interface Run {
  client: EndpointAgentClient;
  events: AppServerNotification[];
  threadId: string;
  turn: (text: string) => Promise<{ turnId: string; status: string }>;
}

async function start(resolve: () => ResolvedEndpoint | null, options: { idleMs?: number } = {}): Promise<Run> {
  const client = new EndpointAgentClient({ resolve, models: () => [], idleMs: options.idleMs });
  const events: AppServerNotification[] = [];
  client.on("notification", (notification) => events.push(notification));
  client.start();
  const started = await client.request(
    "thread/start",
    { model: "endpoint:local/llama3:8b", developerInstructions: "Be brief." },
    (value) => value,
  );
  const thread = isDynamicRecord(started) && isDynamicRecord(started.thread) ? started.thread : null;
  const threadId = thread && isString(thread.id) ? thread.id : "";
  async function turn(text: string) {
    const response = await client.request(
      "turn/start",
      { threadId, model: "endpoint:local/llama3:8b", input: [{ type: "text", text }] },
      (value) => value,
    );
    const info = isDynamicRecord(response) && isDynamicRecord(response.turn) ? response.turn : null;
    const turnId = info && isString(info.id) ? info.id : "";
    await until(() => events.some((event) => event.method === "turn/completed" && completedTurn(event) === turnId));
    const done = events.find((event) => event.method === "turn/completed" && completedTurn(event) === turnId);
    const status =
      isDynamicRecord(done?.params) && isDynamicRecord(done.params.turn) && isString(done.params.turn.status)
        ? done.params.turn.status
        : "";
    return { turnId, status };
  }
  return { client, events, threadId, turn };
}

function completedTurn(event: AppServerNotification): string {
  return isDynamicRecord(event.params) && isDynamicRecord(event.params.turn) && isString(event.params.turn.id)
    ? event.params.turn.id
    : "";
}

function errorOf(events: AppServerNotification[]): DynamicRecord | null {
  const found = events.find((event) => event.method === "error");
  return isDynamicRecord(found?.params) ? found.params : null;
}

async function until(check: () => boolean, ms = 4_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out.");
}

describe("EndpointAgentClient", () => {
  it("streams an answer, sends the instructions and a chat-only note, and sends the key only when there is one", async () => {
    const { base, requests } = await chatServer((_request, response) => sse(response, ["Hel", "lo ", "there"]));
    const withKey = await start(() => endpoint(base, KEY));
    const result = await withKey.turn("Hi");
    expect(result.status).toBe("completed");
    const deltas = withKey.events.flatMap((event) =>
      event.method === "item/agentMessage/delta" && isDynamicRecord(event.params) ? [event.params.delta] : [],
    );
    expect(deltas).toEqual(["Hel", "lo ", "there"]);
    const completed = withKey.events.find((event) => event.method === "item/completed");
    expect(
      isDynamicRecord(completed?.params) && isDynamicRecord(completed.params.item) && completed.params.item.text,
    ).toBe("Hello there");
    expect(requests[0]?.url).toBe("/v1/chat/completions");
    expect(requests[0]?.authorization).toBe(`Bearer ${KEY}`);
    expect(requests[0]?.body).toMatchObject({ model: "llama3:8b", stream: true });
    const system = requests[0]?.body.messages[0];
    expect(system?.role).toBe("system");
    expect(system?.content).toContain("Be brief.");
    expect(system?.content).toMatch(/cannot use tools/);
    expect(requests[0]?.body.messages.at(-1)).toEqual({ role: "user", content: "Hi" });

    const withoutKey = await start(() => endpoint(base));
    await withoutKey.turn("Hi");
    expect(requests[1]?.authorization).toBeUndefined();
  });

  it("keeps the conversation between turns, and a failed turn leaves no trace in it", async () => {
    const { base, requests } = await chatServer((_request, response, count) => {
      if (count === 2) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "model crashed" } }));
        return;
      }
      sse(response, [`answer ${count}`]);
    });
    const run = await start(() => endpoint(base));
    await run.turn("first");
    expect((await run.turn("second")).status).toBe("failed");
    await run.turn("third");
    const last = requests[2]?.body.messages.map((message) => `${message.role}:${message.content}`);
    expect(last?.slice(1)).toEqual(["user:first", "assistant:answer 1", "user:third"]);
  });

  it("accepts a server that ignores streaming and answers with one document", async () => {
    const { base } = await chatServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "whole answer" } }] }));
    });
    const run = await start(() => endpoint(base));
    expect((await run.turn("Hi")).status).toBe("completed");
    expect(run.events.some((event) => event.method === "item/agentMessage/delta")).toBe(true);
    expect(errorOf(run.events)).toBeNull();
  });

  it("classifies errors: a refused key and a wrong model never move the turn to another model, a limit and an outage may", async () => {
    setApiKeySource({ env: () => ({}), values: () => [KEY] });
    const cases: Array<[number, Record<string, string>, unknown, string | null, RegExp]> = [
      [401, {}, { error: { message: `bad key ${KEY}` } }, null, /did not accept the key/],
      [404, {}, { error: { message: "model not found" } }, null, /does not know this model/],
      [429, { "retry-after": "120" }, { error: { message: "slow down" } }, "usage-limit", /usage limit/],
      [503, {}, { error: { message: "loading" } }, "unavailable", /not available \(503\)/],
      [400, {}, { error: { message: "context too long" } }, null, /refused the request \(400\)/],
    ];
    for (const [status, headers, body, kind, message] of cases) {
      const { base } = await chatServer((_request, response) => {
        response.writeHead(status, { "content-type": "application/json", ...headers });
        response.end(JSON.stringify(body));
      });
      const run = await start(() => endpoint(base, KEY));
      expect((await run.turn("Hi")).status, String(status)).toBe("failed");
      const error = errorOf(run.events);
      expect(error?.errorKind, String(status)).toBe(kind);
      expect(String(error?.message), String(status)).toMatch(message);
      // The server echoed the key in its error: it is cleaned before it reaches the window.
      expect(JSON.stringify(run.events)).not.toContain(KEY);
      expect(run.events.some((event) => event.method === "item/completed")).toBe(false);
      if (status === 429) {
        const reset = isNumber(error?.resetsAt) ? error.resetsAt : 0;
        expect(reset).toBeGreaterThan(Date.now() / 1000 + 100);
      }
    }
  });

  it("calls a server that is down 'unavailable' and does not reveal the address", async () => {
    const { base } = await chatServer(() => undefined);
    const dead = base.replace(/:\d+\//, ":9/");
    const run = await start(() => endpoint(dead));
    expect((await run.turn("Hi")).status).toBe("failed");
    expect(errorOf(run.events)).toMatchObject({ errorKind: "unavailable" });
    expect(String(errorOf(run.events)?.message)).not.toContain("127.0.0.1");
  });

  it("fails a turn when the server goes silent for too long ('unavailable')", async () => {
    const { base } = await chatServer(() => undefined); // never answers
    const run = await start(() => endpoint(base), { idleMs: 200 });
    expect((await run.turn("Hi")).status).toBe("failed");
    expect(errorOf(run.events)).toMatchObject({ errorKind: "unavailable" });
    expect(String(errorOf(run.events)?.message)).toMatch(/stopped answering/);
  });

  it("interrupts a turn that is streaming without calling it an error", async () => {
    const { base } = await chatServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`);
    });
    const run = await start(() => endpoint(base));
    const response = await run.client.request(
      "turn/start",
      { threadId: run.threadId, model: "endpoint:local/llama3:8b", input: [{ type: "text", text: "Go" }] },
      (value) => value,
    );
    await until(() => run.events.some((event) => event.method === "item/agentMessage/delta"));
    await run.client.request("turn/interrupt", { threadId: run.threadId }, (value) => value);
    await until(() => run.events.some((event) => event.method === "turn/completed"));
    expect(run.events.find((event) => event.method === "turn/completed")?.params).toMatchObject({
      turn: { status: "interrupted" },
    });
    expect(errorOf(run.events)).toBeNull();
    expect(response).toBeDefined();
  });

  it("does not follow a redirect (the conversation and the key must not go to another host)", async () => {
    const target = await chatServer((_request, response) => sse(response, ["leaked"]));
    const { base } = await chatServer((_request, response) => {
      response.writeHead(307, { location: `${target.base}/chat/completions` });
      response.end();
    });
    const run = await start(() => endpoint(base, KEY));
    expect((await run.turn("secret question")).status).toBe("failed");
    expect(target.requests).toEqual([]);
  });

  it("refuses a turn with a clear message when the endpoint was removed or the model is not an endpoint model", async () => {
    const { base } = await chatServer((_request, response) => sse(response, ["x"]));
    let present = true;
    const run = await start(() => (present ? endpoint(base) : null));
    await run.turn("works");
    present = false;
    await expect(
      run.client.request(
        "turn/start",
        { threadId: run.threadId, model: "endpoint:local/llama3:8b", input: [{ type: "text", text: "again" }] },
        (value) => value,
      ),
    ).rejects.toThrow(/endpoint of this model was removed/);
    await expect(
      run.client.request("turn/start", { threadId: run.threadId, model: "gpt-5.6-luna", input: [] }, (value) => value),
    ).rejects.toThrow(/not an endpoint model/);
  });

  it("lists the models it was given and has no steering or tools", async () => {
    const client = new EndpointAgentClient({
      resolve: () => null,
      models: () => [{ id: "endpoint:local/a", name: "a (Local LLM, chat only)" }],
    });
    client.start();
    const listed = await client.request("model/list", {}, (value) => value);
    expect(isDynamicRecord(listed) && Array.isArray(listed.data) && listed.data).toMatchObject([
      { model: "endpoint:local/a", displayName: "a (Local LLM, chat only)" },
    ]);
    await expect(client.request("turn/steer", {}, (value) => value)).rejects.toThrow(/does not implement/);
    await client.stop();
    await expect(client.request("initialize", {}, (value) => value)).rejects.toThrow(/not running/);
  });
});
