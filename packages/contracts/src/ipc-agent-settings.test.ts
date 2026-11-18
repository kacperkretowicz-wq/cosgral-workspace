import { describe, expect, it } from "vitest";
import {
  AGENT_TOOL_GROUPS,
  APP_AGENT_STEPS,
  APP_CHAT_ACCENTS,
  APP_FONTS,
  APP_SEND_SHORTCUTS,
  APP_UI_SCALES,
  appearanceDomTokens,
  applyWorkspacePatch,
  DEFAULT_APP_APPEARANCE,
  DEFAULT_APP_BEHAVIOR,
  DEFAULT_APP_WORKSPACE,
  defaultNotificationPreferences,
  IPC_CHANNELS,
  isAgentEvent,
  isAgentSettings,
  isAgentTemplate,
  isAppAppearance,
  isAppBehavior,
  isAppSettings,
  isAppWorkspace,
  isOnboardingState,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  normalizeAppAppearance,
  normalizeAppBehavior,
  normalizeAppWorkspace,
  parseAppearancePatch,
  parseBehaviorPatch,
  parseWorkspacePatch,
  SETTINGS_TABS,
} from "./ipc";

const bot = {
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
};
const template = {
  id: "builtin:writer",
  origin: "built-in",
  name: "Writer",
  role: "Writer",
  summary: "Drafts messages and posts.",
  description: "You write clear drafts.",
  model: null,
  reasoningEffort: "medium",
  tools: { computer: false },
  skills: [],
  memories: ["Show every message as a draft card first."],
  avatarHue: 30,
  suggested: true,
  createdAt: null,
};

