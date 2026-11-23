import type { AgentStatus } from "@openbot/contracts/ipc";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { InitialSetup } from "./InitialSetup";

const STATUS: AgentStatus = {
  phase: "ready",
  cliVersion: "1.0.0",
  auth: { kind: "unknown" },
  providers: [{ id: "codex", state: "available", version: "1.0.0", message: null }],
  capabilities: { chat: "ready", browser: "ready", computerUse: "ready" },
  message: null,
  fullAccess: true,
};

let dispose: () => void = () => undefined;

beforeEach(() => {
  const mock = createMockOpenBot();
  dispose = () => mock.dispose();
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
});
afterEach(() => {
  cleanup();
  dispose();
  vi.restoreAllMocks();
});

function renderSettings() {
  return render(() => (
    <InitialSetup
      reviewing
      state={{ completed: true, preferredProvider: "codex" }}
      agentStatus={STATUS}
      platform="win32"
      accountEmail="person@example.com"
      onSave={vi.fn().mockResolvedValue(undefined)}
      onJoinRemote={vi.fn()}
      onLogout={vi.fn()}
      onClose={vi.fn()}
    />
  ));
}

// KK-AC: the gear of the page rail opens THIS screen (not the old dialog of app settings, which nothing opens),
// so Updates must be on it.
it("shows the Updates section with its heading on the Settings screen", async () => {
  const view = renderSettings();
  expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
  await waitFor(() => expect(view.container.ownerDocument.getElementById("settings-updates")).not.toBeNull());
  expect(view.container.ownerDocument.getElementById("settings-updates")?.textContent).toBe("Updates");
  await waitFor(() =>
    expect(screen.getByText(/COSGRAL Workspace version|Update settings are not available/)).toBeInTheDocument(),
  );
});

it("has no Voice section on the Settings screen", async () => {
  const view = renderSettings();
  await screen.findByRole("heading", { name: "Settings" });
  await waitFor(() => expect(view.container.ownerDocument.getElementById("settings-updates")).not.toBeNull());
  expect(view.container.ownerDocument.getElementById("settings-voice")).toBeNull();
  expect(screen.queryByRole("button", { name: "Voice" })).toBeNull();
});

it("lets the person change the theme on the Settings screen", async () => {
  renderSettings();
  await screen.findByRole("heading", { name: "Settings" });
  const theme = await screen.findByLabelText("Theme");
  await waitFor(() => expect(theme).not.toBeDisabled());
  expect(screen.getByRole("option", { name: "Light" })).toBeInTheDocument();
});

it("shows App behavior (launch at login, keep running in the background) on the Settings screen", async () => {
  renderSettings();
  await screen.findByRole("heading", { name: "Settings" });
  expect(await screen.findByRole("switch", { name: "Launch COSGRAL Workspace at login" })).toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "Keep COSGRAL Workspace running in the background" })).toBeInTheDocument();
});
