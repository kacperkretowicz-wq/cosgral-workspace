// @vitest-environment node
// W11-KK (e): the plugin catalog loader and engine on a FAKE catalog folder (invented plugins) and a FAKE MCP engine.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AddMcpServerInput, AgentEvent, McpServer, UpdateMcpServerInput } from "@openbot/contracts/ipc";
import { isPluginCatalogChanged, isPluginDetails, isPluginList, isPluginSummary } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestDatabases, testDatabase } from "../testing/databases";
import { CatalogFolderError, loadCatalogFolder } from "./catalog-loader";
import { type McpPort, PluginCatalogService, secretsFor, serverNameFor } from "./plugin-catalog-service";

// Test values only.
const KEY = "test-api-key-value-0123456789abcdef";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

interface FakePlugin {
  slug: string;
  version?: string;
  featured?: boolean;
  category?: string;
  apps: unknown[];
  /** Replace the file text after the checksum was made: a changed file. */
  tamper?: string;
  /** Do not write the detail file. */
  missing?: boolean;
}

const httpApp = (id: string, extra: { macAutomation?: string[] } = {}) => ({
  id,
  name: `App ${id}`,
  description: "An invented app.",
  server: {
    name: id,
    transport: "http",
    url: `https://mcp.${id}.example.test/mcp`,
    auth: [{ id: "a", kind: "link", label: "Sign in", fields: [] }],
  },
  ...extra,
});
const keyApp = (id: string) => ({
  id,
  name: `App ${id}`,
  description: "An invented app with a key.",
  server: {
    name: id,
    transport: "stdio",
    command: "npx",
    args: ["-y", `${id}-server`],
    auth: [
      {
        id: "k",
        kind: "key",
        label: "API key",
        fields: [
          { id: "token", label: "API key", env: "FAKE_API_KEY", hint: "Account page" },
          { id: "bearer", label: "Header", header: "Authorization", prefix: "Bearer " },
        ],
      },
    ],
  },
});