describe("W3 agent settings contract", () => {
  it("describes the full settings of one agent", () => {
    const settings = {
      bot,
      provider: "codex",
      models: [],
      tools: AGENT_TOOL_GROUPS.map((group) => ({ group, enabled: true, available: group !== "computer" })),
      memory: {
        botId: "chief",
        maxMemories: 512,
        customLimit: false,
        essentialCount: 0,
        searchableCount: 0,
        essentialInPrompt: 0,
        essentialPromptBytes: 0,
      },
      skills: [{ skillId: "s1", name: "weekly-report", installedVersion: 1, updateAvailable: false }],
      mcp: [{ botId: "chief", serverId: "m1", enabled: true }],
    };
    expect(isAgentSettings(settings)).toBe(true);
    expect(isAgentSettings({ ...settings, tools: [{ group: "shell", enabled: true, available: true }] })).toBe(false);
    expect(isAgentSettings({ ...settings, provider: "gemini" })).toBe(false);
  });

  it("describes templates for the agent creator and onboarding proposals", () => {
    expect(isAgentTemplate(template)).toBe(true);
    expect(isAgentTemplate({ ...template, origin: "marketplace" })).toBe(false);
    expect(isAgentTemplate({ ...template, tools: { shell: true } })).toBe(false);
  });

  it("keeps a notification matrix, the language and the settings tabs", () => {
    const notifications = defaultNotificationPreferences();
    expect(Object.keys(notifications.matrix)).toEqual([...NOTIFICATION_EVENTS]);
    expect(Object.keys(notifications.matrix.finished)).toEqual([...NOTIFICATION_CHANNELS]);
    const settings = {
      language: "pl",
      theme: "system",
      languageChosen: true,
      notifications,
      tabs: SETTINGS_TABS.map((id) => ({ id, available: id !== "voice" })),
      navigation: { pinnedPageIds: ["library", "agents"] },
      appearance: {
        uiScale: 100,
        font: "inter",
        sendShortcut: "enter",
        chatAccent: "blue",
        agentSteps: "show",
        unreadFirst: false,
      },
      behavior: { launchAtLogin: false, keepBackground: false, externalLinks: "browser" },
      workspace: { restore: true, last: null },
    };
    expect(isAppSettings(settings)).toBe(true);
    expect(isAppSettings({ ...settings, navigation: { pinnedPageIds: ["library", "nope"] } })).toBe(false);
    expect(isAppSettings({ ...settings, navigation: { pinnedPageIds: ["library", "library"] } })).toBe(false);
    expect(isAppSettings({ ...settings, navigation: undefined })).toBe(false);
    expect(isAppSettings({ ...settings, language: "xx" })).toBe(false);
    expect(isAppSettings({ ...settings, notifications: { ...notifications, matrix: {} } })).toBe(false);
  });

  it("describes onboarding with the first agent proposals", () => {
    const state = {
      completed: false,
      language: null,
      preferredProvider: null,
      firstAgentId: null,
      proposals: [template],
      computerUse: { available: true, reason: null },
    };
    expect(isOnboardingState(state)).toBe(true);
    expect(isOnboardingState({ ...state, proposals: [{ id: "x" }] })).toBe(false);
  });

  it("adds IPC channels and events", () => {
    expect(IPC_CHANNELS.agentSettingsGet).toBe("agent-settings:get");
    expect(IPC_CHANNELS.onboardingComplete).toBe("onboarding:complete");
    expect(isAgentEvent({ type: "agent-settings-changed", botId: "chief" })).toBe(true);
    expect(isAgentEvent({ type: "agent-templates-changed", templates: [template] })).toBe(true);
    expect(
      isAgentEvent({
        type: "app-settings-changed",
        settings: {
          language: "en",
          theme: "system",
          languageChosen: false,
          notifications: defaultNotificationPreferences(),
          tabs: [],
          navigation: { pinnedPageIds: [] },
          appearance: {
            uiScale: 100,
            font: "inter",
            sendShortcut: "enter",
            chatAccent: "blue",
            agentSteps: "show",
            unreadFirst: false,
          },
          behavior: { launchAtLogin: false, keepBackground: false, externalLinks: "browser" },
          workspace: { restore: true, last: null },
        },
      }),
    ).toBe(true);
    expect(isAgentEvent({ type: "agent-templates-changed" })).toBe(false);
  });

  it("describes launch-at-login behavior with a boolean default (KAPI-J login)", () => {
    expect(isAppBehavior(DEFAULT_APP_BEHAVIOR)).toBe(true);
    expect(isAppBehavior({ launchAtLogin: true, keepBackground: false, externalLinks: "app" })).toBe(true);
    expect(isAppBehavior({ launchAtLogin: true, keepBackground: false })).toBe(false);
    expect(isAppBehavior({ launchAtLogin: true, keepBackground: false, externalLinks: "tab" })).toBe(false);
    expect(isAppBehavior({ launchAtLogin: "yes", keepBackground: false, externalLinks: "app" })).toBe(false);
    // BE-W: both switches are required and booleans.
    expect(isAppBehavior({ launchAtLogin: true })).toBe(false);
    expect(isAppBehavior({ launchAtLogin: true, keepBackground: "no" })).toBe(false);
    expect(normalizeAppBehavior(undefined)).toEqual(DEFAULT_APP_BEHAVIOR);
    expect(normalizeAppBehavior({ launchAtLogin: true })).toEqual({
      launchAtLogin: true,
      keepBackground: false,
      externalLinks: "browser",
    });
    expect(normalizeAppBehavior({ keepBackground: true, launchAtLogin: 1 })).toEqual({
      launchAtLogin: false,
      keepBackground: true,
      externalLinks: "browser",
    });
    expect(parseBehaviorPatch({ launchAtLogin: true })).toEqual({ launchAtLogin: true });
    expect(parseBehaviorPatch({ keepBackground: true })).toEqual({ keepBackground: true });
    expect(parseBehaviorPatch({ externalLinks: "app" })).toEqual({ externalLinks: "app" });
    expect(() => parseBehaviorPatch({ externalLinks: "popup" })).toThrow(/externalLinks is one of browser, app/);
    expect(() => parseBehaviorPatch({ keepBackground: "yes" })).toThrow(/keepBackground is on or off/);
    expect(() => parseBehaviorPatch({ launchAtLogin: "yes" })).toThrow(/on or off/);
    expect(() => parseBehaviorPatch({ openAtLogin: true })).toThrow(/Unknown behavior/);
  });

  it("describes the look of the program in short lists, with today's values as defaults (BE-U)", () => {
    expect(APP_UI_SCALES).toEqual([90, 100, 110, 125, 140]);
    expect(APP_FONTS).toEqual(["inter", "system", "mono"]);
    expect(APP_SEND_SHORTCUTS).toEqual(["enter", "mod-enter"]);
    expect(APP_CHAT_ACCENTS).toHaveLength(6);
    expect(APP_AGENT_STEPS).toEqual(["show", "collapse"]);
    expect(isAppAppearance(DEFAULT_APP_APPEARANCE)).toBe(true);
    expect(isAppAppearance({ ...DEFAULT_APP_APPEARANCE, uiScale: 99 })).toBe(false);
    expect(isAppAppearance({ ...DEFAULT_APP_APPEARANCE, unreadFirst: "no" })).toBe(false);
    expect(isAppAppearance(null)).toBe(false);
  });

  it("reads a saved look back field by field: what is not valid returns to the default (BE-U)", () => {
    expect(normalizeAppAppearance(undefined)).toEqual(DEFAULT_APP_APPEARANCE);
    expect(normalizeAppAppearance({ uiScale: 125, font: "wingdings", chatAccent: "pink", unreadFirst: 1 })).toEqual({
      ...DEFAULT_APP_APPEARANCE,
      uiScale: 125,
      chatAccent: "pink",
    });
  });

  it("checks a change of the look: known fields, known values, plain sentences (BE-U)", () => {
    expect(parseAppearancePatch({})).toEqual({});
    expect(parseAppearancePatch({ uiScale: 90, agentSteps: "collapse" })).toEqual({
      uiScale: 90,
      agentSteps: "collapse",
    });
    expect(() => parseAppearancePatch("big")).toThrow(/object/);
    expect(() => parseAppearancePatch({ uiScale: "100" })).toThrow(/uiScale is one of 90, 100, 110, 125, 140/);
    expect(() => parseAppearancePatch({ sendShortcut: "tab" })).toThrow(/sendShortcut/);
    expect(() => parseAppearancePatch({ chatAccent: "#fff" })).toThrow(/chatAccent/);
    expect(() => parseAppearancePatch({ theme: "dark" })).toThrow(/Unknown appearance setting "theme"/);
  });

  it("maps a look to DOM tokens for the window (KAPI-N)", () => {
    expect(appearanceDomTokens(undefined)).toMatchObject({
      uiScale: "100",
      font: "inter",
      chatAccent: "blue",
      sendShortcut: "enter",
      agentSteps: "collapse",
      unreadFirst: "false",
      scaleFactor: "1",
      accentHex: "#3b82f6",
    });
    expect(appearanceDomTokens({ uiScale: 125, font: "mono", chatAccent: "violet", unreadFirst: true })).toMatchObject({
      uiScale: "125",
      font: "mono",
      chatAccent: "violet",
      unreadFirst: "true",
      scaleFactor: "1.25",
      accentHex: "#8b5cf6",
    });
  });

  it("describes the remembered workspace: restore on by default, a place is a page, an agent and its thread (BE-X)", () => {
    expect(DEFAULT_APP_WORKSPACE).toEqual({ restore: true, last: null });
    expect(isAppWorkspace(DEFAULT_APP_WORKSPACE)).toBe(true);
    expect(isAppWorkspace({ restore: false, last: { page: "tasks", botId: "chief", threadId: "t1" } })).toBe(true);
    expect(isAppWorkspace({ restore: true, last: { page: null, botId: null, threadId: null } })).toBe(true);
    expect(isAppWorkspace({ restore: true, last: { page: "nowhere", botId: null, threadId: null } })).toBe(false);
    // A thread without its agent cannot be opened.
    expect(isAppWorkspace({ restore: true, last: { page: null, botId: null, threadId: "t1" } })).toBe(false);
    expect(isAppWorkspace({ restore: true, last: { page: null, botId: "", threadId: null } })).toBe(false);
    expect(isAppWorkspace({ restore: true, last: { page: null, botId: "a\nb", threadId: null } })).toBe(false);
    expect(isAppWorkspace({ restore: true, last: { page: null, botId: "x".repeat(201), threadId: null } })).toBe(false);
    expect(isAppWorkspace({ restore: "yes", last: null })).toBe(false);
    expect(normalizeAppWorkspace(undefined)).toEqual(DEFAULT_APP_WORKSPACE);
    expect(normalizeAppWorkspace({ restore: false, last: { page: "bad", botId: "chief", threadId: null } })).toEqual({
      restore: false,
      last: null,
    });
  });

  it("checks a change of the remembered workspace: known keys, a whole valid place or null (BE-X)", () => {
    expect(parseWorkspacePatch({})).toEqual({});
    expect(parseWorkspacePatch({ restore: false })).toEqual({ restore: false });
    expect(parseWorkspacePatch({ last: { page: "agents", botId: "chief", threadId: "t1" } })).toEqual({
      last: { page: "agents", botId: "chief", threadId: "t1" },
    });
    expect(parseWorkspacePatch({ last: null })).toEqual({ last: null });
    expect(() => parseWorkspacePatch("x")).toThrow(/object/);
    expect(() => parseWorkspacePatch({ restore: 1 })).toThrow(/restore is on or off/);
    expect(() => parseWorkspacePatch({ last: { page: "agents", botId: null, threadId: "t1" } })).toThrow(
      /last is a place/,
    );
    expect(() => parseWorkspacePatch({ position: 1 })).toThrow(/Unknown workspace setting "position"/);
  });
});

