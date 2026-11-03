import { describe, expect, it } from "vitest";
import { assertProjectConversationMutation, PROJECT_CONVERSATION_ORIGIN } from "./project-conversation-policy.js";

describe("project conversation mutation policy", () => {
  const conversation = { originKind: PROJECT_CONVERSATION_ORIGIN, companyId: "company", projectId: "project", visibility: "open" };

  it.each([
    { status: "done" }, { status: "cancelled" }, { status: "in_review" }, { status: "blocked" }, { hiddenAt: new Date() },
    { projectId: "different" }, { companyId: "different" }, { visibility: "private" },
    { parentId: "task" }, { originKind: "manual" },
  ])("rejects a change that breaks the shared thread: %j", (patch) => {
    expect(() => assertProjectConversationMutation(conversation, patch)).toThrow(/shared project conversation/i);
  });

  it("allows ordinary updates and leaves normal tasks unaffected", () => {
    expect(() => assertProjectConversationMutation(conversation, { status: "todo", projectId: "project" })).not.toThrow();
    expect(() => assertProjectConversationMutation({ ...conversation, originKind: "manual" }, { status: "done" })).not.toThrow();
  });
});
