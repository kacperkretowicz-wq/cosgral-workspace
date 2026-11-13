import type { AppSettings } from "@openbot/contracts/ipc";
import { defaultNotificationPreferences, SETTINGS_TABS } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSettingsW3, OnboardingW3 } from "./AppSettingsW3";

afterEach(() => vi.unstubAllGlobals());

describe("onboarding", () => {
  it("passes the chosen language and provider once on completion", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <OnboardingW3
        state={{
          completed: false,
          language: null,
          preferredProvider: null,
          firstAgentId: null,
          proposals: [],
          computerUse: { available: false, reason: "Unavailable" },
        }}
        complete={complete}
      />
    ));
    await fireEvent.change(screen.getByLabelText("Language"), { target: { value: "pl" } });
    await fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(complete).toHaveBeenCalledWith({ language: "pl", preferredProvider: "codex", firstAgent: null });
  });
});

function settings(): AppSettings {
  return {
    language: "en",
    languageChosen: true,
    notifications: defaultNotificationPreferences(),
    tabs: SETTINGS_TABS.map((id) => ({ id, available: true })),
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
    await fireEvent.click(await screen.findByRole("checkbox", { name: "Channel result: sound" }));
    await fireEvent.change(screen.getByLabelText("Language"), { target: { value: "pl" } });
    await fireEvent.click(screen.getByRole("button", { name: "Save application settings" }));
    expect(update).toHaveBeenCalledTimes(1);
    const input = update.mock.calls[0]?.[0];
    expect(input.language).toBe("pl");
    expect(input.notifications.matrix["channel-result"].sound).toBe(true);
  });
});
