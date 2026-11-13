import type { AgentApproval, PendingAgentRequest } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockOpenBot, type MockOpenBotControls, type MockOpenBotOptions } from "../stories/mock-openbot";
import { App } from "./App";

let mock: MockOpenBotControls | undefined;

function controls(): MockOpenBotControls {
  if (!mock) throw new Error("Mount the app first.");
  return mock;
}

/** Mounts the app on a mock; pass `reuse` to open a second window on the same backend (a reload). */
function mountApp(options: MockOpenBotOptions = {}, reuse?: MockOpenBotControls) {
  mock = reuse ?? createMockOpenBot(options);
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  return render(() => <App />);
}

function approval(requestId: string, botId: string, command: string): AgentApproval {
  return {
    requestId,
    botId,
    threadId: `thread-${botId}`,
    turnId: "turn-1",
    kind: "command",
    command,
    cwd: null,
    reason: null,
    grantRoot: null,
    permissions: null,
  };
}

function pendingApproval(requestId: string, botId: string, command: string, createdAt: string): PendingAgentRequest {
  return { kind: "approval", approval: approval(requestId, botId, command), createdAt };
}

function pendingPrompt(requestId: string, botId: string, question: string, createdAt: string): PendingAgentRequest {
  return {
    kind: "prompt",
    requestId,
    botId,
    threadId: `thread-${botId}`,
    turnId: "turn-1",
    questions: [{ id: "q1", header: "", question, isSecret: false, options: [{ label: "Better", description: "" }] }],
    createdAt,
  };
}

const openCards: PendingAgentRequest[] = [
  pendingPrompt("p1", "research", "Which variant?", "2026-11-12T10:00:01.000Z"),
  pendingApproval("a1", "chief", "bun run build", "2026-11-12T10:00:02.000Z"),
  pendingApproval("a2", "chief", "bun run test", "2026-11-12T10:00:03.000Z"),
];

function needsYou() {
  return within(screen.getByRole("region", { name: /Needs you/ }));
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
});

afterEach(() => {
  mock?.dispose();
  mock = undefined;
});

