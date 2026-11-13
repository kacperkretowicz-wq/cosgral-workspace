// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { McpStore, type SecretBox } from "./mcp-store";
import type { OpenBotDatabase } from "./openbot-database";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];

afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A reversible stand-in for Electron safeStorage: the stored text never equals the secret. */
const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `enc:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};
const noBox: SecretBox = {
  canEncrypt: () => false,
  encrypt: () => {
    throw new Error("unavailable");
  },
  decrypt: () => {
    throw new Error("unavailable");
  },
};

async function open(box: SecretBox = fakeBox, root?: string) {
  const directory = root ?? (await mkdtemp(join(tmpdir(), "cosgral-mcp-store-")));
  if (!root) roots.push(directory);
  const database: OpenBotDatabase = testDatabase(directory);
  await database.initialize();
  return { root: directory, database, store: new McpStore(database, box) };
}

/** Every text cell of the database that contains `needle` (tables and event log). */
function everywhere(database: OpenBotDatabase, needle: string): string[] {
  const db = database.connection;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  const found: string[] = [];
  for (const table of tables) {
    if (!isDynamicRecord(table) || !isString(table.name) || table.name.startsWith("sqlite_")) continue;
    for (const row of db.prepare(`SELECT * FROM "${table.name}"`).all()) {
      if (JSON.stringify(row).includes(needle)) found.push(table.name);
    }
  }
  return found;
}

describe("McpStore", () => {
  it("adds stdio and http servers and lists them by name", async () => {
    const { store } = await open();
    const http = store.add({ name: "remote_docs", transport: "http", url: "http://127.0.0.1:7777/mcp" });
    const stdio = store.add({ name: "local_echo", transport: "stdio", command: "node", args: ["echo.mjs", "--x"] });

    expect(stdio).toMatchObject({
      name: "local_echo",
      transport: "stdio",
      command: "node",
      args: ["echo.mjs", "--x"],
      url: null,
      cwd: null,
      secretNames: [],
    });
    expect(http).toMatchObject({ transport: "http", url: "http://127.0.0.1:7777/mcp", command: null, args: [] });
    expect(store.list().map((server) => server.name)).toEqual(["local_echo", "remote_docs"]);
  });

  it("refuses bad names, duplicates and incomplete transports", async () => {
    const { store } = await open();
    store.add({ name: "echo", transport: "stdio", command: "node" });
    expect(() => store.add({ name: "echo", transport: "stdio", command: "node" })).toThrow(/already/);
    expect(() => store.add({ name: "Echo-Server", transport: "stdio", command: "node" })).toThrow(/name/);
    expect(() => store.add({ name: "no_command", transport: "stdio" })).toThrow(/command/);
    expect(() => store.add({ name: "no_url", transport: "http" })).toThrow(/address/);
    expect(() => store.add({ name: "ftp_url", transport: "http", url: "ftp://127.0.0.1/mcp" })).toThrow(/http/);
  });

  it("keeps secrets encrypted: only names are readable, values only through getSecrets", async () => {
    const { database, store } = await open();
    const server = store.add({
      name: "secret_srv",
      transport: "http",
      url: "http://127.0.0.1:7777/mcp",
      secrets: { Authorization: "Bearer top-secret-value-123" },
    });

    expect(server.secretNames).toEqual(["Authorization"]);
    expect(JSON.stringify(store.list())).not.toContain("top-secret-value-123");
    expect(store.getSecrets(server.id)).toEqual({ Authorization: "Bearer top-secret-value-123" });
    expect(everywhere(database, "top-secret-value-123")).toEqual([]);
  });

  it("refuses to store secrets when the system cannot encrypt them, but works without secrets", async () => {
    const { store } = await open(noBox);
    expect(() =>
      store.add({ name: "needs_key", transport: "stdio", command: "node", secrets: { API_KEY: "x" } }),
    ).toThrow(/cannot be stored safely/);
    expect(store.add({ name: "plain", transport: "stdio", command: "node" }).secretNames).toEqual([]);
  });

  it("updates fields, replaces secrets only when given, and removes", async () => {
    const { database, store } = await open();
    const server = store.add({ name: "srv", transport: "stdio", command: "node", secrets: { TOKEN: "old-token-aaa" } });
    const renamed = store.update({ serverId: server.id, name: "srv_two", args: ["a"] });
    expect(renamed).toMatchObject({ name: "srv_two", args: ["a"], secretNames: ["TOKEN"] });
    expect(store.getSecrets(server.id)).toEqual({ TOKEN: "old-token-aaa" });

    store.update({ serverId: server.id, secrets: { OTHER: "new-token-bbb" } });
    expect(store.getSecrets(server.id)).toEqual({ OTHER: "new-token-bbb" });
    expect(everywhere(database, "old-token-aaa")).toEqual([]);

    store.remove(server.id);
    expect(store.list()).toEqual([]);
    expect(() => store.update({ serverId: server.id, name: "x" })).toThrow(/no longer exists/);
  });

  it("switches a server per agent: on by default, off only for that agent, cleaned up on removal", async () => {
    const { store } = await open();
    const a = store.add({ name: "a_srv", transport: "stdio", command: "node" });
    const b = store.add({ name: "b_srv", transport: "stdio", command: "node" });

    expect(store.listAgentSettings("chief")).toEqual([
      { botId: "chief", serverId: a.id, enabled: true },
      { botId: "chief", serverId: b.id, enabled: true },
    ]);
    store.setAgentEnabled({ botId: "chief", serverId: a.id, enabled: false });
    expect(store.isEnabled("chief", a.id)).toBe(false);
    expect(store.isEnabled("research", a.id)).toBe(true);
    expect(store.isEnabled("chief", b.id)).toBe(true);
    expect(() => store.setAgentEnabled({ botId: "chief", serverId: "missing", enabled: true })).toThrow(
      /no longer exists/,
    );

    store.remove(a.id);
    expect(store.listAgentSettings("chief")).toEqual([{ botId: "chief", serverId: b.id, enabled: true }]);
    store.setAgentEnabled({ botId: "chief", serverId: b.id, enabled: false });
    store.deleteAgent("chief");
    expect(store.isEnabled("chief", b.id)).toBe(true);
  });

  it("keeps servers, secrets and switches across a restart", async () => {
    const { root, store } = await open();
    const server = store.add({ name: "kept", transport: "stdio", command: "node", secrets: { KEY: "k-123" } });
    store.setAgentEnabled({ botId: "chief", serverId: server.id, enabled: false });
    closeTestDatabases();

    const reopened = (await open(fakeBox, root)).store;
    expect(reopened.list()).toEqual([server]);
    expect(reopened.getSecrets(server.id)).toEqual({ KEY: "k-123" });
    expect(reopened.isEnabled("chief", server.id)).toBe(false);
  });
});
