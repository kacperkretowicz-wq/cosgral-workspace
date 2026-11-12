import { describe, expect, it } from "vitest";
import { isAgentEvent, isPendingAgentRequest, isSidebarLayout } from "./ipc";

const AT = "2026-11-12T20:00:00.000Z";

describe("W1 agent events", () => {
  it("accepts resolved prompts and approvals so a reloaded window can drop their cards", () => {
    expect(isAgentEvent({ type: "prompt-resolved", requestId: 7, botId: "chief", resolution: "answered" })).toBe(true);
    expect(
      isAgentEvent({ type: "approval-resolved", requestId: "eyes-1", botId: "chief", resolution: "expired" }),
    ).toBe(true);
    expect(isAgentEvent({ type: "prompt-resolved", requestId: 7, botId: "chief", resolution: "maybe" })).toBe(false);
    expect(isAgentEvent({ type: "approval-resolved", botId: "chief", resolution: "accepted" })).toBe(false);
  });

  it("accepts the agent row state with its waiting, limit and error details", () => {
    expect(
      isAgentEvent({
        type: "activity-changed",
        activity: {
          botId: "chief",
          kind: "limited",
          pendingRequests: 0,
          limit: { provider: "codex", limitId: "codex", resetsAt: 1_794_520_000 },
          error: null,
          updatedAt: AT,
        },
      }),
    ).toBe(true);
    expect(isAgentEvent({ type: "activity-changed", activity: { botId: "chief", kind: "sleeping" } })).toBe(false);
  });

  it("accepts sidebar folders, channels and channel tasks", () => {
    expect(
      isAgentEvent({
        type: "sidebar-layout-changed",
        layout: {
          folders: [
            { id: "f1", name: "Sales", parentId: null, position: 0, collapsed: false, createdAt: AT, updatedAt: AT },
          ],
          placements: [{ itemKind: "agent", itemId: "chief", folderId: "f1", position: 0 }],
        },
      }),
    ).toBe(true);
    expect(isAgentEvent({ type: "channels-changed", channels: [] })).toBe(true);
    expect(
      isAgentEvent({
        type: "task-changed",
        task: {
          id: "t1",
          channelId: "c1",
          ownerBotId: "chief",
          state: "running",
          title: "Prepare the report",
          requestMessageId: "m1",
          resultMessageId: null,
          parentTaskId: null,
          dependencyTaskIds: [],
          resourceKey: null,
          assignmentCount: 1,
          archivedAt: null,
          createdAt: AT,
          updatedAt: AT,
        },
      }),
    ).toBe(true);
    expect(isAgentEvent({ type: "task-changed", task: { id: "t1", state: "archived" } })).toBe(false);
  });

  it("accepts the draft preview card and the browser takeover request", () => {
    expect(
      isAgentEvent({
        type: "draft-preview",
        card: {
          requestId: "d1",
          botId: "chief",
          threadId: "thread-1",
          turnId: "turn-1",
          title: "Send this e-mail?",
          recipient: "Anna",
          channel: "email",
          preview: "Hi Anna, …",
          createdAt: AT,
        },
      }),
    ).toBe(true);
    expect(
      isAgentEvent({ type: "draft-preview-resolved", requestId: "d1", botId: "chief", resolution: "keep-draft" }),
    ).toBe(true);
    expect(isAgentEvent({ type: "draft-preview-resolved", requestId: "d1", botId: "chief", resolution: "sent" })).toBe(
      false,
    );
    expect(
      isAgentEvent({
        type: "browser-takeover",
        request: {
          requestId: "b1",
          botId: "chief",
          threadId: "thread-1",
          turnId: "turn-1",
          tabId: "tab-1",
          url: "https://example.com/login",
          reason: "Sign in to continue",
          createdAt: AT,
        },
      }),
    ).toBe(true);
    expect(isAgentEvent({ type: "browser-takeover-changed", requestId: "b1", botId: "chief", phase: "returned" })).toBe(
      true,
    );
    expect(isAgentEvent({ type: "browser-takeover-changed", requestId: "b1", botId: "chief", phase: "lost" })).toBe(
      false,
    );
  });
});

describe("W1 read models", () => {
  it("reads every kind of open card from the pending list", () => {
    const approval = {
      requestId: "eyes-1",
      botId: "chief",
      threadId: "thread-1",
      turnId: "turn-1",
      kind: "screen",
      command: null,
      cwd: null,
      reason: "Look at the test window",
      grantRoot: null,
      permissions: null,
    };
    expect(
      isPendingAgentRequest({
        kind: "prompt",
        requestId: 3,
        botId: "chief",
        threadId: "thread-1",
        turnId: "turn-1",
        questions: [],
        createdAt: AT,
      }),
    ).toBe(true);
    expect(isPendingAgentRequest({ kind: "approval", approval, createdAt: AT })).toBe(true);
    expect(isPendingAgentRequest({ kind: "draft-preview", card: { requestId: "d1", botId: "chief" } })).toBe(true);
    expect(
      isPendingAgentRequest({
        kind: "browser-takeover",
        request: { requestId: "b1", botId: "chief" },
        phase: "returned",
      }),
    ).toBe(false);
    expect(isPendingAgentRequest({ kind: "reminder", botId: "chief" })).toBe(false);
  });

  it("rejects a layout with a malformed folder or placement", () => {
    const folder = {
      id: "f1",
      name: "Sales",
      parentId: null,
      position: 0,
      collapsed: false,
      createdAt: AT,
      updatedAt: AT,
    };
    expect(isSidebarLayout({ folders: [folder], placements: [] })).toBe(true);
    expect(isSidebarLayout({ folders: [{ ...folder, parentId: 7 }], placements: [] })).toBe(false);
    expect(
      isSidebarLayout({
        folders: [],
        placements: [{ itemKind: "person", itemId: "u1", folderId: null, position: 0 }],
      }),
    ).toBe(false);
  });
});
