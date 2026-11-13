// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BotSummary, UpdateBotInput } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSettingsService } from "./agent-settings";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function botFixture(overrides: Partial<BotSummary> = {}): BotSummary {
  return {
    id: "chief",
    name: "Chief",
    role: "Lead",
    description: "",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: "C:\\work\\chief",
    preview: "No messages yet",
    updatedAt: null,
    avatarSeed: "chief",
    avatarHue: null,
    avatarUrl: null,
    ...overrides,
  };
}

async function open(root?: string) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), "agent-settings-")));
  if (!root) roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const bots = new Map([["chief", botFixture()]]);
  const updates: UpdateBotInput[] = [];
  const events: AgentEvent[] = [];
  const availability = { computer: false };
  const service = new AgentSettingsService({
    database,
    bot: (botId) => bots.get(botId) ?? null,
    models: () => [],
    updateBot: async (input) => {
      updates.push(input);
      const next = { ...(bots.get(input.botId) ?? botFixture()), ...input };
      bots.set(input.botId, next);
      return next;
    },
    memory: (botId) => ({
      botId,
      maxMemories: 512,
      customLimit: false,
      essentialCount: 1,
      searchableCount: 2,
      essentialInPrompt: 1,
      essentialPromptBytes: 40,
    }),
    skills: async () => [{ skillId: "s1", name: "weekly-report", installedVersion: 2, updateAvailable: false }],
    mcp: (botId) => [{ botId, serverId: "m1", enabled: false }],
    availability: () => availability,
    emit: (event) => events.push(event),
  });
  return { dir, database, service, bots, updates, events, availability };
}

const TOOLS = [
  { type: "namespace", name: "openbot_browser", tools: [{ name: "open" }] },
  {
    type: "namespace",
    name: "openbot",
    tools: [{ name: "send_message" }, { name: "ask_user" }, { name: "remember" }, { name: "search_memories" }],
  },
  { type: "namespace", name: "cosgral_cards", tools: [{ name: "confirm" }] },
  { type: "namespace", name: "cosgral_vault", tools: [{ name: "list_vault_items" }] },
  { type: "namespace", name: "cosgral_computer", tools: [{ name: "click" }] },
  { type: "namespace", name: "mcp_github", tools: [{ name: "search" }] },
];

