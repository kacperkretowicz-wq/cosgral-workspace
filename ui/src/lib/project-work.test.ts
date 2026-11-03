// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import type { Agent, Issue } from "@paperclipai/shared";
import { projectWorkGraph, readProjectWorkView, taskExecution, taskProgress } from "./project-work";
const agent = (id: string, reportsTo: string | null = null) => ({ id, name: id, reportsTo, role: "engineer", status: "idle", adapterType: "codex_local", adapterConfig: { model: "configured", env: { SECRET: "never-display" } }, runtimeConfig: {} }) as unknown as Agent;
const task = (id: string, extra: Partial<Issue> = {}) => ({ id, title: id, status: "todo", assigneeAgentId: null, parentId: null, ...extra }) as Issue;
describe("project work projections", () => {
  it("renders only allowlisted execution metadata and honors task model override", () => {
    expect(taskExecution(task("t", { assigneeAdapterOverrides: { adapterConfig: { model: "override" } } }), agent("a"))).toEqual({ model: "override", harness: "codex_local", source: "cli" });
    expect(JSON.stringify(taskExecution(task("t"), agent("a")))).not.toContain("never-display");
  });
  it("does not infer a subscription from CLI or treat arbitrary credentials as labels", () => {
    const a = agent("a"); a.runtimeConfig.aiConnection = { mode: "responsible_user", provider: "openai", method: "subscription" };
    expect(taskExecution(task("t"), a).source).toBe("responsible_user");
    a.runtimeConfig = { aiConnection: { token: "never-display" } } as unknown as Agent["runtimeConfig"];
    expect(taskExecution(task("t"), a).source).toBe("cli");
  });
  it("counts completed children and never invents an in-progress percentage", () => {
    const parent = task("p", { status: "in_progress" });
    expect(taskProgress(parent, [parent])).toEqual({ done: 0, total: 1 });
    expect(taskProgress(parent, [task("a", { parentId: "p", status: "done" }), task("b", { parentId: "p" }), task("c", { parentId: "p", status: "cancelled" })])).toEqual({ done: 1, total: 2 });
  });
  it("uses actual reportsTo, assignment, author, parent and blocker directions", () => {
    const result = projectWorkGraph([task("one", { assigneeAgentId: "worker", createdByAgentId: "coordinator" }), task("two", { parentId: "one", blockedBy: [{ id: "one" }, { id: "private" }] as Issue["blockedBy"] })], [agent("coordinator"), agent("worker", "coordinator"), agent("unrelated")], "coordinator");
    expect(result.roots[0].id).toBe("coordinator");
    expect(result.roots[0].reports[0].reports[0].id).toBe("one");
    expect(result.edges).toContainEqual({ from: "one", to: "two", kind: "dependency" });
    expect(result.edges).toContainEqual({ from: "one", to: "two", kind: "delegation" });
    expect(result.edges).toContainEqual({ from: "coordinator", to: "one", kind: "delegation" });
    expect(JSON.stringify(result)).not.toContain("private"); expect(JSON.stringify(result)).not.toContain("unrelated");
  });
  it("keeps cyclic and unassigned records reachable", () => {
    const result = projectWorkGraph([task("t", { assigneeAgentId: "a" }), task("unassigned")], [agent("a", "b"), agent("b", "a")], "a");
    expect(result.roots.map(node => node.id)).toEqual(["a", "b", "unassigned"]);
    expect(result.roots[0].reports[0].id).toBe("t");
  });
  it("defaults unknown persisted views to chat and scopes preferences by key", () => {
    localStorage.setItem("alice:p", "table"); localStorage.setItem("bob:p", "invalid");
    expect(readProjectWorkView("alice:p")).toBe("table"); expect(readProjectWorkView("bob:p")).toBe("chat");
  });
});
