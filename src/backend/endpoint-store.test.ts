// @vitest-environment node
// COSGRAL W5-K2: own model endpoints, tested against real HTTP servers on 127.0.0.1 (random ports). No real service.

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelEndpoint } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { redactApiKeys, setApiKeySource } from "./api-key-env";
import { ApiKeyStore } from "./api-key-store";
import { EndpointStore, endpointKeySlot, parseModelList } from "./endpoint-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import type { SecretBox } from "./vault-store";

// Test data only: no real key.
const KEY = "test-key-endpoint-abcd1234";

const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};

interface Seen {
  method: string;
  url: string;
  authorization: string | undefined;
}

type Mode = "ok" | "needs-key" | "slow" | "not-found" | "server-error" | "not-a-list" | "huge" | "redirect" | "empty";

/** A model server on loopback; `mode` is read at each request. */
class FakeServer {
  mode: Mode = "ok";
  redirectTo = "";
  models = ["llama3:8b", "hf.co/org/model:q4", "  spaced  ", "llama3:8b"];
  readonly seen: Seen[] = [];
  readonly #server: Server;
  readonly #sockets = new Set<import("node:net").Socket>();

  private constructor(server: Server) {
    this.#server = server;
    server.on("connection", (socket) => {
      this.#sockets.add(socket);
      socket.on("close", () => this.#sockets.delete(socket));
    });
  }

  static async start(setup: (self: FakeServer) => void = () => undefined): Promise<FakeServer> {
    const holder: { self: FakeServer | null } = { self: null };
    const server = createServer((request, response) => holder.self?.handle(request, response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const self = new FakeServer(server);
    holder.self = self;
    setup(self);
    return self;
  }

  get port(): number {
    const address = this.#server.address();
    if (!isDynamicRecord(address) || !isNumber(address.port)) throw new Error("The server is not listening.");
    return address.port;
  }

  get base(): string {
    return `http://127.0.0.1:${this.port}/v1`;
  }

  async stop(): Promise<void> {
    for (const socket of this.#sockets) socket.destroy();
    await new Promise<void>((resolve) => this.#server.close(() => resolve()));
  }

  handle(request: IncomingMessage, response: ServerResponse): void {
    this.seen.push({
      method: request.method ?? "",
      url: request.url ?? "",
      authorization: request.headers.authorization,
    });
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (this.mode === "slow") return; // never answers
    if (this.mode === "redirect") {
      response.writeHead(302, { location: this.redirectTo });
      response.end();
      return;
    }
    if (this.mode === "not-found") {
      json(404, { error: "no such route" });
      return;
    }
    if (this.mode === "server-error") {
      json(500, { error: "boom" });
      return;
    }
    if (this.mode === "not-a-list") {
      json(200, { hello: "world" });
      return;
    }
    if (this.mode === "huge") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(`{"data":[],"pad":"${"x".repeat(3 * 1024 * 1024)}"}`);
      return;
    }
    if (this.mode === "needs-key" && request.headers.authorization !== `Bearer ${KEY}`) {
      json(401, { error: { message: `bad key ${request.headers.authorization ?? "(none)"}` } });
      return;
    }
    if (request.url !== "/v1/models") {
      json(404, { error: "no such route" });
      return;
    }
    json(200, {
      object: "list",
      data: this.mode === "empty" ? [] : this.models.map((id) => ({ id, object: "model" })),
    });
  }
}

const servers: FakeServer[] = [];
const roots: string[] = [];

afterEach(async () => {
  setApiKeySource(null);
  closeTestDatabases();
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function server(setup?: (self: FakeServer) => void): Promise<FakeServer> {
  const started = await FakeServer.start(setup);
  servers.push(started);
  return started;
}

async function open(options: { timeoutMs?: number; probes?: ConstructorParameters<typeof EndpointStore>[2] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "endpoint-store-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const keys = new ApiKeyStore(database, fakeBox);
  const changes: ModelEndpoint[][] = [];
  const store = new EndpointStore(database, keys, {
    timeoutMs: options.timeoutMs ?? 2_000,
    onChange: (list) => changes.push(list),
    ...options.probes,
  });
  return { dir, database, keys, store, changes };
}

async function everythingOnDisk(dir: string): Promise<string> {
  const folder = join(dir, "data");
  const parts: string[] = [];
  for (const name of await readdir(folder)) {
    if (name.startsWith("openbot.db")) parts.push((await readFile(join(folder, name))).toString("latin1"));
  }
  return parts.join("\n");
}

describe("EndpointStore: the address", () => {
  it("refuses schemes other than http and https, and an address with credentials, a query or a fragment", async () => {
    const { store } = await open();
    for (const baseUrl of [
      "ftp://127.0.0.1/v1",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "ws://127.0.0.1:1234/v1",
      "127.0.0.1:11434/v1",
      "",
      "http://user:secret@127.0.0.1:11434/v1",
      "http://127.0.0.1:11434/v1?x=1",
      "http://127.0.0.1:11434/v1#frag",
    ]) {
      expect(() => store.save({ label: "Bad", kind: "openai-compatible", baseUrl })).toThrow();
    }
    expect(store.list()).toEqual([]);
  });

  it("refuses plain http to a host outside the local network, and warns about every host that is not this computer", async () => {
    const { store } = await open();
    expect(() => store.save({ label: "Public", kind: "openai-compatible", baseUrl: "http://example.com/v1" })).toThrow(
      /https/,
    );
    expect(() => store.save({ label: "Public IP", kind: "openai-compatible", baseUrl: "http://8.8.8.8/v1" })).toThrow();
    const local = store.save({ label: "Here", kind: "ollama", baseUrl: "http://localhost:11434/v1/" });
    expect(local.baseUrl).toBe("http://localhost:11434/v1");
    expect(local.warning).toBeNull();
    const lan = store.save({ label: "Desk", kind: "openai-compatible", baseUrl: "http://192.168.1.20:8080/v1" });
    expect(lan.warning).toMatch(/another computer.*not encrypted/);
    const remote = store.save({ label: "Cloud", kind: "openai-compatible", baseUrl: "https://models.example.com/v1" });
    expect(remote.warning).toMatch(/not on this computer/);
  });

  it("saves without contacting the server", async () => {
    const fake = await server();
    const { store } = await open();
    const saved = store.save({ label: "Mine", kind: "openai-compatible", baseUrl: fake.base });
    expect(saved).toMatchObject({ state: "unchecked", models: [], hasKey: false, chatOnly: true });
    expect(fake.seen).toEqual([]);
  });

  it("limits the number of endpoints", async () => {
    const { store } = await open();
    for (let index = 0; index < 8; index += 1)
      store.save({ label: `E${index}`, kind: "openai-compatible", baseUrl: `http://127.0.0.1:${9000 + index}/v1` });
    expect(() =>
      store.save({ label: "Ninth", kind: "openai-compatible", baseUrl: "http://127.0.0.1:9100/v1" }),
    ).toThrow(/up to 8/);
  });
});

describe("EndpointStore: the model list (only when asked)", () => {
  it("fetches the list on request, trims and deduplicates it, and offers the models as agent models", async () => {
    const fake = await server();
    const { store, changes } = await open();
    const saved = store.save({ label: "Local LLM", kind: "openai-compatible", baseUrl: fake.base });
    const checked = await store.check(saved.id);
    expect(checked).toMatchObject({ state: "ok", models: ["llama3:8b", "hf.co/org/model:q4", "spaced"] });
    expect(checked.message).toBe("3 models found.");
    expect(fake.seen).toEqual([{ method: "GET", url: "/v1/models", authorization: undefined }]);
    expect(store.modelOptions().map((option) => option.id)).toEqual([
      `endpoint:${saved.id}/llama3:8b`,
      `endpoint:${saved.id}/hf.co/org/model:q4`,
      `endpoint:${saved.id}/spaced`,
    ]);
    // The window was told when the fetch started and when it ended.
    expect(changes.some((list) => list.some((item) => item.state === "checking"))).toBe(true);
    expect(changes.at(-1)?.[0]?.state).toBe("ok");
  });

  it("says so when the server lists no models, without calling it an error", async () => {
    const fake = await server((self) => {
      self.mode = "empty";
    });
    const { store } = await open();
    const checked = await store.check(store.save({ label: "Empty", kind: "ollama", baseUrl: fake.base }).id);
    expect(checked).toMatchObject({ state: "ok", models: [] });
    expect(checked.message).toMatch(/lists no models/);
  });

  it("answers 401 as 'rejected' and says whether a key was missing or wrong; the right key works", async () => {
    const fake = await server((self) => {
      self.mode = "needs-key";
    });
    const { store } = await open();
    const saved = store.save({ label: "Guarded", kind: "openai-compatible", baseUrl: fake.base });

    // No key: the request carries no Authorization header and the answer says a key is needed.
    const noKey = await store.check(saved.id);
    expect(noKey.state).toBe("rejected");
    expect(noKey.message).toMatch(/asks for a key/);
    expect(fake.seen.at(-1)?.authorization).toBeUndefined();

    store.save({
      id: saved.id,
      label: "Guarded",
      kind: "openai-compatible",
      baseUrl: fake.base,
      key: "wrong-key-0000",
    });
    const wrong = await store.check(saved.id);
    expect(wrong.state).toBe("rejected");
    expect(wrong.message).toMatch(/did not accept the key/);
    // The server echoed the header into its error body; the answer must not carry it.
    expect(JSON.stringify(wrong)).not.toContain("wrong-key-0000");

    store.save({ id: saved.id, label: "Guarded", kind: "openai-compatible", baseUrl: fake.base, key: KEY });
    const right = await store.check(saved.id);
    expect(right).toMatchObject({ state: "ok", hasKey: true, maskedKey: "••••1234" });
    expect(fake.seen.at(-1)?.authorization).toBe(`Bearer ${KEY}`);
  });

  it("ends a request that takes too long as 'unreachable' and keeps the time limit short", async () => {
    const fake = await server((self) => {
      self.mode = "slow";
    });
    const { store } = await open({ timeoutMs: 200 });
    const started = Date.now();
    const checked = await store.check(store.save({ label: "Slow", kind: "openai-compatible", baseUrl: fake.base }).id);
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(checked).toMatchObject({ state: "unreachable" });
    expect(checked.message).toMatch(/did not answer in time/);
    // The state is kept, so the list shows it after a restart of the window.
    expect(store.get(checked.id)?.state).toBe("unreachable");
  });

  it("does not follow a redirect (the key must not go to another host)", async () => {
    const target = await server();
    const fake = await server((self) => {
      self.mode = "redirect";
    });
    fake.redirectTo = `${target.base}/models`;
    const { store } = await open();
    const saved = store.save({ label: "Redirecting", kind: "openai-compatible", baseUrl: fake.base, key: KEY });
    const checked = await store.check(saved.id);
    expect(checked.state).toBe("unreachable");
    expect(target.seen).toEqual([]);
  });

  it("calls a server that is not there, a wrong route, a failing server and a wrong body 'unreachable' with a reason", async () => {
    const dead = await server();
    const deadBase = dead.base;
    await dead.stop();
    servers.splice(servers.indexOf(dead), 1);
    const { store } = await open();
    expect((await store.check(store.save({ label: "Dead", kind: "ollama", baseUrl: deadBase }).id)).message).toMatch(
      /Could not reach the server/,
    );
    for (const [mode, pattern] of [
      ["not-found", /ends with \/v1/],
      ["server-error", /answered 500/],
      ["not-a-list", /not with an OpenAI-style model list/],
      ["huge", /not with an OpenAI-style model list/],
    ] as const) {
      const fake = await server((self) => {
        self.mode = mode;
      });
      const checked = await store.check(store.save({ label: mode, kind: "openai-compatible", baseUrl: fake.base }).id);
      expect(checked.state, mode).toBe("unreachable");
      expect(checked.message, mode).toMatch(pattern);
    }
  });

  it("drops the answer of a fetch that ends after the address was changed or the endpoint removed", async () => {
    const slow = await server((self) => {
      self.mode = "slow";
    });
    const fast = await server();
    const { store } = await open({ timeoutMs: 400 });
    const saved = store.save({ label: "Moving", kind: "openai-compatible", baseUrl: slow.base });
    const pending = store.check(saved.id);
    store.save({ id: saved.id, label: "Moving", kind: "openai-compatible", baseUrl: fast.base });
    await pending;
    expect(store.get(saved.id)).toMatchObject({ state: "unchecked", models: [] });

    const second = store.check(saved.id).catch(() => undefined);
    store.remove(saved.id);
    await second;
    expect(store.get(saved.id)).toBeNull();
  });

  it("parses model lists defensively", () => {
    expect(parseModelList(null)).toBeNull();
    expect(parseModelList("nope")).toBeNull();
    expect(parseModelList(JSON.stringify({ data: "x" }))).toBeNull();
    expect(
      parseModelList(JSON.stringify({ data: [{ id: "a" }, { id: 5 }, null, { id: "a\u0007b" }, { id: " b " }] })),
    ).toEqual(["a", "b"]);
    const many = { data: Array.from({ length: 500 }, (_, index) => ({ id: `m${index}` })) };
    expect(parseModelList(JSON.stringify(many))).toHaveLength(200);
  });
});

describe("EndpointStore: the key", () => {
  it("never shows the key: not in answers, events, messages or the database, and redaction knows it", async () => {
    const fake = await server();
    const { dir, store, keys, changes } = await open();
    setApiKeySource(keys);
    const saved = store.save({ label: "Keyed", kind: "openai-compatible", baseUrl: fake.base, key: KEY });
    expect(saved).toMatchObject({ hasKey: true, maskedKey: "••••1234" });
    await store.check(saved.id);
    expect(JSON.stringify([store.list(), changes])).not.toContain(KEY);
    expect(await everythingOnDisk(dir)).not.toContain(KEY);
    expect(await everythingOnDisk(dir)).not.toContain(Buffer.from(KEY).toString("base64"));
    expect(redactApiKeys(`the server said ${KEY}`)).toBe("the server said [redacted]");
    expect(store.resolve(saved.id)?.key).toBe(KEY);
  });

  it("keeps the key when other fields change, removes it on request, and on a change of host", async () => {
    const one = await server();
    const two = await server();
    const { store, keys } = await open();
    const saved = store.save({ label: "Keyed", kind: "openai-compatible", baseUrl: one.base, key: KEY });
    const slot = endpointKeySlot(saved.id);

    const renamed = store.save({ id: saved.id, label: "Renamed", kind: "openai-compatible", baseUrl: one.base });
    expect(renamed).toMatchObject({ label: "Renamed", hasKey: true });
    expect(keys.slotKey(slot)).toBe(KEY);

    // Same host, other path: still the same host, the key stays.
    expect(
      store.save({ id: saved.id, label: "Renamed", kind: "openai-compatible", baseUrl: `${one.base}/x` }).hasKey,
    ).toBe(true);

    // Another host: the key does not travel.
    const moved = store.save({ id: saved.id, label: "Renamed", kind: "openai-compatible", baseUrl: two.base });
    expect(moved).toMatchObject({ hasKey: false, models: [], state: "unchecked" });
    expect(moved.message).toMatch(/another host.*key was removed/);
    expect(keys.slotKey(slot)).toBeNull();

    store.save({ id: saved.id, label: "Renamed", kind: "openai-compatible", baseUrl: two.base, key: KEY });
    expect(
      store.save({ id: saved.id, label: "Renamed", kind: "openai-compatible", baseUrl: two.base, clearKey: true })
        .hasKey,
    ).toBe(false);
  });

  it("removes the endpoint with its key and its models", async () => {
    const fake = await server();
    const { store, keys } = await open();
    const saved = store.save({ label: "Gone", kind: "openai-compatible", baseUrl: fake.base, key: KEY });
    await store.check(saved.id);
    expect(store.modelOptions().length).toBeGreaterThan(0);
    store.remove(saved.id);
    expect(store.list()).toEqual([]);
    expect(store.modelOptions()).toEqual([]);
    expect(store.resolve(saved.id)).toBeNull();
    expect(keys.slotKey(endpointKeySlot(saved.id))).toBeNull();
    expect(keys.values()).toEqual([]);
    expect(() => store.remove(saved.id)).not.toThrow();
  });

  it("does not touch the provider keys of Codex and Claude", async () => {
    const { store, keys } = await open();
    keys.set("codex", "test-key-provider-0000");
    const saved = store.save({ label: "Other", kind: "openai-compatible", baseUrl: "http://127.0.0.1:9/v1", key: KEY });
    store.remove(saved.id);
    expect(keys.list()[0]).toMatchObject({ provider: "codex", maskedKey: "••••0000" });
    expect(keys.list()).toHaveLength(2);
  });
});

describe("EndpointStore: detect local", () => {
  it("looks only at the probe addresses; an answering server is added with its models, silence gives an empty list", async () => {
    const ollama = await server();
    const unrelated = await server();
    const closed = await server();
    const closedBase = closed.base;
    await closed.stop();
    servers.splice(servers.indexOf(closed), 1);
    const { store } = await open({
      probes: {
        probes: [
          { id: "ollama", kind: "ollama", label: "Ollama", baseUrl: ollama.base },
          { id: "lmstudio", kind: "lmstudio", label: "LM Studio", baseUrl: closedBase },
        ],
        detectTimeoutMs: 500,
      },
    });
    const found = await store.detectLocal();
    expect(found.map((item) => item.id)).toEqual(["ollama"]);
    expect(found[0]).toMatchObject({ kind: "ollama", state: "ok", hasKey: false });
    expect(found[0]?.models).toContain("llama3:8b");
    expect(store.list().map((item) => item.id)).toEqual(["ollama"]);
    expect(unrelated.seen).toEqual([]);
    expect(ollama.seen).toEqual([{ method: "GET", url: "/v1/models", authorization: undefined }]);

    // A second run refreshes the same endpoint instead of adding another.
    await store.detectLocal();
    expect(store.list()).toHaveLength(1);
  });

  it("finds nothing when nothing listens, without an error", async () => {
    const closed = await server();
    const base = closed.base;
    await closed.stop();
    servers.splice(servers.indexOf(closed), 1);
    const { store } = await open({
      probes: { probes: [{ id: "ollama", kind: "ollama", label: "Ollama", baseUrl: base }], detectTimeoutMs: 300 },
    });
    await expect(store.detectLocal()).resolves.toEqual([]);
    expect(store.list()).toEqual([]);
  });

  it("uses the Ollama and LM Studio loopback addresses by default", async () => {
    const { DEFAULT_PROBES } = await import("./endpoint-store");
    expect(DEFAULT_PROBES.map((probe) => probe.baseUrl)).toEqual([
      "http://127.0.0.1:11434/v1",
      "http://127.0.0.1:1234/v1",
    ]);
  });
});
