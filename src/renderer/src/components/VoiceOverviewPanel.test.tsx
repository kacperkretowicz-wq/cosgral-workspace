import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockVoice, type MockVoice } from "../../stories/mock-voice";
import { VoiceOverviewPanel } from "./VoiceOverviewPanel";

let mock: MockVoice;
let listeners: Array<(event: AgentEvent) => void> = [];

function install(withApi = true) {
  Object.assign(window, {
    openbot: {
      voice: withApi ? mock : undefined,
      agent: {
        onEvent: (listener: (event: AgentEvent) => void) => {
          listeners.push(listener);
          return () => {
            listeners = listeners.filter((item) => item !== listener);
          };
        },
      },
    },
  });
}

beforeEach(() => {
  listeners = [];
  mock = createMockVoice((event) => {
    for (const listener of listeners) listener(event);
  });
  install();
});
afterEach(cleanup);

const microphone = () => {
  const group = screen.getByRole("heading", { name: "Microphone" }).closest("section");
  if (!(group instanceof HTMLElement)) throw new Error("no microphone group");
  return within(group);
};

it("shows the microphone permission the system reports, with what it means", async () => {
  mock.simulate.microphone("denied");
  render(() => <VoiceOverviewPanel />);
  expect(await screen.findByText("Microphone permission")).toBeInTheDocument();
  expect(microphone().getByText("Blocked")).toBeInTheDocument();
  expect(microphone().getByText(/Allow it in the system settings/)).toBeInTheDocument();
});

it("says plainly when the system has not asked yet and when it does not say", async () => {
  render(() => <VoiceOverviewPanel />);
  expect(await screen.findByText("Not asked yet")).toBeInTheDocument();
  cleanup();
  mock.simulate.microphone("unknown");
  render(() => <VoiceOverviewPanel />);
  expect(await screen.findByText("Unknown")).toBeInTheDocument();
  expect(screen.getByText("This system does not say. Recording is simply tried.")).toBeInTheDocument();
});

it("opens the system microphone page from the button and reports a refusal", async () => {
  const open = vi.spyOn(mock, "openMicrophoneSettings");
  render(() => <VoiceOverviewPanel />);
  await fireEvent.click(await screen.findByRole("button", { name: "Open microphone settings" }));
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Open microphone settings" })).toBeEnabled());
  open.mockRejectedValueOnce(new Error("The settings page could not be opened."));
  await fireEvent.click(screen.getByRole("button", { name: "Open microphone settings" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The settings page could not be opened.");
});

it("lists what this version does not offer, by section, each with its reason", async () => {
  render(() => <VoiceOverviewPanel />);
  const heading = await screen.findByRole("heading", { name: "Not available in this version" });
  const group = heading.closest("section");
  if (!(group instanceof HTMLElement)) throw new Error("no list");
  const list = within(group);
  for (const section of ["Dictation", "Spoken replies", "Live voice"]) {
    expect(list.getByText(section)).toBeInTheDocument();
  }
  expect(list.getByText("Parakeet dictation model")).toBeInTheDocument();
  expect(list.getAllByText(/This version keeps audio on this computer./, { selector: "span, p" }).length).toBe(2);
  expect(list.getAllByText("Not available").length).toBe(4);
});

it("reads the page again when the voice changes", async () => {
  const getOverview = vi.spyOn(mock, "getOverview");
  render(() => <VoiceOverviewPanel />);
  await screen.findByText("Microphone permission");
  const before = getOverview.mock.calls.length;
  mock.simulate.microphone("granted");
  for (const listener of listeners) listener({ type: "voice-changed", state: await mock.getState() });
  expect(await screen.findByText("Allowed")).toBeInTheDocument();
  expect(getOverview.mock.calls.length).toBeGreaterThan(before);
});

it("shows an error with Retry when the page cannot be read, and shows nothing of the page without the API", async () => {
  vi.spyOn(mock, "getOverview").mockRejectedValueOnce(new Error("The voice page is locked."));
  render(() => <VoiceOverviewPanel />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The voice page is locked.");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Microphone permission")).toBeInTheDocument();
  cleanup();
  install(false);
  render(() => <VoiceOverviewPanel />);
  expect(screen.queryByText("Microphone permission")).not.toBeInTheDocument();
  expect(screen.queryByText("Not available in this version")).not.toBeInTheDocument();
});
