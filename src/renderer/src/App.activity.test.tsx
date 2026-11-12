import type { AgentActivity } from "@openbot/contracts/ipc";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockOpenBot, type MockOpenBotControls, type MockOpenBotOptions } from "../stories/mock-openbot";
import { App } from "./App";

let mock: MockOpenBotControls | undefined;

function controls(): MockOpenBotControls {
  if (!mock) throw new Error("Mount the app first.");
  return mock;
}

function mountApp(options: MockOpenBotOptions = {}) {
  mock = createMockOpenBot(options);
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  return render(() => <App />);
}

function activity(botId: string, overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    botId,
    kind: "idle",
    pendingRequests: 0,
    limit: null,
    error: null,
    updatedAt: "2026-11-12T12:00:00.000Z",
    ...overrides,
  };
}

const inTwoHours = () => Math.floor(Date.now() / 1000) + 2 * 3600;

function row(name: RegExp) {
  return screen.findByRole("button", { name });
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
});

afterEach(() => {
  mock?.dispose();
  mock = undefined;
});

describe("App agent row states", () => {
  it("shows the state the backend reports when the window starts", async () => {
    mountApp({
      activity: [
        activity("research", { kind: "working" }),
        activity("sales", {
          kind: "limited",
          limit: { provider: "codex", limitId: "codex", resetsAt: inTwoHours() },
        }),
        activity("chief", { kind: "waiting", pendingRequests: 1 }),
      ],
    });
    await screen.findByRole("heading", { name: "Chief" });
    expect(await row(/^Research, Research partner\. Thinking\./)).toBeInTheDocument();
    expect(await row(/^Sales Outbound, Outbound specialist\. Limit · resumes/)).toBeInTheDocument();
    expect(await row(/^Chief, Chief of staff\. Needs you\./)).toBeInTheDocument();
  });

  it("writes the local reset time on the limited row", async () => {
    const resetsAt = inTwoHours();
    mountApp({
      activity: [activity("sales", { kind: "limited", limit: { provider: "codex", limitId: "codex", resetsAt } })],
    });
    const limited = await row(/^Sales Outbound,/);
    const note = limited.querySelector<HTMLElement>(".bot-row-note");
    const reset = new Date(resetsAt * 1000);
    const hhmm = `${String(reset.getHours()).padStart(2, "0")}:${String(reset.getMinutes()).padStart(2, "0")}`;
    expect(note?.textContent).toContain("Limit · resumes");
    expect(note?.textContent).toContain(hhmm);
  });

  it("follows activity-changed events and clears the badge when the agent is idle again", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    const research = await row(/^Research, Research partner/);
    expect(research.querySelector(".bot-row-agent-status")).toBeNull();

    controls().emitActivity(activity("research", { kind: "working" }));
    await waitFor(() => expect(research.querySelector(".bot-row-agent-status-working")).not.toBeNull());

    controls().emitActivity(
      activity("research", {
        kind: "error",
        error: { code: "agent_error", message: "Codex stopped unexpectedly.", at: "2026-11-12T12:00:00.000Z" },
      }),
    );
    await waitFor(() => expect(research.querySelector(".bot-row-agent-status-error")).not.toBeNull());
    expect(research.querySelector(".bot-row-note")).toHaveTextContent("Error · Codex stopped unexpectedly.");

    controls().emitActivity(activity("research"));
    await waitFor(() => expect(research.querySelector(".bot-row-agent-status")).toBeNull());
    expect(research.querySelector(".bot-row-note")).toBeNull();
  });

  it("keeps the local needs-you badge while the backend has not reported the card yet", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    controls().emitAgentEvent({
      type: "prompt",
      requestId: "p1",
      botId: "research",
      threadId: "thread-research",
      turnId: "turn-1",
      questions: [],
    });
    expect(await row(/^Research, Research partner\. Needs you\./)).toBeInTheDocument();
  });
});
