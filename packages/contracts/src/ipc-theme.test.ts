import { expect, it } from "vitest";
import { parseUpdateAppSettings } from "../../../src/main/ipc/agent-settings-inputs";
import { APP_THEMES, defaultNotificationPreferences, isAppSettings, normalizeAppTheme } from "./ipc-agent-settings";

it("accepts only the three theme values and defaults unknown input to dark", () => {
  for (const theme of APP_THEMES) expect(normalizeAppTheme(theme)).toBe(theme);
  for (const theme of [undefined, null, 42, "sepia", {}]) expect(normalizeAppTheme(theme)).toBe("dark");
  expect(parseUpdateAppSettings({ theme: "sepia" })).toEqual({ theme: "dark" });
  const settings = {
    theme: "light",
    language: "en",
    languageChosen: true,
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
    behavior: { launchAtLogin: false, keepBackground: false },
  };
  expect(isAppSettings(settings)).toBe(true);
  expect(isAppSettings({ ...settings, theme: "sepia" })).toBe(false);
});
