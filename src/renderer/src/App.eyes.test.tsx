import type { AgentEyesSession, AgentEyesState } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockOpenBot, type MockOpenBotControls, type MockOpenBotOptions } from "../stories/mock-openbot";
import { App } from "./App";

let mock: MockOpenBotControls | undefined;

function lookingSession(overrides: Partial<AgentEyesSession> = {}): AgentEyesSession {
  return {
    id: "eyes-1",
    botId: "research",
    threadId: "thread-research",
    turnId: "turn-1",
    source: "screen",
    targetLabel: "Screen 1",
    phase: "watching",
    framesCaptured: 1,
    framesPlanned: 4,
    startedAt: "2026-11-12T18:00:00.000Z",
    endsAt: "2026-11-12T18:05:00.000Z",
    ...overrides,
  };
}

function controls(): MockOpenBotControls {
  if (!mock) throw new Error("Mount the app first.");
  return mock;
}

function mountApp(options: MockOpenBotOptions = {}) {
  mock = createMockOpenBot(options);
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  return render(() => <App />);
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
});

afterEach(() => {
  mock?.dispose();
  mock = undefined;
});

describe("App agent eyes", () => {
  it("loads the initial eyes state and shows who is looking", async () => {
    const state: AgentEyesState = { sessions: [lookingSession()], grants: [] };
    mountApp({ eyesState: state });
    const bar = await screen.findByRole("status", { name: "Agent eyes" });
    expect(bar).toHaveTextContent("Research");
    expect(bar).toHaveTextContent("Screen 1");
    expect(bar).toHaveTextContent("1 / 4 frames");
    const row = await screen.findByRole("button", { name: /^Research,.*Looking\./ });
    expect(row).toBeInTheDocument();
  });

  it("follows eyes-changed events and Stop clears the session through the API", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    expect(screen.queryByRole("status", { name: "Agent eyes" })).not.toBeInTheDocument();
    const stop = vi.spyOn(controls().api.agent, "stopEyes");

    controls().emitEyesState({
      sessions: [lookingSession({ id: "eyes-2", botId: "chief", targetLabel: "Camera", source: "camera" })],
      grants: [],
    });
    const bar = await screen.findByRole("status", { name: "Agent eyes" });
    expect(bar).toHaveTextContent("Chief");
    expect(bar).toHaveTextContent("Camera");

    await fireEvent.click(within(bar).getByRole("button", { name: "Stop Chief looking" }));
    expect(stop).toHaveBeenCalledWith({ botId: "chief" });
    await waitFor(() => expect(screen.queryByRole("status", { name: "Agent eyes" })).not.toBeInTheDocument());
  });

  it("titles a screen approval clearly in the pinned decision", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    controls().emitAgentEvent({
      type: "approval",
      approval: {
        requestId: "eyes-approval",
        botId: "chief",
        threadId: "thread-chief",
        turnId: "turn-1",
        kind: "screen",
        command: null,
        cwd: null,
        reason: null,
        grantRoot: null,
        permissions: null,
        eyes: { source: "screen", targetLabel: "Screen 1", live: true, frames: 3, intervalSeconds: 2 },
      },
    });
    const decision = within(await screen.findByRole("region", { name: "Decision" }));
    expect(decision.getByText("Allow screen access?")).toBeInTheDocument();
    expect(decision.getByText("Live preview · 3 frames every 2s")).toBeInTheDocument();
    expect(screen.queryByText("Grant permissions?")).not.toBeInTheDocument();
  });
});

describe("App local profile", () => {
  it("hides Sign out and the technical email for the local profile", async () => {
    mountApp({
      authState: {
        status: "signed_in",
        localProfile: true,
        user: { id: "local-owner", email: "owner@cosgral.local", name: "Owner", avatarUrl: null },
      },
    });
    await screen.findByRole("heading", { name: "Chief" });
    await fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(await screen.findByRole("button", { name: /Weekly usage/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.queryByText("owner@cosgral.local")).not.toBeInTheDocument();
  });

  it("keeps Sign out for a normal account", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    await fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
  });
});

describe("App page rail", () => {
  it("opens the other pages and keeps the agent list mounted", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    const list = screen.getByRole("navigation", { name: "Chat list" });

    // W3-BE9: Tasks is a real page now (channel tasks), no longer Coming soon.
    await fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(await screen.findByRole("heading", { name: "Tasks", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Chief" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Chat list" })).toBe(list);
    expect(screen.getByRole("button", { name: "Tasks" })).toHaveAttribute("aria-current", "page");

    await fireEvent.click(screen.getByRole("button", { name: "Marketplace" }));
    expect(await screen.findByRole("heading", { name: "Marketplace", level: 1 })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Agents" }));
    expect(await screen.findByRole("heading", { name: "Chief" })).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Chat list" })).toBe(list);
  });

  it("returns to Agents when an agent is picked in the sidebar", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    await fireEvent.click(screen.getByRole("button", { name: "Usage" }));
    await screen.findByRole("heading", { name: "Usage", level: 1 });
    await fireEvent.click(screen.getByRole("button", { name: /^Research,/ }));
    expect(await screen.findByRole("heading", { name: "Research" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Usage", level: 1 })).not.toBeInTheDocument();
  });

  it("opens the existing settings dialog from the rail without changing page", async () => {
    const view = mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    expect(view.container.querySelector(".initial-setup-screen")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await waitFor(() => expect(view.container.querySelector(".initial-setup-screen")).not.toBeNull());
    // The dialog hides the rest of the app from assistive tech, so look past `aria-hidden`.
    expect(screen.getByRole("button", { name: "Agents", hidden: true })).toHaveAttribute("aria-current", "page");
  });
});
