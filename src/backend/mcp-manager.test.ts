// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server as HttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, McpServer } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { McpManager } from "./mcp-manager";
import { McpStore, type SecretBox } from "./mcp-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
// @ts-expect-error The fixture is a plain .mjs module without types.
import { echoFetch } from "./testing/mcp-echo-server.mjs";

const ECHO_SERVER = join(__dirname, "testing", "mcp-echo-server.mjs");
const roots: string[] = [];
const managers: McpManager[] = [];
const httpServers: HttpServer[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.stop()));
  await Promise.all(httpServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => Buffer.from(plain, "utf8").toString("base64"),
  decrypt: (cipher) => Buffer.from(cipher, "base64").toString("utf8"),
};

async function setup(fetcher?: typeof fetch) {
  const root = await mkdtemp(join(tmpdir(), "cosgral-mcp-manager-"));
  roots.push(root);
  const database = testDatabase(root);
  await database.initialize();
  const events: AgentEvent[] = [];
  const store = new McpStore(database, box);
  const manager = new McpManager({ store, emit: (event) => events.push(event), fetch: fetcher });
  managers.push(manager);
  return { manager, events, store };
}

async function settled(manager: McpManager, serverId: string): Promise<McpServer> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const server = manager.list().find((candidate) => candidate.id === serverId);
    if (server && server.status !== "checking") return server;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The MCP server did not settle.");
}

function addEcho(manager: McpManager, secrets?: Record<string, string>) {
  return manager.add({
    name: "local_echo",
    transport: "stdio",
    command: process.execPath,
    args: [ECHO_SERVER],
    secrets,
  });
}

async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  httpServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!isDynamicRecord(address) || !isNumber(address.port)) throw new Error("The test server has no port.");
  return `http://127.0.0.1:${address.port}/rpc`;
}

