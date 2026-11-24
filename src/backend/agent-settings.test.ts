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
    expect(initial.tabs.map((tab): string => tab.id)).not.toContain("voice");

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

  it("pins pages to the rail: the five main pages by default (like OpenBot), kept in the chosen order, replaced as a whole, survives a restart", async () => {
    const { dir, database, service, events } = await open();
    expect(service.appSettings().navigation).toEqual({
      pinnedPageIds: ["agents", "workflows", "tasks", "usage", "library"],
    });
    expect(APP_PAGE_IDS).toEqual(expect.arrayContaining(service.appSettings().navigation.pinnedPageIds));

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
      fontWeight: "normal",
      sendShortcut: "enter",
      chatAccent: "blue",
      agentSteps: "collapse",
      unreadFirst: false,
    });

    const changed = await service.updateAppSettings({ appearance: { uiScale: 125, sendShortcut: "mod-enter" } });
    expect(changed.appearance).toMatchObject({
      uiScale: 125,
      sendShortcut: "mod-enter",
      font: "inter",
      fontWeight: "normal",
      chatAccent: "blue",
    });
    expect(events.at(-1)).toEqual({ type: "app-settings-changed", settings: changed });
    // A save of other settings keeps the look; a second patch changes only its own fields.
    await service.updateAppSettings({ language: "pl" });
    const second = await service.updateAppSettings({ appearance: { chatAccent: "violet", unreadFirst: true } });
    expect(second.appearance).toEqual({
      uiScale: 125,
      font: "inter",
      fontWeight: "normal",
      sendShortcut: "mod-enter",
      chatAccent: "violet",
      agentSteps: "collapse",
      unreadFirst: true,
    });
    database.close();
    const reopened = await open(dir);
    expect(reopened.service.appSettings().appearance).toEqual(second.appearance);
  });

  it("keeps launch-at-login (KAPI): default off, change survives a restart", async () => {
    const { dir, database, service, events } = await open();
    expect(service.appSettings().behavior).toEqual({
      launchAtLogin: false,
      keepBackground: false,
      externalLinks: "browser",
    });
    const changed = await service.updateAppSettings({ behavior: { launchAtLogin: true } });
    expect(changed.behavior).toEqual({ launchAtLogin: true, keepBackground: false, externalLinks: "browser" });
    expect(events.at(-1)).toEqual({ type: "app-settings-changed", settings: changed });
    database.close();
    const reopened = await open(dir);
    expect(reopened.service.appSettings().behavior).toEqual({
      launchAtLogin: true,
      keepBackground: false,
      externalLinks: "browser",
    });
    // BE-W: a patch of one switch leaves the other as it was, and the change survives another restart.
    const kept = await reopened.service.updateAppSettings({ behavior: { keepBackground: true } });
    expect(kept.behavior).toEqual({ launchAtLogin: true, keepBackground: true, externalLinks: "browser" });
    reopened.database.close();
    const again = await open(dir);
    expect(again.service.appSettings().behavior).toEqual({
      launchAtLogin: true,
      keepBackground: true,
      externalLinks: "browser",
    });
    const bad = JSON.parse('{"behavior":{"keepBackground":"yes"}}');
    await expect(again.service.updateAppSettings(bad)).rejects.toThrow(/on or off/);
    expect(again.service.appSettings().behavior.keepBackground).toBe(true);
  });

  it("remembers the last workspace (BE-X): restore on by default, kept over a restart, an agent that is gone is dropped, null forgets", async () => {
    const { dir, database, service, bots, events } = await open();
    expect(service.appSettings().workspace).toEqual({ restore: true, last: null });

    const saved = await service.updateAppSettings({
      workspace: { last: { page: "agents", botId: "chief", threadId: "t1" } },
    });
    expect(saved.workspace).toEqual({ restore: true, last: { page: "agents", botId: "chief", threadId: "t1" } });
    expect(events.at(-1)).toEqual({ type: "app-settings-changed", settings: saved });
    // The switch and the place are separate: turning restore off keeps the place, a save of other settings keeps both.
    const off = await service.updateAppSettings({ workspace: { restore: false } });
    expect(off.workspace).toEqual({ restore: false, last: { page: "agents", botId: "chief", threadId: "t1" } });
    await service.updateAppSettings({ language: "pl" });
    database.close();
    const reopened = await open(dir);
    expect(reopened.service.appSettings().workspace).toEqual(off.workspace);

    // The agent is deleted: the window must not be sent to it. The page stays, the agent and its thread go.
    reopened.bots.clear();
    expect(reopened.service.appSettings().workspace).toEqual({
      restore: false,
      last: { page: "agents", botId: null, threadId: null },
    });
    await reopened.service.updateAppSettings({ workspace: { last: { page: null, botId: "chief", threadId: "t2" } } });
    expect(reopened.service.appSettings().workspace.last).toBeNull();
    expect(bots.size).toBe(1); // the first harness is untouched

    const cleared = await reopened.service.updateAppSettings({ workspace: { last: null } });
    expect(cleared.workspace.last).toBeNull();
  });

  it("remembers the place of each server apart (BE-AD): kept over a restart, the local agent check does not touch other servers, null forgets", async () => {
    const { dir, database, service } = await open();
    const far = { page: "tasks", botId: "remote-bot", threadId: "remote-thread" } as const;
    const first = await service.updateAppSettings({ workspace: { byServer: { "server-2": far } } });
    expect(first.workspace).toEqual({ restore: true, last: null, byServer: { "server-2": far } });
    // This computer's place and a server's place are separate.
    const both = await service.updateAppSettings({
      workspace: { last: { page: "agents", botId: "chief", threadId: "t1" } },
    });
    expect(both.workspace.byServer).toEqual({ "server-2": far });
    database.close();
    const reopened = await open(dir);
    // "remote-bot" is not an agent of this computer; the engine cannot know remote agents, so the place stays.
    expect(reopened.service.appSettings().workspace.byServer).toEqual({ "server-2": far });
    const forgot = await reopened.service.updateAppSettings({ workspace: { byServer: { "server-2": null } } });
    expect(forgot.workspace.byServer).toBeUndefined();
    await expect(reopened.service.updateAppSettings({ workspace: { byServer: { local: far } } })).rejects.toThrow(
      /this computer/,
    );
  });

  it("keeps where links of a conversation open (BE-X): the default browser until changed", async () => {
    const { dir, database, service } = await open();
    expect(service.appSettings().behavior.externalLinks).toBe("browser");
    const changed = await service.updateAppSettings({ behavior: { externalLinks: "app" } });
    expect(changed.behavior).toEqual({ launchAtLogin: false, keepBackground: false, externalLinks: "app" });
    database.close();
    const reopened = await open(dir);
    expect(reopened.service.appSettings().behavior.externalLinks).toBe("app");
    const bad = JSON.parse('{"behavior":{"externalLinks":"popup"}}');
    await expect(reopened.service.updateAppSettings(bad)).rejects.toThrow(/externalLinks is one of/);
    expect(reopened.service.appSettings().behavior.externalLinks).toBe("app");
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

  it("marks the tabs of the features built into the program as available on every platform", () => {
    expect(builtInTabFeatures("win32")).toEqual({ mobile: true, dock: true, island: true });
    expect(builtInTabFeatures("linux")).toEqual({ mobile: true, dock: true, island: true });
  });
});
