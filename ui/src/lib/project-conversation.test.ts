import { describe, expect, it } from "vitest";
import { conversationTasks, agentHierarchy } from "./project-conversation";

describe("conversation project data", () => {
  it("counts accessible project work, excludes cancelled tasks and the conversation", () => {
    const result = conversationTasks([
      { id: "chat", projectId: "p", status: "backlog", assigneeAgentId: null },
      { id: "1", projectId: "p", status: "done", assigneeAgentId: "a" },
      { id: "2", projectId: "p", status: "in_progress", assigneeAgentId: "b" },
      { id: "3", projectId: "p", status: "cancelled", assigneeAgentId: "a" },
      { id: "4", projectId: "other", status: "done", assigneeAgentId: "a" },
    ], "p", "chat");
    expect(result.tasks.map(task => task.id)).toEqual(["1", "2"]);
    expect(result.percent).toBe(50);
    expect(result.done).toBe(1);
  });
  it("has no cards for empty or cancelled-only work", () => {
    expect(conversationTasks([], "p", "chat")).toEqual({ tasks: [], done: 0, percent: 0 });
    expect(conversationTasks([{ id: "1", projectId: "p", status: "cancelled", assigneeAgentId: null }], "p", "chat").tasks).toEqual([]);
  });
  it("orders reports below their manager, retaining orphaned and cyclic agents once", () => {
    const rows = agentHierarchy([
      { id: "child", reportsTo: "root", name: "A" },
      { id: "root", reportsTo: null, name: "B" },
      { id: "orphan", reportsTo: "missing", name: "C" },
      { id: "x", reportsTo: "y", name: "X" },
      { id: "y", reportsTo: "x", name: "Y" },
    ]);
    expect(rows.slice(0, 3).map(row => [row.agent.id, row.depth])).toEqual([["root", 0], ["child", 1], ["orphan", 0]]);
    expect(new Set(rows.map(row => row.agent.id)).size).toBe(5);
  });
});
