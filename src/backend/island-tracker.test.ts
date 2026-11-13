import type {
  AgentActivity,
  AgentEvent,
  ConversationMessage,
  IslandState,
  PendingAgentRequest,
} from "@openbot/contracts/ipc";
import { beforeEach, describe, expect, it } from "vitest";
import { IslandTracker } from "./island-tracker";

const bots = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Bob" },
];

function activity(botId: string, kind: AgentActivity["kind"], error: AgentActivity["error"] = null): AgentActivity {
  return { botId, kind, pendingRequests: 0, limit: null, error, updatedAt: "2026-11-13T10:00:00.000Z" };
}

function message(id: string, author: ConversationMessage["author"], text: string): ConversationMessage {
  return { id, author, text, createdAt: "2026-11-13T10:00:00.000Z", status: "completed" };
}

function conversation(botId: string, messages: ConversationMessage[]): AgentEvent {
  return { type: "conversation", snapshot: { botId, threadId: "t", activeTurnId: null, revision: 1, messages } };
}

const prompt: PendingAgentRequest = {
  kind: "prompt",
  requestId: 7,
  botId: "a",
  threadId: "t",
  turnId: "u",
  questions: [{ id: "q", header: "Q", question: "Which folder?", isSecret: false, options: null }],
  createdAt: "2026-11-13T10:00:01.000Z",
};

const takeover: PendingAgentRequest = {
  kind: "browser-takeover",
  phase: "requested",
  request: {
    requestId: "tk",
    botId: "b",
    threadId: "t",
    turnId: "u",
    tabId: "tab",
    url: "https://example.com/login",
    reason: "Sign in to continue",
    createdAt: "2026-11-13T10:00:02.000Z",
  },
};

const draft: PendingAgentRequest = {
  kind: "draft-preview",
  card: {
    requestId: "d1",
    botId: "b",
    threadId: "t",
    turnId: "u",
    variant: "draft",
    title: "Send this e-mail to Anna?",
    recipient: "Anna",
    channel: "email",
    preview: "Hi",
    draftId: null,
    createdAt: "2026-11-13T10:00:03.000Z",
  },
};

function takeoverOf(botId: string): PendingAgentRequest {
  return {
    kind: "browser-takeover",
    phase: "requested",
    request: {
      requestId: "tk",
      botId,
      threadId: "t",
      turnId: "u",
      tabId: "tab",
      url: "https://example.com/login",
      reason: "Sign in to continue",
      createdAt: "2026-11-13T10:00:02.000Z",
    },
  };
}

describe("IslandTracker", () => {
  let pending: PendingAgentRequest[];
  let activities: AgentActivity[];
  let focused: boolean;
  let emitted: IslandState[];
  let tracker: IslandTracker;

  beforeEach(() => {
    pending = [];
    activities = [activity("a", "idle"), activity("b", "idle")];
    focused = false;
    emitted = [];
    tracker = new IslandTracker({
      listBots: () => bots,
      listPending: () => pending,
      listActivity: () => activities,
      mainWindowFocused: () => focused,
      enabled: () => true,
      emit: (state) => emitted.push(state),
      now: () => new Date("2026-11-13T10:05:00Z"),
    });
  });

  it("is empty when nothing happens", () => {
    expect(tracker.state()).toEqual({ enabled: true, status: null, waiting: 0, working: 0 });
  });

  it("shows work in progress and counts working agents", () => {
    activities = [activity("a", "working"), activity("b", "working")];
    tracker.observe({ type: "activity-changed", activity: activity("a", "working") });
    const state = tracker.state();
    expect(state.status).toMatchObject({ kind: "working", botId: "a", botName: "Ada", request: null });
    expect(state.working).toBe(2);
    expect(emitted).toHaveLength(1);
  });

  it("shows the most urgent card: takeover before approval before question", () => {
    pending = [prompt, draft, takeover];
    tracker.observe({ type: "approval-resolved", requestId: 1, botId: "a", resolution: "accepted" });
    expect(tracker.state().status).toMatchObject({
      kind: "takeover",
      botId: "b",
      botName: "Bob",
      summary: "Sign in to continue",
      request: { kind: "browser-takeover", requestId: "tk" },
    });
    expect(tracker.state().waiting).toBe(3);
    pending = [prompt, draft];
    tracker.refresh();
    expect(tracker.state().status).toMatchObject({ kind: "approval", summary: "Send this e-mail to Anna?" });
    pending = [prompt];
    tracker.refresh();
    expect(tracker.state().status).toMatchObject({
      kind: "question",
      summary: "Which folder?",
      request: { kind: "prompt", requestId: 7 },
    });
  });

  it("shows an error until dismissed, and again for a new error", () => {
    activities = [activity("a", "error", { code: "x", message: "Codex stopped", at: "2026-11-13T10:01:00Z" })];
    tracker.refresh();
    expect(tracker.state().status).toMatchObject({ kind: "error", summary: "Codex stopped" });
    tracker.dismiss();
    expect(tracker.state().status).toBeNull();
    activities = [activity("a", "error", { code: "x", message: "Again", at: "2026-11-13T10:02:00Z" })];
    tracker.refresh();
    expect(tracker.state().status).toMatchObject({ kind: "error", summary: "Again" });
  });

  it("shows a new reply as a message when the main window is not focused", () => {
    tracker.observe(conversation("a", [message("m1", "user", "hi")]));
    expect(tracker.state().status).toBeNull();
    tracker.observe(conversation("a", [message("m1", "user", "hi"), message("m2", "assistant", "Done.\nDetails")]));
    expect(tracker.state().status).toMatchObject({ kind: "message", botId: "a", summary: "Done." });
    tracker.dismiss();
    expect(tracker.state().status).toBeNull();
  });

  it("ignores the first snapshot, streaming replies and replies seen in a focused window", () => {
    tracker.observe(conversation("a", [message("m1", "assistant", "old")]));
    expect(tracker.state().status).toBeNull();
    tracker.observe(conversation("a", [{ ...message("m2", "assistant", "par"), status: "streaming" }]));
    expect(tracker.state().status).toBeNull();
    focused = true;
    tracker.observe(conversation("a", [message("m2", "assistant", "partial done")]));
    expect(tracker.state().status).toBeNull();
  });

  it("clears messages when the main window gets focus", () => {
    tracker.observe(conversation("a", []));
    tracker.observe(conversation("a", [message("m2", "assistant", "Done.")]));
    tracker.mainWindowFocused();
    expect(tracker.state().status).toBeNull();
  });

  it("activate returns the card to open and clears a message", () => {
    pending = [prompt];
    tracker.refresh();
    expect(tracker.activate()).toEqual({ botId: "a", request: { kind: "prompt", requestId: 7 } });
    pending = [];
    tracker.observe(conversation("b", []));
    tracker.observe(conversation("b", [message("m2", "assistant", "Done.")]));
    expect(tracker.activate()).toEqual({ botId: "b", request: null });
    expect(tracker.state().status).toBeNull();
    expect(tracker.activate()).toBeNull();
  });

  it("skips agents that no longer exist and cuts long summaries", () => {
    pending = [takeoverOf("gone")];
    tracker.refresh();
    expect(tracker.state().status).toBeNull();
    activities = [activity("a", "error", { code: "x", message: "y".repeat(500), at: "z" })];
    tracker.refresh();
    expect(tracker.state().status?.summary.length).toBe(120);
  });

  it("emits only when the state changes", () => {
    tracker.refresh();
    tracker.refresh();
    expect(emitted).toHaveLength(0);
    pending = [prompt];
    tracker.refresh();
    tracker.refresh();
    expect(emitted).toHaveLength(1);
  });
});