describe("App open cards after a reload", () => {
  it("restores a Vault request and resolves the chosen candidate", async () => {
    const request = {
      requestId: "vault-1",
      botId: "chief",
      threadId: "t",
      turnId: "turn",
      mode: "choose" as const,
      kind: "login" as const,
      reason: "Sign in",
      origin: "https://example.com",
      label: null,
      candidateIds: ["vault-demo"],
      createdAt: "2026-11-12T10:00:00Z",
    };
    mountApp({ pendingRequests: [{ kind: "vault-request", request }] });
    const decision = within(await screen.findByRole("region", { name: "Decision" }));
    expect(needsYou().getByText("Sign in")).toBeInTheDocument();
    await fireEvent.click(await decision.findByRole("button", { name: /Demo login/ }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Decision" })).not.toBeInTheDocument());
  });
  it("shows browser requests in Needs you and updates the pinned action", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    controls().emitAgentEvent({
      type: "browser-takeover",
      request: {
        requestId: "b1",
        botId: "chief",
        threadId: "thread-chief",
        turnId: "turn-1",
        tabId: "tab-1",
        url: "https://example.com",
        reason: "Sign in",
        createdAt: "2026-11-12T10:00:00.000Z",
      },
    });
    const decision = await screen.findByRole("region", { name: "Decision" });
    expect(needsYou().getByText("Sign in")).toBeInTheDocument();
    await fireEvent.click(within(decision).getByRole("button", { name: "Take over" }));
    await within(decision).findByRole("button", { name: "Return to agent" });
    await waitFor(() => expect(within(decision).getByRole("button", { name: "Return to agent" })).toBeEnabled());
    await fireEvent.click(within(decision).getByRole("button", { name: "Return to agent" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Decision" })).not.toBeInTheDocument());
  });
  it("restores a draft in chat and Decision, then keeps it without sending", async () => {
    const card = {
      requestId: "d1",
      botId: "chief",
      threadId: "thread-chief",
      turnId: "turn-1",
      variant: "draft" as const,
      title: "Send the update?",
      recipient: "Alex",
      channel: "email",
      preview: "Exact message",
      draftId: null,
      createdAt: "2026-11-12T10:00:00.000Z",
    };
    mountApp({ pendingRequests: [{ kind: "draft-preview", card }] });
    const decision = await screen.findByRole("region", { name: "Decision" });
    expect(within(decision).getByText("Exact message")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Exact message")).toHaveLength(2));
    expect(needsYou().getByText("Send the update?")).toBeInTheDocument();
    await fireEvent.click(within(decision).getByRole("button", { name: "Keep draft" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Decision" })).not.toBeInTheDocument());
    expect(await controls().api.agent.listDrafts?.()).toHaveLength(1);
  });
  it("seeds Needs you and the pinned Decision from listPendingRequests", async () => {
    mountApp({ pendingRequests: openCards });
    await screen.findByRole("heading", { name: "Chief" });

    const section = await screen.findByRole("region", { name: /Needs you/ });
    expect(within(section).getAllByRole("button")).toHaveLength(3);
    expect(within(section).getByText("Which variant?")).toBeInTheDocument();
    expect(within(section).getByText("bun run build")).toBeInTheDocument();
    // Chief is open: its oldest card is the pinned Decision.
    const decision = within(await screen.findByRole("region", { name: "Decision" }));
    expect(decision.getByText("bun run build")).toBeInTheDocument();
    expect(decision.queryByText("bun run test")).not.toBeInTheDocument();
  });

  it("keeps a card that was open when the window reloaded", async () => {
    const first = mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    const backend = controls();
    backend.emitAgentEvent({ type: "approval", approval: approval("live-1", "chief", "git push") });
    expect(await screen.findByRole("region", { name: "Decision" })).toHaveTextContent("git push");

    first.unmount();
    expect(screen.queryByRole("region", { name: "Decision" })).not.toBeInTheDocument();

    mountApp({}, backend);
    const decision = await screen.findByRole("region", { name: "Decision" });
    expect(decision).toHaveTextContent("git push");
    expect(needsYou().getByText("git push")).toBeInTheDocument();
  });

  it("shows nothing extra when the backend holds no open cards", async () => {
    mountApp();
    await screen.findByRole("heading", { name: "Chief" });
    expect(screen.queryByRole("region", { name: "Decision" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Needs you" })).not.toBeInTheDocument();
  });

  it("still starts when the backend has no card list yet", async () => {
    const backend = createMockOpenBot();
    mock = backend;
    const agent = { ...backend.api.agent, listPendingRequests: undefined, listActivity: undefined };
    Object.defineProperty(window, "openbot", { configurable: true, value: { ...backend.api, agent } });
    render(() => <App />);
    expect(await screen.findByRole("heading", { name: "Chief" })).toBeInTheDocument();
  });
});

describe("App resolved cards", () => {
  it("drops a question when prompt-resolved arrives, also from another window", async () => {
    mountApp({ pendingRequests: openCards });
    await screen.findByRole("heading", { name: "Chief" });
    await within(await screen.findByRole("region", { name: /Needs you/ })).findByText("Which variant?");

    controls().emitAgentEvent({ type: "prompt-resolved", requestId: "p1", botId: "research", resolution: "answered" });
    await waitFor(() => expect(needsYou().queryByText("Which variant?")).not.toBeInTheDocument());
    expect(needsYou().getByText("bun run build")).toBeInTheDocument();
  });

  it("drops only the resolved approval and pins the next one of the same agent", async () => {
    mountApp({ pendingRequests: openCards });
    await screen.findByRole("heading", { name: "Chief" });
    const decision = await screen.findByRole("region", { name: "Decision" });
    expect(decision).toHaveTextContent("bun run build");

    controls().emitAgentEvent({ type: "approval-resolved", requestId: "a1", botId: "chief", resolution: "declined" });
    await waitFor(() => expect(screen.getByRole("region", { name: "Decision" })).toHaveTextContent("bun run test"));
    expect(screen.getByRole("region", { name: "Decision" })).not.toHaveTextContent("bun run build");
    expect(needsYou().queryByText("bun run build")).not.toBeInTheDocument();
    expect(needsYou().getByText("bun run test")).toBeInTheDocument();

    controls().emitAgentEvent({ type: "approval-resolved", requestId: "a2", botId: "chief", resolution: "expired" });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Decision" })).not.toBeInTheDocument());
  });

  it("answers the oldest card, the backend resolves it, and the next card shows", async () => {
    mountApp({ pendingRequests: openCards });
    await screen.findByRole("heading", { name: "Chief" });
    const decision = await screen.findByRole("region", { name: "Decision" });
    await fireEvent.click(within(decision).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Decision" })).toHaveTextContent("bun run test"));
    expect(
      controls()
        .pendingRequests()
        .map((card) => card.kind),
    ).toEqual(["prompt", "approval"]);
  });

  it("clears every card of an agent whose turn ends", async () => {
    mountApp({ pendingRequests: openCards });
    await screen.findByRole("region", { name: "Decision" });
    controls().emitAgentEvent({
      type: "turn-completed",
      botId: "chief",
      threadId: "thread-chief",
      turnId: "turn-1",
      status: "interrupted",
    });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Decision" })).not.toBeInTheDocument());
    expect(needsYou().getAllByRole("button")).toHaveLength(1);
  });

  it("adds cards from live events next to the hydrated ones", async () => {
    mountApp({ pendingRequests: [pendingPrompt("p1", "research", "Which variant?", "2026-11-12T10:00:01.000Z")] });
    await within(await screen.findByRole("region", { name: /Needs you/ })).findByText("Which variant?");
    controls().emitAgentEvent({ type: "approval", approval: approval("a9", "chief", "rm -rf build") });
    expect(
      await within(screen.getByRole("region", { name: "Decision" })).findByText("rm -rf build"),
    ).toBeInTheDocument();
    expect(needsYou().getAllByRole("button")).toHaveLength(2);
  });
});
