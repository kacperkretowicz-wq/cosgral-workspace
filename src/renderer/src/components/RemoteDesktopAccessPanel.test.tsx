import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockRemoteDesktop, type MockRemoteDesktop } from "../../stories/mock-remote-desktop";
import { RemoteDesktopAccessPanel } from "./RemoteDesktopAccessPanel";

let mock: MockRemoteDesktop;
let listeners: Array<(event: AgentEvent) => void> = [];

function install(withApi = true) {
  Object.assign(window, {
    openbot: {
      remoteDesktop: withApi ? mock : undefined,
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
  mock = createMockRemoteDesktop((event) => {
    for (const listener of listeners) listener(event);
  });
  install();
});
afterEach(cleanup);

it("shows that sharing is off, the limit of sessions, and the unattended line as not available with its reason", async () => {
  render(() => <RemoteDesktopAccessPanel />);
  expect(await screen.findByText("Sharing this computer")).toBeInTheDocument();
  expect(screen.getByText("Off")).toBeInTheDocument();
  expect(screen.getByText(/0 of 1 sessions open · 0 waiting for your answer/)).toBeInTheDocument();
  expect(screen.getByText("Unattended access")).toBeInTheDocument();
  expect(screen.getByText("Not available")).toBeInTheDocument();
  expect(
    screen.getByText(/nobody can take over a computer that nobody is sitting at/, { selector: "span, p" }),
  ).toBeInTheDocument();
});

it("the Ask switch changes the host setting and shows the new state", async () => {
  const set = vi.spyOn(mock.host, "setAskEverySession");
  render(() => <RemoteDesktopAccessPanel />);
  const toggle = await screen.findByRole("switch", { name: /Ask on this computer every time/ });
  expect(toggle).not.toBeChecked();
  expect(screen.getByText(/You have 60 seconds to answer/)).toBeInTheDocument();
  await fireEvent.click(toggle);
  await waitFor(() => expect(set).toHaveBeenCalledWith({ enabled: true }));
  await waitFor(() => expect(screen.getByRole("switch", { name: /Ask on this computer every time/ })).toBeChecked());
  await waitFor(() => expect(screen.getByRole("switch", { name: /Ask on this computer every time/ })).toBeEnabled());
  await fireEvent.click(screen.getByRole("switch", { name: /Ask on this computer every time/ }));
  await waitFor(() => expect(set).toHaveBeenLastCalledWith({ enabled: false }));
});

it("follows the host: ready after enabling, and a card waiting for the owner is counted", async () => {
  render(() => <RemoteDesktopAccessPanel />);
  await screen.findByText("Sharing this computer");
  await mock.host.enable({ exposure: "loopback", port: 0 });
  expect(await screen.findByText("Ready")).toBeInTheDocument();
  mock.simulate.viewerConnects({ peerId: "viewer-1", label: "Laptop (demo)" });
  expect(await screen.findByText(/1 waiting for your answer/)).toBeInTheDocument();
});

it("says why sharing is unavailable and keeps the switch off-limits", async () => {
  mock.simulate.unavailable("Sharing needs Windows.");
  render(() => <RemoteDesktopAccessPanel />);
  expect(await screen.findByText("Sharing needs Windows.")).toBeInTheDocument();
  expect(screen.getAllByText("Not available").length).toBe(2);
  expect(screen.getByRole("switch", { name: /Ask on this computer every time/ })).toBeDisabled();
});

it("shows an error with Retry, a refused change as an alert, and nothing without the API", async () => {
  vi.spyOn(mock.host, "getState").mockRejectedValueOnce(new Error("The host is busy."));
  render(() => <RemoteDesktopAccessPanel />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The host is busy.");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  const toggle = await screen.findByRole("switch", { name: /Ask on this computer every time/ });
  vi.spyOn(mock.host, "setAskEverySession").mockRejectedValueOnce(new Error("The change was refused."));
  await fireEvent.click(toggle);
  expect(await screen.findByRole("alert")).toHaveTextContent("The change was refused.");
  cleanup();
  install(false);
  render(() => <RemoteDesktopAccessPanel />);
  expect(screen.queryByText("Who may come in")).not.toBeInTheDocument();
});
