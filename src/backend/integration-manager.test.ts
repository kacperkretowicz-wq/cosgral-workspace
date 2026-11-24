// @vitest-environment node
// COSGRAL W10-KK1: the account sign-ins on a real database, against a mock OAuth service on this computer and an in-memory MCP
// list. No real account, no call outside this computer. Every test also looks for a token or a secret where it must not be.

import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, isIntegrationList, isIntegrationStatus } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { IntegrationManager, type IntegrationMcpPort } from "./integration-manager";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { browserThatAllows, MockService, portOf } from "./testing/oauth-mock";
import type { SecretBox } from "./vault-store";

const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};

class FakeMcp implements IntegrationMcpPort {
  readonly servers = new Map<
    string,
    { id: string; name: string; status: string; url: string; authorization: string }
  >();
  #counter = 0;
  list() {
    return [...this.servers.values()].map((server) => ({ id: server.id, name: server.name, status: server.status }));
  }
  async add(input: { name: string; transport: "http"; url: string; secrets: { Authorization: string } }) {
    this.#counter += 1;
    const id = `mcp-${this.#counter}`;
    this.servers.set(id, {
      id,
      name: input.name,
      status: "available",
      url: input.url,
      authorization: input.secrets.Authorization,
    });
    return { id };
  }
  async update(input: { serverId: string; url?: string; secrets?: { Authorization: string } }) {
    const server = this.servers.get(input.serverId);
    if (!server) throw new Error("gone");
    if (input.url) server.url = input.url;
    if (input.secrets) server.authorization = input.secrets.Authorization;
    return server;
  }
  async remove(input: { serverId: string }) {
    this.servers.delete(input.serverId);
  }
}

