// @vitest-environment node
import {
  type AgentEvent,
  compareVersions,
  isPluginCatalogChanged,
  isPluginCatalogInfo,
  isPluginDetails,
  isPluginList,
  isPluginSummary,
  parseAddCustomPluginInput,
  parseInstallPluginInput,
  parseListPluginsInput,
  parsePluginSlugInput,
  parseSetPluginCatalogFolderInput,
  pluginState,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockPluginCatalog } from "./mock-plugin-catalog";

const KEY = "demo-key-value-0123456789abcdef";

const setup = () => {
  const events: AgentEvent[] = [];
  return { api: createMockPluginCatalog((event) => events.push(event)), events };
};

describe("plugin catalog contract rules (W11-KK e)", () => {
  it("versions compare by number, not by text", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9", "1.0.0")).toBe(-1);
  });

  it("the state follows the servers and the versions", () => {
    const base = { installed: true, installedVersion: "1.0.0", catalogVersion: "1.0.0" } as const;
    expect(pluginState({ ...base, installed: false, serverStatuses: [] })).toBe("available");
    expect(pluginState({ ...base, serverStatuses: ["available"] })).toBe("installed");
    expect(pluginState({ ...base, serverStatuses: ["available", "needs-login"] })).toBe("needs-sign-in");
    expect(pluginState({ ...base, serverStatuses: ["error", "needs-login"] })).toBe("error");
    expect(pluginState({ ...base, catalogVersion: "1.0.2", serverStatuses: ["available"] })).toBe("update-available");
  });

  it("requests are checked and never repeat typed values", () => {
    expect(parsePluginSlugInput({ slug: "demo-docs" })).toEqual({ slug: "demo-docs" });
    expect(parsePluginSlugInput({ slug: "custom-my_tool" })).toEqual({ slug: "custom-my_tool" });
    expect(() => parsePluginSlugInput({ slug: "../x" })).toThrow(/Choose a plugin/);
    expect(parseListPluginsInput(undefined)).toEqual({});
    expect(() => parseListPluginsInput({ category: "games" })).toThrow(/category is one of/);
    expect(() => parseInstallPluginInput({ slug: "demo-data", secrets: { "bad name": KEY } })).toThrow(
      /name that is not allowed/,
    );
    try {
      parseInstallPluginInput({ slug: "demo-data", secrets: { token: "" } });
    } catch (error) {
      expect(String(error)).not.toContain(KEY);
    }
    expect(() =>
      parseAddCustomPluginInput({ name: "Bad Name", transport: "http", url: "https://x.example.test" }),
    ).toThrow(/lowercase/);
    expect(() =>
      parseAddCustomPluginInput({ name: "tool", transport: "http", url: "http://remote.example.test" }),
    ).toThrow(/https/);
    expect(parseAddCustomPluginInput({ name: "tool", transport: "http", url: "http://127.0.0.1:8080/mcp" }).url).toBe(
      "http://127.0.0.1:8080/mcp",
    );
    expect(() => parseAddCustomPluginInput({ name: "tool", transport: "stdio" })).toThrow(/program to start/);
    expect(() => parseSetPluginCatalogFolderInput({ directory: "relative/folder" })).toThrow(/full path/);
    expect(parseSetPluginCatalogFolderInput({ directory: null })).toEqual({ directory: null });
  });
});