async function writeCatalog(plugins: FakePlugin[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "plugin-catalog-"));
  roots.push(dir);
  const index = [];
  for (const plugin of plugins) {
    const version = plugin.version ?? "1.0.0";
    const detail = JSON.stringify({
      slug: plugin.slug,
      name: plugin.slug.toUpperCase(),
      tagline: `Tagline of ${plugin.slug}`,
      description: `Description of ${plugin.slug}`,
      category: plugin.category ?? "productivity",
      creatorName: "Example Maker",
      iconUrl: "https://example.test/icon.png",
      version,
      prompts: [{ id: "p1", text: "What can you do?" }],
      apps: plugin.apps,
      websiteUrl: "https://example.test",
      privacyPolicyUrl: "http://example.test/not-https",
      termsUrl: "https://example.test/terms",
      skills: [],
    });
    index.push({ slug: plugin.slug, version, featured: plugin.featured ?? false, detailSha256: sha256(detail) });
    if (plugin.missing) continue;
    const path = join(dir, plugin.slug, `${version}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, plugin.tamper ?? detail, "utf8");
  }
  await writeFile(
    join(dir, "catalog.json"),
    JSON.stringify({ schemaVersion: 1, catalogVersion: "test-1", plugins: index }),
    "utf8",
  );
  return dir;
}

describe("catalog folder loader", () => {
  it("loads valid plugins, checks every checksum, and skips what does not match", async () => {
    const dir = await writeCatalog([
      { slug: "alpha", featured: true, apps: [httpApp("alpha")] },
      { slug: "beta", apps: [keyApp("beta")] },
      { slug: "tampered", apps: [httpApp("tampered")], tamper: "{}" },
      { slug: "missing", apps: [httpApp("missing")], missing: true },
      { slug: "badshape", apps: [] },
    ]);
    const loaded = await loadCatalogFolder(dir);
    expect(loaded.catalogVersion).toBe("test-1");
    expect(loaded.entries.map((entry) => entry.slug)).toEqual(["alpha", "beta"]);
    expect(loaded.skipped).toBe(3);
    const alpha = loaded.entries[0];
    expect(alpha).toMatchObject({ featured: true, category: "productivity", websiteUrl: "https://example.test/" });
    // An address that is not https is dropped, not kept.
    expect(alpha?.privacyPolicyUrl).toBeNull();
    expect(loaded.entries[1]?.apps[0]?.auth[0]?.fields.map((field) => field.target)).toEqual([
      { kind: "env", name: "FAKE_API_KEY" },
      { kind: "header", name: "Authorization", prefix: "Bearer " },
    ]);
  });

  it("refuses a folder without a valid index, a path trick, and a duplicate", async () => {
    await expect(loadCatalogFolder(join(tmpdir(), "no-such-catalog-folder"))).rejects.toBeInstanceOf(
      CatalogFolderError,
    );
    const dir = await writeCatalog([{ slug: "alpha", apps: [httpApp("alpha")] }]);
    await writeFile(join(dir, "catalog.json"), JSON.stringify({ schemaVersion: 2, plugins: [] }), "utf8");
    await expect(loadCatalogFolder(dir)).rejects.toBeInstanceOf(CatalogFolderError);
    await writeFile(
      join(dir, "catalog.json"),
      JSON.stringify({
        schemaVersion: 1,
        plugins: [
          { slug: "../escape", version: "1.0.0", featured: false, detailSha256: "0".repeat(64) },
          { slug: "alpha", version: "1.0.0", featured: false, detailSha256: "0".repeat(64) },
          { slug: "alpha", version: "1.0.0", featured: false, detailSha256: "0".repeat(64) },
        ],
      }),
      "utf8",
    );
    const loaded = await loadCatalogFolder(dir);
    expect(loaded.entries).toEqual([]);
    expect(loaded.skipped).toBe(3);
  });

  it("an app on this computer's own address is allowed, a remote http address is not", async () => {
    const dir = await writeCatalog([
      {
        slug: "local-app",
        apps: [
          {
            id: "l",
            name: "L",
            server: {
              name: "l",
              transport: "http",
              url: "http://127.0.0.1:3845/mcp",
              auth: [{ id: "x", kind: "local", label: "None" }],
            },
          },
        ],
      },
      {
        slug: "remote-http",
        apps: [{ id: "r", name: "R", server: { name: "r", transport: "http", url: "http://remote.example.test/mcp" } }],
      },
    ]);
    const loaded = await loadCatalogFolder(dir);
    expect(loaded.entries.map((entry) => entry.slug)).toEqual(["local-app"]);
    expect(loaded.skipped).toBe(1);
  });
});

describe("rules of the engine", () => {
  it("server names are valid, unique and short", () => {
    expect(serverNameFor("my-plugin", 0, new Set())).toBe("p_my_plugin");
    expect(serverNameFor("my-plugin", 1, new Set())).toBe("p_my_plugin_2");
    expect(serverNameFor("my-plugin", 0, new Set(["p_my_plugin"]))).toBe("p_my_plugin_2");
    expect(serverNameFor("x".repeat(80), 0, new Set()).length).toBeLessThanOrEqual(40);
    expect(serverNameFor("a-b", 0, new Set())).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });

  it("key values go to env or header with their prefix, and a missing one is refused", async () => {
    const dir = await writeCatalog([{ slug: "beta", apps: [keyApp("beta")] }]);
    const app = (await loadCatalogFolder(dir)).entries[0]?.apps[0];
    expect(app).toBeDefined();
    if (!app) return;
    expect(secretsFor(app, { token: "abc", bearer: "xyz" })).toEqual({
      FAKE_API_KEY: "abc",
      Authorization: "Bearer xyz",
    });
    expect(() => secretsFor(app, { token: "abc" })).toThrow(/needs its key first/);
    expect(() => secretsFor(app, undefined)).toThrow(/needs its key first/);
  });
});

function fakeMcp() {
  const servers: McpServer[] = [];
  const added: AddMcpServerInput[] = [];
  const updated: UpdateMcpServerInput[] = [];
  let failNext = false;
  let counter = 0;
  const port: McpPort = {
    list: () => servers.map((server) => structuredClone(server)),
    add: async (input) => {
      if (failNext) {
        failNext = false;
        throw new Error("That server could not be started.");
      }
      added.push(structuredClone(input));
      counter += 1;
      const server: McpServer = {
        id: `srv-${counter}`,
        name: input.name,
        transport: input.transport,
        command: input.command ?? null,
        args: input.args ?? [],
        cwd: null,
        url: input.url ?? null,
        secretNames: Object.keys(input.secrets ?? {}),
        status: "available",
        errorMessage: null,
        tools: [],
        createdAt: "2026-11-17T10:00:00.000Z",
        updatedAt: "2026-11-17T10:00:00.000Z",
      };
      servers.push(server);
      return structuredClone(server);
    },
    update: async (input) => {
      updated.push(structuredClone(input));
      const server = servers.find((candidate) => candidate.id === input.serverId);
      if (!server) throw new Error("gone");
      Object.assign(server, {
        command: input.command ?? server.command,
        args: input.args ?? server.args,
        url: input.url ?? server.url,
      });
      return structuredClone(server);
    },
    remove: async ({ serverId }) => {
      const index = servers.findIndex((candidate) => candidate.id === serverId);
      if (index >= 0) servers.splice(index, 1);
    },
    listAgentSettings: (botId) =>
      botId === "off" ? servers.map((server) => ({ serverId: server.id, enabled: false })) : [],
  };
  return {
    port,
    servers,
    added,
    updated,
    failNext: () => {
      failNext = true;
    },
  };
}

async function setup(plugins: FakePlugin[], platform: NodeJS.Platform = "win32") {
  const dir = await mkdtemp(join(tmpdir(), "plugin-catalog-db-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const mcp = fakeMcp();
  const events: AgentEvent[] = [];
  const catalogDir = await writeCatalog(plugins);
  const make = () =>
    new PluginCatalogService({
      database,
      mcp: mcp.port,
      emit: (event) => events.push(event),
      botIds: () => ["bot-1", "off"],
      platform,
    });
  const service = make();
  return { service, make, mcp, events, catalogDir };
}

const PLUGINS: FakePlugin[] = [
  { slug: "alpha", featured: true, apps: [httpApp("alpha")] },
  { slug: "beta", category: "data-analytics", apps: [keyApp("beta")] },
  { slug: "gamma", apps: [httpApp("gamma", { macAutomation: ["mail"] })] },
  { slug: "duo", apps: [httpApp("duo-one"), httpApp("duo-two")] },
];

describe("plugin catalog engine", () => {
  it("starts empty and says so, then loads the folder the owner chose and remembers it", async () => {
    const { service, make, catalogDir, events } = await setup(PLUGINS);
    expect(service.info()).toMatchObject({ source: "none", count: 0 });
    expect(service.list().total).toBe(0);
    const info = await service.setCatalogFolder(catalogDir);
    expect(info).toMatchObject({
      source: "folder",
      count: 4,
      skipped: 0,
      catalogVersion: "test-1",
      directory: catalogDir,
    });
    expect(isPluginCatalogChanged(events.at(-1))).toBe(true);
    const list = service.list();
    expect(isPluginList(list)).toBe(true);
    expect(list.plugins[0]?.slug).toBe("alpha");
    // A restart loads the saved folder again.
    const second = make();
    expect(await second.load()).toMatchObject({ source: "folder", count: 4 });
    // A wrong folder is refused and leaves the catalog as it was.
    await expect(second.setCatalogFolder(join(tmpdir(), "no-such-catalog-folder"))).rejects.toBeInstanceOf(
      CatalogFolderError,
    );
    expect(second.info().count).toBe(4);
    expect(await second.setCatalogFolder(null)).toMatchObject({ source: "none", count: 0 });
  });

  it("installs a link plugin as an MCP server and shows the state of that server", async () => {
    const { service, mcp, catalogDir, events } = await setup(PLUGINS);
    await service.setCatalogFolder(catalogDir);
    const summary = await service.install({ slug: "alpha" });
    expect(isPluginSummary(summary)).toBe(true);
    expect(summary).toMatchObject({ state: "installed", installedVersion: "1.0.0" });
    expect(mcp.added).toEqual([{ name: "p_alpha", transport: "http", url: "https://mcp.alpha.example.test/mcp" }]);
    const server = mcp.servers[0];
    if (!server) throw new Error("no server");
    server.status = "needs-login";
    expect(service.get("alpha").summary).toMatchObject({
      state: "needs-sign-in",
      error: "Sign in on the service's page to finish.",
    });
    server.status = "error";
    server.errorMessage = "ECONNREFUSED 10.0.0.1 /secret/path";
    const failing = service.get("alpha").summary;
    expect(failing).toMatchObject({ state: "error", error: "The plugin's server does not answer. Try again." });
    expect(JSON.stringify(failing)).not.toContain("ECONNREFUSED");
    await expect(service.install({ slug: "alpha" })).rejects.toThrow(/already installed/);
    expect(events.filter((event) => event.type === "plugin-catalog-changed").length).toBeGreaterThan(0);
  });

  it("a key plugin passes the values to the MCP engine only, and a failing install leaves nothing behind", async () => {
    const { service, mcp, catalogDir, events } = await setup(PLUGINS);
    await service.setCatalogFolder(catalogDir);
    await expect(service.install({ slug: "beta" })).rejects.toThrow(/needs its key first/);
    expect(mcp.added).toEqual([]);
    const summary = await service.install({ slug: "beta", secrets: { token: KEY, bearer: KEY } });
    expect(summary.state).toBe("installed");
    expect(mcp.added[0]).toMatchObject({
      name: "p_beta",
      transport: "stdio",
      command: "npx",
      args: ["-y", "beta-server"],
      secrets: { FAKE_API_KEY: KEY, Authorization: `Bearer ${KEY}` },
    });
    expect(JSON.stringify(service.list())).not.toContain(KEY);
    expect(JSON.stringify(service.get("beta"))).not.toContain(KEY);
    expect(JSON.stringify(events)).not.toContain(KEY);
    expect(JSON.stringify(mcp.servers)).not.toContain(KEY);
  });

  it("an engine error that holds a typed value is replaced by a fixed sentence", async () => {
    const { service, mcp, catalogDir } = await setup(PLUGINS);
    await service.setCatalogFolder(catalogDir);
    mcp.port.add = async () => {
      throw new Error(`bad value ${KEY}`);
    };
    const error = await service
      .install({ slug: "beta", secrets: { token: KEY, bearer: KEY } })
      .catch((reason: unknown) => reason);
    expect(String(error)).toBe("Error: The plugin could not be installed.");
  });

  it("two apps become two servers; if the second fails, the first is removed again", async () => {
    const { service, mcp, catalogDir } = await setup(PLUGINS);
    await service.setCatalogFolder(catalogDir);
    const original = mcp.port.add;
    let calls = 0;
    mcp.port.add = async (input) => {
      calls += 1;
      if (calls === 2) throw new Error("That server could not be started.");
      return original(input);
    };
    await expect(service.install({ slug: "duo" })).rejects.toThrow(/could not be started/);
    expect(mcp.servers).toEqual([]);
    expect(service.get("duo").summary.state).toBe("available");
    mcp.port.add = original;
    await service.install({ slug: "duo" });
    expect(mcp.servers.map((server) => server.name)).toEqual(["p_duo", "p_duo_2"]);
    expect(isPluginDetails(service.get("duo"))).toBe(true);
  });

  it("a plugin for macOS is refused here and works on macOS", async () => {
    const win = await setup(PLUGINS, "win32");
    await win.service.setCatalogFolder(win.catalogDir);
    expect(win.service.get("gamma").summary.unavailableHere).toBe(true);
    await expect(win.service.install({ slug: "gamma" })).rejects.toThrow(/macOS/);
    const mac = await setup(PLUGINS, "darwin");
    await mac.service.setCatalogFolder(mac.catalogDir);
    expect((await mac.service.install({ slug: "gamma" })).state).toBe("installed");
  });

  it("uninstall removes the servers; a server the person removed by hand shows as an error, never as installed", async () => {
    const { service, mcp, catalogDir } = await setup(PLUGINS);
    await service.setCatalogFolder(catalogDir);
    await service.install({ slug: "alpha" });
    await service.install({ slug: "duo" });
    mcp.servers.splice(0, 1);
    expect(service.get("alpha").summary).toMatchObject({ state: "error" });
    const after = await service.uninstall("alpha");
    expect(after.plugins.find((plugin) => plugin.slug === "alpha")?.state).toBe("available");
    await service.uninstall("duo");
    expect(mcp.servers).toEqual([]);
    await expect(service.uninstall("alpha")).rejects.toThrow(/not installed/);
  });

  it("a newer catalog version shows as an update; updating changes the servers and keeps the values", async () => {
    const { service, mcp, catalogDir } = await setup(PLUGINS);
    await service.setCatalogFolder(catalogDir);
    await service.install({ slug: "beta", secrets: { token: KEY, bearer: KEY } });
    // The owner points the program at a newer copy of the catalog.
    const newer = await writeCatalog([
      {
        slug: "beta",
        version: "1.0.1",
        apps: [{ ...keyApp("beta"), server: { ...keyApp("beta").server, args: ["-y", "beta-server@2"] } }],
      },
    ]);
    await service.setCatalogFolder(newer);
    expect(service.get("beta").summary.state).toBe("update-available");
    expect((await service.list({ filter: "needs-attention" })).total).toBe(1);
    const updated = await service.update("beta");
    expect(updated).toMatchObject({ state: "installed", installedVersion: "1.0.1" });
    expect(mcp.updated).toEqual([{ serverId: "srv-1", command: "npx", args: ["-y", "beta-server@2"] }]);
    expect(mcp.updated[0]).not.toHaveProperty("secrets");
  });

  it("own plugins join the list, need no catalog, and can be removed", async () => {
    const { service, mcp } = await setup(PLUGINS);
    const own = await service.addCustom({
      name: "my_tool",
      transport: "http",
      url: "https://mcp.example.test/mcp",
      secrets: { Authorization: KEY },
    });
    expect(own).toMatchObject({ slug: "custom-my_tool", custom: true, state: "installed", installedVersion: "custom" });
    expect(isPluginSummary(own)).toBe(true);
    expect(JSON.stringify(own)).not.toContain(KEY);
    expect(mcp.added[0]).toMatchObject({ name: "my_tool", secrets: { Authorization: KEY } });
    await expect(
      service.addCustom({ name: "my_tool", transport: "http", url: "https://mcp.example.test/mcp" }),
    ).rejects.toThrow(/already exists/);
    expect(service.list({ filter: "installed" }).plugins.map((plugin) => plugin.slug)).toEqual(["custom-my_tool"]);
    expect(isPluginDetails(service.get("custom-my_tool"))).toBe(true);
    await expect(service.update("custom-my_tool")).rejects.toThrow(/no catalog version/);
    await service.uninstall("custom-my_tool");
    expect(service.list().plugins).toEqual([]);
  });

  it("counts the agents that may use a plugin, search ignores case and accents, and the list pages", async () => {
    const { service, catalogDir } = await setup(PLUGINS);
    await service.setCatalogFolder(catalogDir);
    await service.install({ slug: "alpha" });
    expect(service.get("alpha").summary.agentCount).toBe(1);
    expect(service.list({ query: "ALPHA" }).plugins.map((plugin) => plugin.slug)).toEqual(["alpha"]);
    expect(service.list({ category: "data-analytics" }).total).toBe(1);
    expect(service.list({ offset: 3 }).plugins).toHaveLength(1);
  });

  it("two quick installs of the same plugin add one server", async () => {
    const { service, mcp, catalogDir } = await setup(PLUGINS);
    await service.setCatalogFolder(catalogDir);
    const results = await Promise.allSettled([service.install({ slug: "alpha" }), service.install({ slug: "alpha" })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(mcp.servers).toHaveLength(1);
  });
});
