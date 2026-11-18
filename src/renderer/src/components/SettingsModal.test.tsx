import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockInstanceTransfer } from "../../stories/mock-instance-transfer";
import { createMockVoice } from "../../stories/mock-voice";
import { SettingsModal } from "./SettingsModal";

beforeEach(() => {
  const instance = createMockInstanceTransfer(() => undefined);
  const voice = createMockVoice(() => undefined);
  Object.assign(window, {
    openbot: {
      updatePreferences: instance.updates,
      update: {
        getStatus: vi.fn(),
        check: vi.fn(),
        download: vi.fn(),
        install: vi.fn(),
        onEvent: () => () => undefined,
      },
      voice,
      agent: { onEvent: (_listener: (event: AgentEvent) => void) => () => undefined },
    },
  });
});
afterEach(cleanup);

const nav = (name: string) => screen.getByRole("button", { name });

it("Updates has its own section in the settings; General no longer carries a second copy", async () => {
  render(() => <SettingsModal open onOpenChange={() => undefined} />);
  expect(nav("Updates")).toBeEnabled();
  expect(screen.queryByText("COSGRAL Workspace version")).not.toBeInTheDocument();
  await fireEvent.click(nav("Updates"));
  expect(await screen.findByText("COSGRAL Workspace version")).toBeInTheDocument();
  expect(screen.getByLabelText("Update track")).toBeInTheDocument();
});

it("Voice has its own section: the microphone and what this version does not offer", async () => {
  render(() => <SettingsModal open onOpenChange={() => undefined} />);
  expect(nav("Voice")).toBeEnabled();
  await fireEvent.click(nav("Voice"));
  expect(await screen.findByText("Microphone permission")).toBeInTheDocument();
  expect(screen.getByText("Not available in this version")).toBeInTheDocument();
});

it("General offers only switches that save: the three of App behavior, no notification switches without a store", async () => {
  render(() => <SettingsModal open onOpenChange={() => undefined} />);
  expect(await screen.findByRole("switch", { name: "Launch COSGRAL Workspace at login" })).toBeInTheDocument();
  const names = screen.getAllByRole("switch").map((item) => item.getAttribute("aria-label") ?? item.textContent);
  expect(names).toHaveLength(3);
  expect(screen.getByRole("switch", { name: "Keep COSGRAL Workspace running in the background" })).toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "Restore the last workspace on launch" })).toBeInTheDocument();
  expect(screen.queryByText("Desktop notifications")).not.toBeInTheDocument();
  expect(screen.queryByText("Play a sound when a task finishes")).not.toBeInTheDocument();
  // The real matrix of notifications is on the Settings screen (AppSettingsW3); this dialog does not pretend to have one.
  expect(screen.queryByRole("heading", { name: "Notifications" })).not.toBeInTheDocument();
});
