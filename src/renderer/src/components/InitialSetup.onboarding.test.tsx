import type { AgentStatus, AgentTemplate, OnboardingState } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InitialSetup } from "./InitialSetup";

afterEach(() => vi.unstubAllGlobals());

const STATUS: AgentStatus = {
  phase: "ready",
  cliVersion: "1.0.0",
  auth: { kind: "unknown" },
  providers: [
    { id: "codex", state: "available", version: "1.0.0", message: null },
    { id: "claude", state: "not-installed", version: null, message: null },
  ],
  capabilities: { chat: "ready", browser: "ready", computerUse: "ready" },
  message: null,
  fullAccess: true,
};

const TEMPLATE: AgentTemplate = {
  id: "meeting-notes",
  origin: "built-in",
  name: "Meeting notes",
  role: "Notes",
  summary: "Turns notes into action items.",
  description: "",
  model: null,
  reasoningEffort: null,
  tools: {},
  skills: [],
  memories: [],
  avatarHue: null,
  suggested: true,
  createdAt: null,
};

function onboarding(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    completed: false,
    language: null,
    preferredProvider: null,
    firstAgentId: null,
    proposals: [TEMPLATE],
    computerUse: { available: true, reason: null },
    ...overrides,
  };
}

function renderSetup(onSave = vi.fn().mockResolvedValue(undefined)) {
  render(() => (
    <InitialSetup
      state={{ completed: false, preferredProvider: null }}
      agentStatus={STATUS}
      platform="win32"
      accountEmail="person@example.com"
      onSave={onSave}
      onJoinRemote={vi.fn()}
      onLogout={vi.fn()}
    />
  ));
  return onSave;
}

describe("first run: one flow", () => {
  it("asks for the provider once and takes language and the first agent on the same step", async () => {
    vi.stubGlobal("openbot", { onboarding: { getState: vi.fn().mockResolvedValue(onboarding()) } });
    const onSave = renderSetup();
    await fireEvent.click(screen.getByRole("button", { name: /Use this computer/ }));
    expect(screen.getAllByRole("radiogroup", { name: "Default provider" })).toHaveLength(1);
    await fireEvent.change(await screen.findByLabelText("Language"), { target: { value: "pl" } });
    await fireEvent.change(screen.getByLabelText("First agent"), { target: { value: "meeting-notes" } });
    expect(screen.getByText("Available; every action asks for your approval first.")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Continue with Codex" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("codex", {
      language: "pl",
      firstAgent: { templateId: "meeting-notes" },
    });
  });

  it("keeps the original setup when the program has no onboarding", async () => {
    vi.stubGlobal("openbot", {});
    const onSave = renderSetup();
    await fireEvent.click(screen.getByRole("button", { name: /Use this computer/ }));
    expect(screen.queryByLabelText("First agent")).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Continue with Codex" }));
    expect(onSave).toHaveBeenCalledWith("codex", undefined);
  });
});

it("downloads a missing CLI and continues without a terminal", async () => {
  const missing = {
    id: "codex",
    source: "none",
    executable: null,
    version: null,
    managedVersion: null,
    pinnedVersion: null,
    latestVersion: null,
    autoUpdate: true,
    customPath: null,
    phase: "idle",
    progress: null,
    error: null,
    checkedAt: null,
  };
  const installCli = vi
    .fn()
    .mockResolvedValue({ ...missing, source: "managed", version: "1.0", managedVersion: "1.0" });
  vi.stubGlobal("openbot", {
    subscriptions: { listCli: async () => [missing], installCli },
    agent: { onEvent: () => () => {} },
  });
  const onSave = renderSetup();
  await fireEvent.click(screen.getByRole("button", { name: /Use this computer/ }));
  const download = await screen.findByRole("button", { name: "Pobierz i przejdź dalej" });
  expect(screen.getByRole("button", { name: "Continue with Codex" })).toBeDisabled();
  await fireEvent.click(download);
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith("codex", undefined));
});
