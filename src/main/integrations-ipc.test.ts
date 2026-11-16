// @vitest-environment node
// COSGRAL W10-KK1: the `integrations:*` handlers with the real manager, a mock OAuth service on this computer, an in-memory MCP
// list and the window's trust check on. Nothing of a secret may come back through any answer.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isIntegrationDescription, isIntegrationList, isIntegrationStatus } from "@openbot/contracts/ipc";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IntegrationManager, type IntegrationMcpPort } from "../backend/integration-manager";
import { OpenBotDatabase } from "../backend/openbot-database";
import { browserThatAllows, MockService } from "../backend/testing/oauth-mock";
import type { SecretBox } from "../backend/vault-store";
import { registerIntegrationsIpc } from "./integrations-ipc";
import { ipcRegistry } from "./trusted-ipc";

type Listener = (event: { senderFrame?: { url?: string | null } | null }, ...args: unknown[]) => unknown;
const handlers = new Map<string, Listener>();
const MAIN = "openbot-app://app/index.html";
const call = async (channel: string, payload: unknown, serverId = "local", url = MAIN) => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({ senderFrame: { url } }, { serverId, payload });
};

const box: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4), "base64").toString("utf8"),
};

let folder = "";
let database: OpenBotDatabase | null = null;
let mock: MockService | null = null;
let manager: IntegrationManager | null = null;
const entries = new Map<string, { id: string; name: string; status: string }>();

const mcp: IntegrationMcpPort = {
  list: () => [...entries.values()],
  add: async (input) => {
    const id = `mcp-${entries.size + 1}`;
    entries.set(id, { id, name: input.name, status: "available" });
    return { id };
  },
  update: async () => undefined,
  remove: async (input) => {
    entries.delete(input.serverId);
  },
};

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "cosgral-integrations-ipc-"));
  database = new OpenBotDatabase(join(folder, "data"));
  await database.initialize();
  mock = new MockService();
  await mock.start();
  const service = mock;
  manager = new IntegrationManager({
    database,
    box,
    mcp,
    spaceId: "main",
    emit: () => undefined,
    openBrowser: browserThatAllows(service),
    endpointsFor: () => service.endpoints,
    timeoutMs: 3_000,
  });
  ipcRegistry.register = (channel, listener) => {
    handlers.set(channel, listener);
  };
  registerIntegrationsIpc(() => manager);
});
afterAll(async () => {
  await mock?.stop();
  database?.close();
  await rm(folder, { recursive: true, force: true });
});

describe("integrations IPC (W10-KK1)", () => {
  it("configures, connects, reports and disconnects a service; no answer carries a secret", async () => {
    expect(isIntegrationList(await call("integrations:list", null))).toBe(true);
    await call("integrations:configure", {
      service: "github",
      clientId: "client-1",
      clientSecret: "client-secret-xyz",
      mcpUrl: "https://mcp.example.test/mcp",
    });
    const description = await call("integrations:describe", { service: "github" });
    expect(isIntegrationDescription(description)).toBe(true);
    const waiting = await call("integrations:connect", { service: "github" });
    expect(isIntegrationStatus(waiting)).toBe(true);
    expect(waiting).toMatchObject({ phase: "waiting-for-browser" });
    await manager?.whenIdle("github");
    const status = await call("integrations:status", { service: "github" });
    expect(status).toMatchObject({ phase: "connected", mcpServerName: "github" });
    const everything = JSON.stringify([description, waiting, status, await call("integrations:list", null)]);
    for (const secret of ["client-secret-xyz", "access-1", "refresh-1", "one-time-code"])
      expect(everything).not.toContain(secret);
    expect(isIntegrationList(await call("integrations:disconnect", { service: "github", forgetClient: true }))).toBe(
      true,
    );
    expect(entries.size).toBe(0);
    expect(await call("integrations:status", { service: "github" })).toMatchObject({ phase: "not-configured" });
  });

  it("cancel answers with the current status", async () => {
    await call("integrations:configure", { service: "notion", clientId: "client-1", clientSecret: "s" });
    expect(await call("integrations:cancel", { service: "notion" })).toMatchObject({ phase: "disconnected" });
  });

  it("refuses a bad request, another server and an untrusted page before doing anything", async () => {
    await expect(call("integrations:connect", { service: "slack" })).rejects.toThrow(/one of/);
    await expect(call("integrations:configure", { service: "github", redirectPort: 80 })).rejects.toThrow(/1024/);
    await expect(
      call("integrations:configure", { service: "github", mcpUrl: "http://example.com/mcp" }),
    ).rejects.toThrow(/https/);
    await expect(call("integrations:disconnect", { service: "github" })).rejects.toThrow(/true or false/);
    await expect(call("integrations:list", null, "remote-1")).rejects.toThrow(/this computer/);
    await expect(call("integrations:list", null, "local", "https://example.com/")).rejects.toThrow(/untrusted/);
  });
});
