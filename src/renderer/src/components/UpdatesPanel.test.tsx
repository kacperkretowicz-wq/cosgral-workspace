import type { AgentEvent, UpdateStatus } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockInstanceTransfer, type MockInstanceTransfer } from "../../stories/mock-instance-transfer";
import { UpdatesPanel } from "./UpdatesPanel";

let mock: MockInstanceTransfer;
let emit: (event: AgentEvent) => void = () => undefined;
let statusListeners: Array<(status: UpdateStatus) => void> = [];

const STATUS: UpdateStatus = {
  phase: "up-to-date",
  currentVersion: "0.0.0-demo",
  availableVersion: null,
  progress: null,
  checkedAt: "2026-11-18T09:00:00.000Z",
  message: null,
};

const updates = {
  getStatus: vi.fn(),
  check: vi.fn(async () => {
    mock.simulate.updateStatus({ phase: "up-to-date", checkedAt: STATUS.checkedAt });
    return STATUS;
  }),
  download: vi.fn(),
  install: vi.fn(async () => undefined),
  onEvent: (listener: (status: UpdateStatus) => void) => {
    statusListeners.push(listener);
    return () => undefined;
  },
};

beforeEach(() => {
  statusListeners = [];
  mock = createMockInstanceTransfer((event) => emit(event));
  updates.check.mockClear();
  updates.install.mockClear();
  Object.assign(window, {
    openbot: {
      updatePreferences: mock.updates,
      update: updates,
      agent: {
        onEvent: (listener: (event: AgentEvent) => void) => {
          emit = listener;
          return () => undefined;
        },
      },
    },
  });
});
afterEach(cleanup);

it("shows the version, the track and the automatic settings", async () => {
  render(() => <UpdatesPanel />);
  expect(await screen.findByText("0.0.0-demo")).toBeInTheDocument();
  expect(screen.getByLabelText("Update track")).toHaveValue("stable");
  expect(screen.getByText("Stable receives tested releases.")).toBeInTheDocument();
  expect(screen.getByLabelText("Check for updates automatically")).toBeChecked();
  expect(screen.getByLabelText("Install a downloaded update when the program closes")).toBeChecked();
  expect(screen.getByLabelText("Automatically download updates")).not.toBeChecked();
});

it("switches to the Preview track and saves it", async () => {
  const spy = vi.spyOn(mock.updates, "set");
  render(() => <UpdatesPanel />);
  const select = await screen.findByLabelText("Update track");
  fireEvent.change(select, { target: { value: "preview" } });
  await waitFor(() => expect(spy).toHaveBeenCalledWith({ includePrereleases: true }));
  await waitFor(() => expect(screen.getByLabelText("Update track")).toHaveValue("preview"));
  expect(screen.getByText(/Preview also receives pre-releases/)).toBeInTheDocument();
});

it("turning the automatic checks off switches the download off with them", async () => {
  mock.updates.set({ automaticDownload: true });
  render(() => <UpdatesPanel />);
  const checks = await screen.findByLabelText("Check for updates automatically");
  fireEvent.click(checks);
  await waitFor(() => expect(screen.getByLabelText("Automatically download updates")).toBeDisabled());
  expect(screen.getByLabelText("Automatically download updates")).not.toBeChecked();
  expect(screen.getByLabelText("How often")).toBeDisabled();
});

it("checks for updates when asked", async () => {
  render(() => <UpdatesPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
  await waitFor(() => expect(updates.check).toHaveBeenCalledTimes(1));
});

it("'Restart when idle' needs a downloaded update, then waits, and can be stopped", async () => {
  render(() => <UpdatesPanel />);
  const button = await screen.findByRole("button", { name: "Restart when idle" });
  expect(button).toBeDisabled();
  expect(screen.getByText("No update has been downloaded yet.")).toBeInTheDocument();

  mock.simulate.updateStatus({ phase: "ready", availableVersion: "0.0.1-demo", progress: 100 });
  await waitFor(() => expect(screen.getByRole("button", { name: "Restart when idle" })).toBeEnabled());
  expect(screen.getByText("Version 0.0.1-demo is downloaded and ready.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Restart and install" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Restart when idle" }));
  expect(await screen.findByText("Waiting for the agents to finish, then the program restarts.")).toBeInTheDocument();
  // The buttons are disabled while the call finishes; wait until they are free.
  await waitFor(() => expect(screen.getByRole("button", { name: "Stop waiting" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Stop waiting" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Restart when idle" })).toBeEnabled());
});

it("installs the downloaded update now", async () => {
  mock.simulate.updateStatus({ phase: "ready", availableVersion: "0.0.1-demo", progress: 100 });
  render(() => <UpdatesPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Restart and install" }));
  await waitFor(() => expect(updates.install).toHaveBeenCalledTimes(1));
});

it("lists what this version does not offer, with the reason", async () => {
  render(() => <UpdatesPanel />);
  expect(await screen.findByText("Allow updates from server members")).toBeInTheDocument();
  expect(screen.getByText("This program has no server members: only you update it.")).toBeInTheDocument();
  expect(screen.getByText("What's new")).toBeInTheDocument();
  expect(screen.getAllByText("Not available")).toHaveLength(2);
});

it("a build that cannot update says why and hides the controls", async () => {
  mock.simulate.updateStatus({ phase: "unsupported", message: "Updates are available in installed desktop builds." });
  render(() => <UpdatesPanel />);
  expect(await screen.findByText("Updates are available in installed desktop builds.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Update track")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();
});

it("shows an error with Retry when the settings cannot be read", async () => {
  const spy = vi.spyOn(mock.updates, "getOverview").mockRejectedValueOnce(new Error("The settings are locked."));
  render(() => <UpdatesPanel />);
  expect(await screen.findByRole("alert")).toHaveTextContent("The settings are locked.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("0.0.0-demo")).toBeInTheDocument();
  expect(spy).toHaveBeenCalledTimes(2);
});

it("reloads when the program reports a new status", async () => {
  render(() => <UpdatesPanel />);
  await screen.findByText("0.0.0-demo");
  mock.simulate.updateStatus({ phase: "available", availableVersion: "0.0.2-demo" });
  for (const listener of statusListeners) listener({ ...STATUS, phase: "available", availableVersion: "0.0.2-demo" });
  expect(await screen.findByText("Version 0.0.2-demo is available.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
});
