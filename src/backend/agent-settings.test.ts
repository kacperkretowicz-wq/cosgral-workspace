// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, APP_PAGE_IDS, type BotSummary, type UpdateBotInput } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSettingsService, builtInTabFeatures } from "./agent-settings";
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

  it("pins pages to the rail: every page pinned by default, kept in the chosen order, replaced as a whole, survives a restart", async () => {
    const { dir, database, service, events } = await open();
    expect(service.appSettings().navigation).toEqual({ pinnedPageIds: [...APP_PAGE_IDS] });

    const pinned = await service.updateAppSettings({ navigation: { pinnedPageIds: ["library", "agents", "phone"] } });
    expect(pinned.navigation).toEqual({ pinnedPageIds: ["library", "agents", "phone"] });
    expect(events.at(-1)).toEqual({ type: "app-settings-changed", settings: pinned });
    // A save without navigation keeps the pins; the language and notifications stay as they were.
    const kept = await service.updateAppSettings({ language: "pl" });
    expect(kept.navigation.pinnedPageIds).toEqual(["library", "agents", "phone"]);

    database.close();
    const reopened = await open(dir);
    expect(reopened.service.appSettings().navigation.pinnedPageIds).toEqual(["library", "agents", "phone"]);
    const cleared = await reopened.service.updateAppSettings({ navigation: { pinnedPageIds: [] } });
    expect(cleared.navigation.pinnedPageIds).toEqual([]);
  });

  it("refuses unknown and repeated page ids and changes nothing", async () => {
    const { service, events } = await open();
    await service.updateAppSettings({ navigation: { pinnedPageIds: ["tasks"] } });
    const before = events.length;
    // What a window could send: JSON, so the unknown id is not a type error here.
    const unknownPage = JSON.parse('{"navigation":{"pinnedPageIds":["tasks","nope"]}}');
    await expect(service.updateAppSettings(unknownPage)).rejects.toThrow(/known pages/);
    await expect(service.updateAppSettings({ navigation: { pinnedPageIds: ["tasks", "tasks"] } })).rejects.toThrow(
      /at most once/,
    );
    expect(service.appSettings().navigation.pinnedPageIds).toEqual(["tasks"]);
    expect(events).toHaveLength(before);
  });

  it("keeps the look and the send key (BE-U): defaults of today, changes of single fields, survives a restart", async () => {
    const { dir, database, service, events } = await open();
    expect(service.appSettings().appearance).toEqual({
      uiScale: 100,
      font: "inter",
      sendShortcut: "enter",
      chatAccent: "blue",
      agentSteps: "show",
      unreadFirst: false,
    });

    const changed = await service.updateAppSettings({ appearance: { uiScale: 125, sendShortcut: "mod-enter" } });
    expect(changed.appearance).toMatchObject({
      uiScale: 125,
      sendShortcut: "mod-enter",
      font: "inter",
      chatAccent: "blue",
    });
    expect(events.at(-1)).toEqual({ type: "app-settings-changed", settings: changed });
    // A save of other settings keeps the look; a second patch changes only its own fields.
    await service.updateAppSettings({ language: "pl" });
    const second = await service.updateAppSettings({ appearance: { chatAccent: "violet", unreadFirst: true } });
    expect(second.appearance).toEqual({
      uiScale: 125,
      font: "inter",
      sendShortcut: "mod-enter",
      chatAccent: "violet",
      agentSteps: "show",
      unreadFirst: true,
    });
    database.close();
    const reopened = await open(dir);
    expect(reopened.service.appSettings().appearance).toEqual(second.appearance);
  });

  it("keeps launch-at-login (KAPI): default off, change survives a restart", async () => {
    const { dir, database, service, events } = await open();
    expect(service.appSettings().behavior).toEqual({ launchAtLogin: false, keepBackground: false });
    const changed = await service.updateAppSettings({ behavior: { launchAtLogin: true } });
    expect(changed.behavior).toEqual({ launchAtLogin: true, keepBackground: false });
    expect(events.at(-1)).toEqual({ type: "app-settings-changed", settings: changed });
    database.close();
    const reopened = await open(dir);
    expect(reopened.service.appSettings().behavior).toEqual({ launchAtLogin: true, keepBackground: false });
    // BE-W: a patch of one switch leaves the other as it was, and the change survives another restart.
    const kept = await reopened.service.updateAppSettings({ behavior: { keepBackground: true } });
    expect(kept.behavior).toEqual({ launchAtLogin: true, keepBackground: true });
    reopened.database.close();
    const again = await open(dir);
    expect(again.service.appSettings().behavior).toEqual({ launchAtLogin: true, keepBackground: true });
    const bad = JSON.parse('{"behavior":{"keepBackground":"yes"}}');
    await expect(again.service.updateAppSettings(bad)).rejects.toThrow(/on or off/);
    expect(again.service.appSettings().behavior.keepBackground).toBe(true);
  });

  it("refuses a look value outside its list, an unknown field, and changes nothing", async () => {
    const { service, events } = await open();
    await service.updateAppSettings({ appearance: { font: "mono" } });
    const before = events.length;
    // What a window could send: JSON, so the wrong values are not type errors here.
    const badScale = JSON.parse('{"appearance":{"uiScale":150}}');
    const badFont = JSON.parse('{"appearance":{"font":"Comic Sans"}}');
    const unknownField = JSON.parse('{"appearance":{"color":"#ff0000"}}');
    const badFlag = JSON.parse('{"appearance":{"unreadFirst":"yes"}}');
    await expect(service.updateAppSettings(badScale)).rejects.toThrow(/uiScale is one of/);
    await expect(service.updateAppSettings(badFont)).rejects.toThrow(/font is one of/);
    await expect(service.updateAppSettings(unknownField)).rejects.toThrow(/Unknown appearance setting/);
    await expect(service.updateAppSettings(badFlag)).rejects.toThrow(/on or off/);
    // A good field next to a bad one is not saved either: the whole change is refused.
    const mixed = JSON.parse('{"appearance":{"chatAccent":"green","uiScale":7}}');
    await expect(service.updateAppSettings(mixed)).rejects.toThrow(/uiScale/);
    expect(service.appSettings().appearance).toMatchObject({ font: "mono", uiScale: 100, chatAccent: "blue" });
    expect(events).toHaveLength(before);
  });

  it("marks the tabs of the features built into the program as available (voice needs Windows speech)", () => {
    expect(builtInTabFeatures("win32")).toEqual({ voice: true, mobile: true, dock: true, island: true });
    expect(builtInTabFeatures("linux")).toEqual({ voice: false, mobile: true, dock: true, island: true });
  });
});