describe("McpManager", { timeout: 30_000 }, () => {
  it("connects a stdio server, lists its tools and gives them to agents under mcp_<name>", async () => {
    const { manager, events } = await setup();
    const added = await addEcho(manager);
    expect(added.status).toBe("checking");

    const server = await settled(manager, added.id);
    expect(server).toMatchObject({ status: "available", errorMessage: null });
    expect(server.tools.map((tool) => tool.name)).toEqual(["echo", "env_check"]);
    expect(events.filter((event) => event.type === "mcp-servers-changed").length).toBeGreaterThanOrEqual(2);

    const [namespace] = manager.toolsFor("chief");
    expect(namespace).toMatchObject({ type: "namespace", name: "mcp_local_echo" });
    expect(namespace?.tools.map((tool) => tool.name)).toEqual(["echo", "env_check"]);
    expect(namespace?.tools[0]?.inputSchema).toMatchObject({ type: "object", required: ["text"] });

    const result = await manager.callTool("chief", "mcp_local_echo", "echo", { text: "hello" });
    expect(result).toEqual({ success: true, contentItems: [{ type: "inputText", text: "cosgral-mcp-echo: hello" }] });
  });

  it("passes secret environment values to the server without exposing them", async () => {
    const { manager, events } = await setup();
    const added = await addEcho(manager, { ECHO_SECRET: "s3cret-value-xyz" });
    await settled(manager, added.id);

    const result = await manager.callTool("chief", "mcp_local_echo", "env_check", {});
    expect(result.contentItems[0]).toEqual({ type: "inputText", text: '{"secretPresent":true,"length":16}' });
    expect(JSON.stringify(manager.list())).not.toContain("s3cret-value-xyz");
    expect(JSON.stringify(events)).not.toContain("s3cret-value-xyz");
  });

  it("follows each agent's switch and refuses calls of a switched-off or removed server", async () => {
    const { manager, events } = await setup();
    const added = await addEcho(manager);
    await settled(manager, added.id);

    manager.setAgentEnabled({ botId: "chief", serverId: added.id, enabled: false });
    expect(events).toContainEqual({
      type: "agent-mcp-changed",
      botId: "chief",
      settings: [{ botId: "chief", serverId: added.id, enabled: false }],
    });
    expect(manager.toolsFor("chief")).toEqual([]);
    expect(manager.toolsFor("research")).toHaveLength(1);
    const off = await manager.callTool("chief", "mcp_local_echo", "echo", { text: "x" });
    expect(off.success).toBe(false);
    expect(JSON.stringify(off)).toContain("switched off");

    await manager.remove({ serverId: added.id });
    expect(manager.list()).toEqual([]);
    expect(manager.toolsFor("research")).toEqual([]);
    const gone = await manager.callTool("research", "mcp_local_echo", "echo", { text: "x" });
    expect(gone.success).toBe(false);
    expect(JSON.stringify(gone)).toContain("no MCP server");
  });

  it("marks a server that cannot start as an error with a readable reason", async () => {
    const { manager } = await setup();
    const added = await manager.add({ name: "broken", transport: "stdio", command: "cosgral-no-such-command-xyz" });
    const server = await settled(manager, added.id);
    expect(server.status).toBe("error");
    expect(server.errorMessage).toBeTruthy();
    expect(manager.toolsFor("chief")).toEqual([]);
  });

  it("marks an http server that answers 401 as needing a login, without leaking the header", async () => {
    const { manager } = await setup();
    const url = await listen((_request, response) => {
      response.writeHead(401, { "content-type": "application/json" });
      response.end('{"error":"unauthorized"}');
    });
    const added = await manager.add({
      name: "locked",
      transport: "http",
      url,
      secrets: { Authorization: "Bearer wrong-token-777" },
    });
    const server = await settled(manager, added.id);
    expect(server.status).toBe("needs-login");
    expect(server.errorMessage).not.toContain("wrong-token-777");
    expect(manager.toolsFor("chief")).toEqual([]);
  });

  // A successful HTTP session runs through an injected fetch, without the network: on the test computer a
  // security product rewrites loopback HTTP responses of MCP requests (header mcp-protocol-version, or a
  // path named /mcp) into a broken chunked encoding. See docs/cosgral-raporty/kapi-w2-mcp.md.
  it("connects a streamable http server and sends the secret headers", async () => {
    const seen: string[] = [];
    const recording: typeof fetch = async (url, init) => {
      seen.push(new Headers(init?.headers).get("authorization") ?? "");
      return echoFetch(url, init);
    };
    const { manager } = await setup(recording);
    const added = await manager.add({
      name: "remote_echo",
      transport: "http",
      url: "https://mcp.example.test/rpc",
      secrets: { Authorization: "Bearer good" },
    });
    const server = await settled(manager, added.id);

    expect(server.errorMessage).toBeNull();
    expect(server).toMatchObject({ status: "available", tools: [{ name: "echo" }, { name: "env_check" }] });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((value) => value === "Bearer good")).toBe(true);
    const result = await manager.callTool("chief", "mcp_remote_echo", "echo", { text: "over http" });
    expect(result.contentItems).toEqual([{ type: "inputText", text: "cosgral-mcp-echo: over http" }]);
  });
  it("reconnects after an update, and a new manager on the same database connects the saved servers", async () => {
    const { manager, store } = await setup();
    const added = await addEcho(manager);
    await settled(manager, added.id);
    await manager.update({ serverId: added.id, name: "echo_two" });
    await settled(manager, added.id);
    expect(manager.toolsFor("chief").map((namespace) => namespace.name)).toEqual(["mcp_echo_two"]);
    await manager.stop();

    const restarted = new McpManager({ store, emit: () => undefined });
    managers.push(restarted);
    expect(restarted.list()).toMatchObject([{ name: "echo_two", status: "checking" }]);
    await restarted.start();
    expect(await settled(restarted, added.id)).toMatchObject({ status: "available" });
  });
});
