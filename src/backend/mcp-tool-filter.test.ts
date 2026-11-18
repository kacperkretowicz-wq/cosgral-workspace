// @vitest-environment node
// COSGRAL W10-KK1: the tool allowlist of a space: a tool that is not allowed is neither shown to an agent nor callable.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { McpManager } from "./mcp-manager";
import { McpStore, type SecretBox } from "./mcp-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { suiteTimeout } from "./testing/timeouts";

const ECHO_SERVER = join(__dirname, "testing", "mcp-echo-server.mjs");
const roots: string[] = [];
const managers: McpManager[] = [];
afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.stop()));
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => Buffer.from(plain, "utf8").toString("base64"),
  decrypt: (cipher) => Buffer.from(cipher, "base64").toString("utf8"),
};

async function start(filter?: (server: string, tool: string) => boolean) {
  const root = await mkdtemp(join(tmpdir(), "cosgral-mcp-filter-"));
  roots.push(root);
  const database = testDatabase(root);
  await database.initialize();
  const manager = new McpManager({ store: new McpStore(database, box), emit: () => undefined, toolFilter: filter });
  managers.push(manager);
  const added = await manager.add({
    name: "local_echo",
    transport: "stdio",
    command: process.execPath,
    args: [ECHO_SERVER],
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && manager.list().find((server) => server.id === added.id)?.status === "checking") {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return manager;
}

describe("MCP tool allowlist (W10-KK1)", { timeout: suiteTimeout(30_000, 30_000) }, () => {
  it("without a filter every tool is shown and callable, as before", async () => {
    const manager = await start();
    expect(manager.toolsFor("chief")[0]?.tools.map((tool) => tool.name)).toEqual(["echo", "env_check"]);
    expect((await manager.callTool("chief", "mcp_local_echo", "echo", { text: "a" })).success).toBe(true);
  });

  it("a tool that is not allowed is not shown and is refused with a plain reason; the others work", async () => {
    const manager = await start((server, tool) => !(server === "local_echo" && tool === "env_check"));
    expect(manager.toolsFor("chief")[0]?.tools.map((tool) => tool.name)).toEqual(["echo"]);
    const refused = await manager.callTool("chief", "mcp_local_echo", "env_check", {});
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused)).toContain("not allowed in this space");
    expect((await manager.callTool("chief", "mcp_local_echo", "echo", { text: "b" })).success).toBe(true);
  });

  it("when no tool is allowed the server shows no tools at all", async () => {
    const manager = await start(() => false);
    expect(manager.toolsFor("chief")).toEqual([]);
  });
});
