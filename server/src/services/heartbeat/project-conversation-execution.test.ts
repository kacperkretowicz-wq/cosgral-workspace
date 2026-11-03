import { describe, expect, it } from "vitest";
import { conversationExecutionRole, protectConversationConfig } from "./project-conversation-execution.js";

const root = { id: "root", companyId: "c", projectId: "p", parentId: null, originKind: "cosgral_project_conversation" };
describe("project conversation execution boundary", () => {
  it("recognizes coordinator and nested workers from stored ancestry only", async () => {
    const child = { ...root, id: "child", parentId: root.id, originKind: "issue" };
    const nested = { ...child, id: "nested", parentId: child.id };
    const read = async (id: string) => [root, child].find(row => row.id === id) ?? null;
    expect(await conversationExecutionRole(root, read)).toBe("coordinator");
    expect(await conversationExecutionRole(nested, read)).toBe("worker");
    expect(await conversationExecutionRole({ ...child, parentId: null }, read)).toBeNull();
  });
  it("fails closed for broken or cross-project ancestry", async () => {
    const child = { ...root, id: "child", parentId: root.id, originKind: "issue" };
    await expect(conversationExecutionRole(child, async () => null)).rejects.toThrow();
    await expect(conversationExecutionRole(child, async () => ({ ...root, projectId: "other" }))).rejects.toThrow();
    await expect(conversationExecutionRole(child, async () => child)).rejects.toThrow();
  });
  it("preserves ordinary cross-project task ancestry", async () => {
    const ordinary = { ...root, originKind: "issue", projectId: "other" };
    const child = { ...root, id: "child", parentId: root.id, originKind: "issue" };
    expect(await conversationExecutionRole(child, async () => ordinary)).toBeNull();
  });
  it("replaces unsafe overrides and pins separate task/agent branches", () => {
    const unsafe = { dangerouslyBypassApprovalsAndSandbox: true, extraArgs: ["--yolo"], filesystemExtraPaths: ["/"], workspaceStrategy: { existingBranch: "main" } };
    const worker = protectConversationConfig(unsafe, "worker");
    expect(worker.workspaceStrategy).toEqual({ type: "git_worktree", branchTemplate: "cosgral/{{issue.id}}/{{agent.id}}" });
    expect(worker.dangerouslyBypassApprovalsAndSandbox).toBe(false);
    expect(worker.extraArgs).toEqual([]);
    expect(worker.filesystemScope).toBe("workspace");
    expect(worker.filesystemExtraPaths).toEqual([]);
    expect(protectConversationConfig(unsafe, "coordinator").workspaceStrategy).toEqual({ type: "git_worktree", branchTemplate: "cosgral-coordinator/{{issue.id}}/{{agent.id}}" });
  });
});
