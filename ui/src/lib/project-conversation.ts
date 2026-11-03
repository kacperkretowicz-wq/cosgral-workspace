import type { Agent, Issue } from "@paperclipai/shared";

type Task = Pick<Issue, "id" | "projectId" | "status" | "assigneeAgentId">;
/** These are accessible project tasks, not evidence of automatic delegation. */
export function conversationTasks<T extends Task>(issues: T[], projectId: string, conversationId: string) {
  const tasks = issues.filter(task => task.projectId === projectId && task.id !== conversationId && task.status !== "cancelled");
  const done = tasks.filter(task => task.status === "done").length;
  return { tasks, done, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}

export function agentHierarchy<T extends Pick<Agent, "id" | "reportsTo" | "name">>(agents: T[]) {
  const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(sorted.map(agent => agent.id));
  const children = new Map<string | null, T[]>();
  for (const agent of sorted) {
    const parent = agent.reportsTo && ids.has(agent.reportsTo) ? agent.reportsTo : null;
    children.set(parent, [...(children.get(parent) ?? []), agent]);
  }
  const result: Array<{ agent: T; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (agent: T, depth: number) => {
    if (visited.has(agent.id)) return;
    visited.add(agent.id);
    result.push({ agent, depth });
    for (const child of children.get(agent.id) ?? []) visit(child, depth + 1);
  };
  for (const agent of children.get(null) ?? []) visit(agent, 0);
  for (const agent of sorted) if (!visited.has(agent.id)) visit(agent, 0);
  return result;
}
