import { describe, expect, it } from "vitest";
import {
  AGENT_TOOL_GROUPS,
  APP_AGENT_STEPS,
  APP_CHAT_ACCENTS,
  APP_FONTS,
  APP_SEND_SHORTCUTS,
  APP_UI_SCALES,
  DEFAULT_APP_APPEARANCE,
  defaultNotificationPreferences,
  IPC_CHANNELS,
  isAgentEvent,
  isAgentSettings,
  isAgentTemplate,
  isAppAppearance,
  isAppSettings,
  isOnboardingState,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  normalizeAppAppearance,
  parseAppearancePatch,
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
        },
      }),
    ).toBe(true);
    expect(isAgentEvent({ type: "agent-templates-changed" })).toBe(false);
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
});