const folders: string[] = [];
const mocks: MockService[] = [];
afterEach(async () => {
  closeTestDatabases();
  for (const mock of mocks.splice(0)) await mock.stop();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function setup(
  options: {
    existing?: string;
    clock?: { now: number };
    openBrowser?: (url: string) => Promise<void>;
    mcp?: FakeMcp;
  } = {},
) {
  const mock = new MockService();
  await mock.start();
  mocks.push(mock);
  const folder = options.existing ?? (await mkdtemp(join(tmpdir(), "cosgral-integrations-")));
  if (!options.existing) folders.push(folder);
  const database = testDatabase(join(folder, "data"));
  await database.initialize();
  const mcp = options.mcp ?? new FakeMcp();
  const events: AgentEvent[] = [];
  const clock = options.clock ?? { now: Date.parse("2026-11-16T12:00:00.000Z") };
  const manager = new IntegrationManager({
    database,
    box,
    mcp,
    spaceId: "main",
    emit: (event) => events.push(event),
    openBrowser: options.openBrowser ?? browserThatAllows(mock),
    now: () => new Date(clock.now),
    endpointsFor: () => mock.endpoints,
    timeoutMs: 3_000,
  });
  return { manager, mock, mcp, events, database, folder, clock };
}

type Setup = Awaited<ReturnType<typeof setup>>;
const SECRET_BITS = ["access-1", "access-2", "refresh-1", "client-secret-xyz", "one-time-code"];
const leaks = (value: unknown) => SECRET_BITS.filter((bit) => JSON.stringify(value).includes(bit));
const ready = (s: Setup, service: "github" | "google" | "notion" | "meta" = "github") => {
  s.manager.configure({
    service,
    clientId: "client-1",
    clientSecret: "client-secret-xyz",
    mcpUrl: "https://mcp.example.test/mcp",
  });
};
const connectAndWait = async (s: Setup, service: "github" | "google" | "notion" | "meta" = "github") => {
  const waiting = await s.manager.connect(service);
  await s.manager.whenIdle(service);
  return waiting;
};

describe("account integrations (W10-KK1)", () => {
  it("starts with four services that are not configured; configuring makes them ready; the secret never comes back", async () => {
    const s = await setup();
    const first = s.manager.list();
    expect(isIntegrationList(first)).toBe(true);
    expect(first.services.map((entry) => entry.phase)).toEqual([
      "not-configured",
      "not-configured",
      "not-configured",
      "not-configured",
    ]);
    ready(s);
    expect(s.manager.status("github").phase).toBe("disconnected");
    const description = s.manager.describe("github");
    expect(description).toMatchObject({
      clientIdSet: true,
      clientSecretSet: true,
      mcpUrl: "https://mcp.example.test/mcp",
      pkce: true,
    });
    expect(leaks(description)).toEqual([]);
    expect(s.manager.describe("google").mcpUrl).toBeNull();
    expect(s.manager.describe("notion").mcpUrl).toMatch(/^https:\/\//);
  });

  it("will not start without what it needs, and says what is missing", async () => {
    const s = await setup();
    await expect(s.manager.connect("github")).rejects.toThrow(/client id first/);
    s.manager.configure({ service: "github", clientId: "client-1" });
    await expect(s.manager.connect("github")).rejects.toThrow(/client secret/);
    s.manager.configure({ service: "notion", clientId: "client-1" });
    await expect(s.manager.connect("notion")).rejects.toThrow(/client secret/);
    s.manager.configure({ service: "google", clientId: "client-1", clientSecret: "client-secret-xyz" });
    await expect(s.manager.connect("google")).rejects.toThrow(/MCP address of Google Workspace is not known/);
    ready(s);
    await s.mcp.add({
      name: "github",
      transport: "http",
      url: "https://other.example/",
      secrets: { Authorization: "Bearer x" },
    });
    await expect(s.manager.connect("github")).rejects.toThrow(/named github already exists/);
    expect(s.mock.seen).toHaveLength(0);
  });

  it("connect answers with the waiting phase and the sign-in address; the end makes the MCP entry and saves the tokens", async () => {
    const s = await setup();
    ready(s);
    const waiting = await s.manager.connect("github");
    expect(isIntegrationStatus(waiting)).toBe(true);
    expect(waiting).toMatchObject({ phase: "waiting-for-browser", mcpServerName: null });
    expect(waiting.signInUrl).toContain("code_challenge_method=S256");
    expect(waiting.waitingUntil).not.toBeNull();
    await s.manager.whenIdle("github");
    const status = s.manager.status("github");
    expect(status).toMatchObject({ phase: "connected", mcpServerName: "github", signInUrl: null, waitingUntil: null });
    expect(status.connectedAt).not.toBeNull();
    expect([...s.mcp.servers.values()]).toMatchObject([
      { name: "github", url: "https://mcp.example.test/mcp", authorization: "Bearer access-1" },
    ]);
    expect(s.events.filter((event) => event.type === "integrations-changed").length).toBeGreaterThanOrEqual(2);
    expect(leaks(s.events)).toEqual([]);
    expect(leaks(s.manager.list())).toEqual([]);
  });

  it("tokens and the client secret are encrypted in the database; a restart keeps the sign-in and the renewal still works", async () => {
    const s = await setup();
    ready(s);
    await connectAndWait(s);
    const raw = JSON.stringify(s.database.connection.prepare("SELECT * FROM projection_integrations").all());
    expect(raw).toContain("client-1");
    for (const bit of SECRET_BITS) expect(raw).not.toContain(bit);
    s.database.close();
    const again = await setup({ existing: s.folder, mcp: s.mcp, clock: s.clock });
    await again.manager.reconcile();
    expect(again.manager.status("github")).toMatchObject({ phase: "connected", mcpServerName: "github" });
    expect(again.manager.describe("github")).toMatchObject({ clientIdSet: true, clientSecretSet: true });
    again.clock.now += 3_600_000;
    await again.manager.refreshDue();
    expect([...again.mcp.servers.values()][0]?.authorization).toBe("Bearer access-2");
  });

  it("after a restart a sign-in whose MCP entry is gone is not kept: no tokens without an entry", async () => {
    const s = await setup();
    ready(s);
    await connectAndWait(s);
    s.database.close();
    const again = await setup({ existing: s.folder });
    await again.manager.reconcile();
    expect(again.manager.status("github").phase).toBe("disconnected");
    expect(
      again.database.connection.prepare("SELECT token_enc FROM projection_integrations WHERE service = 'github'").get(),
    ).toMatchObject({ token_enc: null });
  });

  it("cancelling a waiting try stops it quietly; a second connect while waiting makes no second try", async () => {
    const s = await setup({ openBrowser: async () => undefined });
    ready(s);
    const first = await s.manager.connect("github");
    const second = await s.manager.connect("github");
    expect(second.signInUrl).toBe(first.signInUrl);
    expect(s.manager.cancel("github").phase).toBe("waiting-for-browser");
    await s.manager.whenIdle("github");
    expect(s.manager.status("github")).toMatchObject({ phase: "disconnected", reason: null });
    expect(s.mcp.servers.size).toBe(0);
  });

  it("a refused or timed-out try is a plain reason and can be tried again", async () => {
    const s = await setup();
    ready(s);
    s.mock.answer = {
      status: 401,
      body: JSON.stringify({ error: "invalid_client", error_description: "client-secret-xyz leaked?" }),
      type: "application/json",
    };
    await connectAndWait(s);
    const failed = s.manager.status("github");
    expect(failed).toMatchObject({ phase: "failed" });
    expect(failed.reason).toMatch(/client id or secret/);
    expect(leaks(failed)).toEqual([]);
    expect(s.mcp.servers.size).toBe(0);
    s.mock.answer = null;
    await connectAndWait(s);
    expect(s.manager.status("github").phase).toBe("connected");
    const quiet = await setup({ openBrowser: async () => undefined });
    ready(quiet);
    const waiting = await quiet.manager.connect("github");
    expect(waiting.phase).toBe("waiting-for-browser");
    await quiet.manager.whenIdle("github");
    expect(quiet.manager.status("github").reason).toMatch(/not finished in time/);
  });

  it("if the MCP entry cannot be made nothing is kept and the person is told", async () => {
    const s = await setup();
    ready(s);
    s.mcp.add = async () => {
      throw new Error("At most 64 MCP servers.");
    };
    await connectAndWait(s);
    expect(s.manager.status("github")).toMatchObject({ phase: "failed" });
    expect(s.manager.status("github").reason).toMatch(/Nothing was saved/);
    expect(
      JSON.stringify(s.database.connection.prepare("SELECT token_enc, state FROM projection_integrations").all()),
    ).toContain('"state":"idle"');
    expect(
      s.database.connection.prepare("SELECT token_enc FROM projection_integrations WHERE service = 'github'").get(),
    ).toMatchObject({ token_enc: null });
  });

  it("disconnect removes the MCP entry and the tokens for good; the client stays unless it is forgotten", async () => {
    const s = await setup();
    ready(s);
    await connectAndWait(s);
    await s.manager.disconnect({ service: "github", forgetClient: false });
    expect(s.mcp.servers.size).toBe(0);
    expect(s.manager.status("github")).toMatchObject({ phase: "disconnected", mcpServerName: null, connectedAt: null });
    expect(
      s.database.connection.prepare("SELECT token_enc FROM projection_integrations WHERE service = 'github'").get(),
    ).toMatchObject({ token_enc: null });
    expect(s.manager.describe("github").clientIdSet).toBe(true);
    await connectAndWait(s);
    await s.manager.disconnect({ service: "github", forgetClient: true });
    expect(s.manager.status("github").phase).toBe("not-configured");
    expect(s.manager.describe("github")).toMatchObject({ clientIdSet: false, clientSecretSet: false });
  });

  it("an MCP entry the person removed by hand takes the tokens with it at the next start", async () => {
    const s = await setup();
    ready(s);
    await connectAndWait(s);
    s.mcp.servers.clear();
    await s.manager.reconcile();
    expect(s.manager.status("github").phase).toBe("disconnected");
    expect(
      s.database.connection.prepare("SELECT token_enc FROM projection_integrations WHERE service = 'github'").get(),
    ).toMatchObject({ token_enc: null });
  });

  it("a service that refuses the saved sign-in shows as needs-login without a secret, and agents are not told it is fine", async () => {
    const s = await setup();
    ready(s);
    await connectAndWait(s);
    const entry = [...s.mcp.servers.values()][0];
    if (entry) entry.status = "needs-login";
    const status = s.manager.status("github");
    expect(status).toMatchObject({ phase: "needs-login", mcpServerName: null, connectedAt: null });
    expect(status.reason).toMatch(/Connect again/);
    expect(leaks(status)).toEqual([]);
    expect(isIntegrationStatus(status)).toBe(true);
  });

  it("renews a token that ends soon, updates the MCP header, and leaves the others alone", async () => {
    const s = await setup();
    ready(s);
    await connectAndWait(s);
    const calls = () => s.mock.seen.filter((seen) => seen.form.get("grant_type") === "refresh_token").length;
    await s.manager.refreshDue();
    expect(calls()).toBe(0);
    s.clock.now += 3_600_000 - 60_000;
    await s.manager.refreshDue();
    expect(calls()).toBe(1);
    expect([...s.mcp.servers.values()][0]?.authorization).toBe("Bearer access-2");
    expect(s.manager.status("github").phase).toBe("connected");
    await s.manager.refreshDue();
    expect(calls()).toBe(1);
  });

  it("a refused renewal marks needs-login and keeps nothing dead; a broken service is only tried again later", async () => {
    const s = await setup();
    ready(s);
    await connectAndWait(s);
    s.clock.now += 3_600_000;
    s.mock.answer = { status: 503, body: "busy", type: "text/plain" };
    await s.manager.refreshDue();
    expect(s.manager.status("github").phase).toBe("connected");
    s.mock.answer = { status: 400, body: JSON.stringify({ error: "invalid_grant" }), type: "application/json" };
    await s.manager.refreshDue();
    expect(s.manager.status("github")).toMatchObject({ phase: "needs-login" });
    expect(
      s.database.connection.prepare("SELECT token_enc FROM projection_integrations WHERE service = 'github'").get(),
    ).toMatchObject({ token_enc: null });
    const before = s.mock.seen.length;
    await s.manager.refreshDue();
    expect(s.mock.seen.length).toBe(before);
    s.mock.answer = null;
    await connectAndWait(s);
    expect(s.manager.status("github").phase).toBe("connected");
  });

  it("the tool allowlist applies to the service's MCP entry only and only when there is one", async () => {
    const s = await setup();
    ready(s);
    s.manager.configure({ service: "github", toolAllowlist: ["list_issues"] });
    expect(s.manager.toolAllowed("github", "delete_repo")).toBe(true);
    await connectAndWait(s);
    expect(s.manager.toolAllowed("github", "list_issues")).toBe(true);
    expect(s.manager.toolAllowed("github", "delete_repo")).toBe(false);
    expect(s.manager.toolAllowed("my_own_server", "anything")).toBe(true);
    s.manager.configure({ service: "github", toolAllowlist: null });
    expect(s.manager.toolAllowed("github", "delete_repo")).toBe(true);
  });

  it("the client id cannot change under a saved sign-in; scopes and the callback port are used at the next sign-in", async () => {
    const s = await setup();
    ready(s);
    const free = await new Promise<number>((done) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const port = portOf(probe);
        probe.close(() => done(port));
      });
    });
    s.manager.configure({ service: "github", scopes: ["read:user", "repo"], redirectPort: free });
    const waiting = await s.manager.connect("github");
    const url = new URL(waiting.signInUrl ?? "");
    expect(url.searchParams.get("scope")).toBe("read:user repo");
    expect(url.searchParams.get("redirect_uri")).toBe(`http://127.0.0.1:${free}/callback`);
    await s.manager.whenIdle("github");
    expect(() => s.manager.configure({ service: "github", clientId: "other-app" })).toThrow(/Disconnect this service/);
    s.manager.configure({ service: "github", clientId: "client-1" });
  });

  it("two spaces are two databases: a sign-in of one is not in the other", async () => {
    const a = await setup();
    const b = await setup();
    ready(a);
    await connectAndWait(a);
    expect(a.manager.status("github").phase).toBe("connected");
    expect(b.manager.status("github").phase).toBe("not-configured");
    expect(b.mcp.servers.size).toBe(0);
    expect(b.manager.list().services.every((entry) => entry.phase === "not-configured")).toBe(true);
  });
});