describe("the remembered workspace of each server (BE-AD, item 9)", () => {
  const home = { page: "agents", botId: "chief", threadId: "t1" } as const;
  const far = { page: "tasks", botId: "remote-bot", threadId: null } as const;

  it("keeps the old shape when no server has a place, and reads a place per server", () => {
    expect(normalizeAppWorkspace({ restore: true, last: null, byServer: {} })).toEqual({ restore: true, last: null });
    expect(isAppWorkspace({ restore: true, last: null, byServer: { "server-2": far } })).toBe(true);
    expect(isAppWorkspace({ restore: true, last: null, byServer: { "server-2": { ...far, page: "nowhere" } } })).toBe(
      false,
    );
    expect(isAppWorkspace({ restore: true, last: null, byServer: { "": far } })).toBe(false);
    expect(isAppWorkspace({ restore: true, last: null, byServer: [far] })).toBe(false);
    // What is not valid is left out, the rest stays.
    expect(
      normalizeAppWorkspace({
        restore: true,
        last: null,
        byServer: { ok: far, bad: { page: "x", botId: null, threadId: null } },
      }),
    ).toEqual({ restore: true, last: null, byServer: { ok: far } });
  });

  it("checks a change for one server: a whole place or null, and not for this computer", () => {
    expect(parseWorkspacePatch({ byServer: { "server-2": far, "server-3": null } })).toEqual({
      byServer: { "server-2": far, "server-3": null },
    });
    expect(() => parseWorkspacePatch({ byServer: { "server-2": { page: "x", botId: null, threadId: null } } })).toThrow(
      /place/,
    );
    expect(() => parseWorkspacePatch({ byServer: { local: far } })).toThrow(/this computer.*last/);
    expect(() => parseWorkspacePatch({ byServer: "x" })).toThrow(/byServer/);
    expect(() => parseWorkspacePatch({ byServer: { "": far } })).toThrow(/server id/);
  });

  it("applies a change: sets, forgets, keeps this computer's place apart and keeps at most 16 servers", () => {
    const start = { restore: true, last: home };
    const one = applyWorkspacePatch(start, { byServer: { a: far } });
    expect(one).toEqual({ restore: true, last: home, byServer: { a: far } });
    const forgot = applyWorkspacePatch(one, { byServer: { a: null } });
    expect(forgot).toEqual(start);
    expect(applyWorkspacePatch(one, { restore: false })).toEqual({ restore: false, last: home, byServer: { a: far } });
    let many = applyWorkspacePatch(start, {});
    for (let index = 0; index < 20; index += 1) many = applyWorkspacePatch(many, { byServer: { [`s${index}`]: far } });
    const keys = Object.keys(many.byServer ?? {});
    expect(keys).toHaveLength(16);
    // The oldest are dropped; writing a place again makes it the newest.
    expect(keys[0]).toBe("s4");
    const again = applyWorkspacePatch(many, { byServer: { s4: home } });
    expect(Object.keys(again.byServer ?? {}).at(-1)).toBe("s4");
  });
});
