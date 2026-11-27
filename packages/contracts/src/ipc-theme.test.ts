import { expect, it } from "vitest";
import { parseUpdateAppSettings } from "../../../src/main/ipc/agent-settings-inputs";
import { APP_THEMES, defaultNotificationPreferences, isAppSettings, normalizeAppTheme } from "./ipc-agent-settings";

it("has only the dark theme: every saved value, including the old light and system, means dark", () => {
  expect(APP_THEMES).toEqual(["dark"]);
  for (const theme of ["dark", "light", "system", undefined, null, 42, "sepia", {}]) {
    expect(normalizeAppTheme(theme)).toBe("dark");
  }
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
      fontWeight: "normal",
      sendShortcut: "enter",
      chatAccent: "blue",
      agentSteps: "show",
      unreadFirst: false,
    },
    behavior: { launchAtLogin: false, keepBackground: false, externalLinks: "browser" },
    workspace: { restore: true, last: null },
  };
  // An older host may still send "light"; the app accepts it and shows dark.
  expect(isAppSettings(settings)).toBe(true);
  expect(isAppSettings({ ...settings, language: "xx" })).toBe(false);
});
