import type { AppSettings } from "@openbot/contracts/ipc";
import { defaultNotificationPreferences, SETTINGS_TABS } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { language, setLanguage } from "../i18n";
import { AppSettingsW3 } from "./AppSettingsW3";

afterEach(() => {
  vi.unstubAllGlobals();
  // Saving the language switches the whole program (a global): the next test starts in English.
  setLanguage("en");
});
// The first-run (onboarding) fields are tested with the setup step: InitialSetup.onboarding.test.tsx.

function settings(): AppSettings {
  return {
    language: "en",
    theme: "system",
    languageChosen: true,
    notifications: defaultNotificationPreferences(),
    tabs: SETTINGS_TABS.map((id) => ({ id, available: true })),
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
}

describe("application settings", () => {
  it("names events and channels in words a person reads, not internal ids", async () => {
    vi.stubGlobal("openbot", { appSettings: { get: vi.fn().mockResolvedValue(settings()), update: vi.fn() } });
    render(() => <AppSettingsW3 />);
    expect(await screen.findByRole("rowheader", { name: "Needs your approval" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Notification" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sound" })).toBeInTheDocument();
    expect(screen.queryByText("needs-approval")).not.toBeInTheDocument();
    expect(screen.queryByText("computer-use")).not.toBeInTheDocument();
  });

  it("saves the changed notification matrix and the language", async () => {
    const update = vi.fn().mockImplementation(async () => settings());
    vi.stubGlobal("openbot", { appSettings: { get: vi.fn().mockResolvedValue(settings()), update } });
    render(() => <AppSettingsW3 />);
    await fireEvent.click(await screen.findByRole("switch", { name: "Project result: Sound" }));
    await fireEvent.change(screen.getByLabelText("Language"), { target: { value: "pl" } });
    await fireEvent.click(screen.getByRole("button", { name: "Save application settings" }));
    expect(update).toHaveBeenCalledTimes(1);
    const input = update.mock.calls[0]?.[0];
    expect(input.language).toBe("pl");
    expect(input.notifications.matrix["channel-result"].sound).toBe(true);
  });

  it("applies the language only after it was saved, and says so when saving fails", async () => {
    const update = vi.fn().mockRejectedValue(new Error("The settings could not be saved."));
    vi.stubGlobal("openbot", { appSettings: { get: vi.fn().mockResolvedValue(settings()), update } });
    render(() => <AppSettingsW3 />);
    await fireEvent.change(await screen.findByLabelText("Language"), { target: { value: "pl" } });
    await fireEvent.click(screen.getByRole("button", { name: "Save application settings" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The settings could not be saved."));
    expect(language()).toBe("en");
  });
});