describe("mock plugin catalog (W11-KK e)", () => {
  it("starts with the demo catalog, valid, featured first, and nothing installed", async () => {
    const { api } = setup();
    expect(isPluginCatalogInfo(await api.info())).toBe(true);
    const list = await api.list();
    expect(isPluginList(list)).toBe(true);
    expect(list.total).toBe(8);
    expect(list.plugins.slice(0, 3).every((plugin) => plugin.featured)).toBe(true);
    expect(list.plugins.every((plugin) => plugin.state === "available")).toBe(true);
  });

  it("searches without caring for case, and filters by category", async () => {
    const { api } = setup();
    expect((await api.list({ query: "DEMO DOC" })).plugins.map((plugin) => plugin.slug)).toEqual(["demo-docs"]);
    expect((await api.list({ category: "productivity" })).total).toBe(2);
    expect((await api.list({ query: "nothing like this" })).total).toBe(0);
  });

  it("a key plugin needs its key, and the key never comes back", async () => {
    const { api, events } = setup();
    await expect(api.install({ slug: "demo-data" })).rejects.toThrow(/needs its key/);
    const installed = await api.install({ slug: "demo-data", secrets: { token: KEY } });
    expect(isPluginSummary(installed)).toBe(true);
    expect(installed).toMatchObject({ state: "installed", installedVersion: "1.0.0" });
    expect(JSON.stringify(await api.list())).not.toContain(KEY);
    expect(JSON.stringify(await api.get({ slug: "demo-data" }))).not.toContain(KEY);
    expect(JSON.stringify(events)).not.toContain(KEY);
    expect(isPluginCatalogChanged(events.at(-1))).toBe(true);
  });

  it("a link plugin waits for the sign-in; a failing server is shown with a fixed sentence", async () => {
    const { api } = setup();
    expect(await api.install({ slug: "demo-docs" })).toMatchObject({ state: "needs-sign-in" });
    expect((await api.list({ filter: "needs-attention" })).total).toBe(1);
    api.simulate.signedIn("demo-docs");
    expect((await api.get({ slug: "demo-docs" })).summary.state).toBe("installed");
    api.simulate.serverFailed("demo-docs");
    const failed = (await api.get({ slug: "demo-docs" })).summary;
    expect(failed).toMatchObject({ state: "error", error: "The plugin's server does not answer. Try again." });
    expect(isPluginSummary(failed)).toBe(true);
  });

  it("a plugin for another system cannot be installed here", async () => {
    const { api } = setup();
    const details = await api.get({ slug: "demo-mail" });
    expect(isPluginDetails(details)).toBe(true);
    expect(details.summary.unavailableHere).toBe(true);
    await expect(api.install({ slug: "demo-mail" })).rejects.toThrow(/macOS/);
  });

  it("a newer catalog version shows as an update, and updating keeps it installed", async () => {
    const { api } = setup();
    await api.install({ slug: "demo-code" });
    api.simulate.newVersion("demo-code", "1.2.0");
    expect((await api.get({ slug: "demo-code" })).summary.state).toBe("update-available");
    const updated = await api.update({ slug: "demo-code" });
    expect(updated).toMatchObject({ state: "installed", installedVersion: "1.2.0" });
  });

  it("an own plugin joins the same list and can be removed; uninstalling leaves the catalog entry", async () => {
    const { api } = setup();
    const own = await api.addCustom({
      name: "my_tool",
      transport: "http",
      url: "https://mcp.example.test/mcp",
      secrets: { Authorization: KEY },
    });
    expect(own).toMatchObject({ slug: "custom-my_tool", custom: true, state: "installed" });
    expect(JSON.stringify(own)).not.toContain(KEY);
    await expect(
      api.addCustom({ name: "my_tool", transport: "http", url: "https://mcp.example.test/mcp" }),
    ).rejects.toThrow(/already exists/);
    expect((await api.list({ filter: "installed" })).plugins.map((plugin) => plugin.slug)).toEqual(["custom-my_tool"]);
    await api.install({ slug: "demo-code" });
    const after = await api.uninstall({ slug: "demo-code" });
    expect(after.plugins.find((plugin) => plugin.slug === "demo-code")?.state).toBe("available");
    const withoutOwn = await api.uninstall({ slug: "custom-my_tool" });
    expect(withoutOwn.plugins.some((plugin) => plugin.slug === "custom-my_tool")).toBe(false);
    await expect(api.uninstall({ slug: "demo-code" })).rejects.toThrow(/not installed/);
  });

  it("choosing a folder changes the source in the info and forgetting it goes back", async () => {
    const { api, events } = setup();
    const loaded = await api.setCatalogFolder({ directory: "C:\\catalog-demo" });
    expect(loaded).toMatchObject({ source: "folder", directory: "C:\\catalog-demo" });
    expect(isPluginCatalogInfo(loaded)).toBe(true);
    expect(isPluginCatalogChanged(events.at(-1))).toBe(true);
    expect((await api.setCatalogFolder({ directory: null })).source).toBe("demo");
  });

  it("an installed plugin names its MCP servers (for the sign-in button), an available one has none", async () => {
    const { api } = setup();
    expect((await api.get({ slug: "demo-docs" })).summary.serverIds).toEqual([]);
    const installed = await api.install({ slug: "demo-docs" });
    expect(installed.serverIds).toEqual(["srv-demo-docs"]);
    expect(isPluginSummary(installed)).toBe(true);
    expect(isPluginSummary({ ...installed, serverIds: [1] })).toBe(false);
    await api.uninstall({ slug: "demo-docs" });
    expect((await api.get({ slug: "demo-docs" })).summary.serverIds).toEqual([]);
  });

  it("choosing the catalog folder opens the dialog for the person: a chosen folder loads, a closed dialog answers null", async () => {
    const { api, events } = setup();
    api.simulate.closeNextFolderDialog();
    expect(await api.chooseCatalogFolder()).toBeNull();
    const info = await api.chooseCatalogFolder();
    expect(info).toMatchObject({ source: "folder" });
    expect(info && isPluginCatalogInfo(info)).toBe(true);
    expect(isPluginCatalogChanged(events.at(-1))).toBe(true);
  });
});
