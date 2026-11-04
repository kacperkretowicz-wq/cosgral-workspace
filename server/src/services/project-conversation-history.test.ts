import { describe, expect, it } from "vitest";
import { classifyConversationEntry } from "@paperclipai/shared/project-conversation-history";

describe("deterministic project conversation classification", () => {
  it("classifies by durable provenance, not words in message text", () => {
    expect(classifyConversationEntry({ kind: "comment", authorUserId: "u" }, "c")).toBe("humans");
    expect(classifyConversationEntry({ kind: "comment", authorAgentId: "c" }, "c")).toBe("coordinator");
    expect(classifyConversationEntry({ kind: "comment", authorAgentId: "w" }, "c")).toBe("agents");
    expect(classifyConversationEntry({ kind: "comment", authorAgentId: "c", recipientAgentId: "w" }, "c")).toBe("agents");
    expect(classifyConversationEntry({ kind: "comment", authorType: "system" }, "c")).toBe("errors");
    expect(classifyConversationEntry({ kind: "error", authorAgentId: "c" }, "c")).toBe("errors");
    expect(classifyConversationEntry({ kind: "task", authorUserId: "u" }, "c")).toBe("tasks");
    expect(classifyConversationEntry({ kind: "comment", authorAgentId: "c", messageKind: "audit" }, "c")).toBe("errors");
    expect(classifyConversationEntry({ kind: "approval", authorAgentId: "c" }, "c")).toBe("tasks");
  });
});