describe("AgentSettingsService", () => {
  it("keeps every tool group on until the person switches one off, also after a restart", async () => {
    const { dir, database, service, events } = await open();
    expect(service.toolSwitches("chief")).toEqual({});
    expect(service.filterTools("chief", TOOLS).map((tool) => tool.name)).toEqual(TOOLS.map((tool) => tool.name));

    const before = service.signature("chief");
    await service.update({ botId: "chief", tools: { browser: false, vault: false, messaging: false, memory: false } });
    expect(service.signature("chief")).not.toBe(before);
    expect(events).toContainEqual({ type: "agent-settings-changed", botId: "chief" });

    const filtered = service.filterTools("chief", TOOLS);
    expect(filtered.map((tool) => tool.name)).toEqual(["openbot", "cosgral_cards", "cosgral_computer", "mcp_github"]);
    expect(filtered[0]?.tools?.map((tool) => tool.name)).toEqual(["ask_user"]);

    database.close();
    const reopened = await open(dir);
    expect(reopened.service.toolSwitches("chief")).toEqual({
      browser: false,
      vault: false,
      messaging: false,
      memory: false,
    });
  });

  it("refuses calls of switched-off groups and never blocks questions and cards", async () => {
    const { service } = await open();
    await service.update({ botId: "chief", tools: { browser: false, messaging: false, memory: false } });
    expect(service.blockedTool("chief", { namespace: "openbot_browser", tool: "open" })).toMatch(
      /switched off the browser/i,
    );
    expect(service.blockedTool("chief", { namespace: "openbot", tool: "send_message" })).toMatch(/messaging/i);
    expect(service.blockedTool("chief", { namespace: "openbot", tool: "remember" })).toMatch(/memory/i);
    expect(service.blockedTool("chief", { namespace: "openbot", tool: "ask_user" })).toBeNull();
    expect(service.blockedTool("chief", { namespace: "cosgral_cards", tool: "confirm" })).toBeNull();
    expect(service.blockedTool("chief", { namespace: "cosgral_vault", tool: "list_vault_items" })).toBeNull();
    expect(service.blockedTool(undefined, { namespace: "openbot_browser", tool: "open" })).toBeNull();
  });

  it("tells the agent which tools are off and which language the person chose", async () => {
    const { service } = await open();
    expect(service.instructions("chief")).toBe("");
    await service.update({ botId: "chief", tools: { browser: false, computer: false } });
    await service.updateAppSettings({ language: "pl" });
    const text = service.instructions("chief");
    expect(text).toMatch(/switched off these tools for you: browser, computer use/i);
    expect(text).toMatch(/Polish/);
  });

  it("reads the full settings of an agent in one call", async () => {
    const { service, availability } = await open();
    availability.computer = true;
    await service.update({ botId: "chief", tools: { eyes: false } });
    const settings = await service.get("chief");
    expect(settings.provider).toBe("codex");
    expect(settings.tools.find((tool) => tool.group === "eyes")).toEqual({
      group: "eyes",
      enabled: false,
      available: true,
    });
    expect(settings.tools.find((tool) => tool.group === "computer")).toMatchObject({ enabled: true, available: true });
    expect(settings.memory).toMatchObject({ essentialCount: 1 });
    expect(settings.skills).toEqual([
      { skillId: "s1", name: "weekly-report", installedVersion: 2, updateAvailable: false },
    ]);
    expect(settings.mcp).toEqual([{ botId: "chief", serverId: "m1", enabled: false }]);
    await expect(service.get("missing")).rejects.toThrow(/no longer exists/);
  });

  it("saves profile, model and tools with one update and refuses unknown agents", async () => {
    const { service, updates } = await open();
    const settings = await service.update({
      botId: "chief",
      name: "Boss",
      model: "claude-opus-5",
      reasoningEffort: "high",
      notifications: false,
      tools: { routines: false },
    });
    expect(updates).toEqual([
      { botId: "chief", name: "Boss", model: "claude-opus-5", reasoningEffort: "high", notifications: false },
    ]);
    expect(settings).toMatchObject({ provider: "claude", bot: { name: "Boss" } });
    expect(settings.tools.find((tool) => tool.group === "routines")?.enabled).toBe(false);
    await service.update({ botId: "chief", tools: { routines: true } });
    expect(service.toolSwitches("chief")).toEqual({});
    expect(updates).toHaveLength(1);
    await expect(service.update({ botId: "missing", tools: {} })).rejects.toThrow(/no longer exists/);
  });

  it("forgets the switches of a deleted agent", async () => {
    const { service } = await open();
    await service.update({ botId: "chief", tools: { vault: false } });
    service.deleteAgent("chief");
    expect(service.toolSwitches("chief")).toEqual({});
  });

  it("keeps app settings: language, notification matrix and tabs", async () => {
    const { dir, database, service, availability, events } = await open();
    const initial = service.appSettings();
    expect(initial).toMatchObject({ language: "en", languageChosen: false });
    expect(initial.notifications.matrix["needs-input"]).toEqual({ desktop: true, sound: true });
    expect(initial.tabs.find((tab) => tab.id === "computer-use")?.available).toBe(false);
    expect(initial.tabs.find((tab) => tab.id === "voice")?.available).toBe(false);

    const updated = await service.updateAppSettings({
      language: "pl",
      notifications: { matrix: { finished: { desktop: false } }, onlyWhenUnfocused: false },
    });
    expect(updated).toMatchObject({ language: "pl", languageChosen: true });
    expect(updated.notifications.matrix.finished).toEqual({ desktop: false, sound: false });
    expect(updated.notifications.matrix["needs-input"]).toEqual({ desktop: true, sound: true });
    expect(updated.notifications.onlyWhenUnfocused).toBe(false);
    expect(events.at(-1)).toEqual({ type: "app-settings-changed", settings: updated });

    availability.computer = true;
    expect(service.appSettings().tabs.find((tab) => tab.id === "computer-use")?.available).toBe(true);
    database.close();
    const reopened = await open(dir);
    expect(reopened.service.appSettings()).toMatchObject({ language: "pl", languageChosen: true });
    expect(reopened.service.appSettings().notifications.matrix.finished.desktop).toBe(false);
  });
});
