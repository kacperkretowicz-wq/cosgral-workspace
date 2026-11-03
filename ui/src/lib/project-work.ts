import { aiRuntimeConnectionBindingSchema, type Agent, type Issue } from "@paperclipai/shared";
import type { OrgNode } from "../api/agents";

export type ProjectWorkView = "chat" | "table" | "workflow";
export function readProjectWorkView(key: string): ProjectWorkView {
  try { const value = localStorage.getItem(key); return value === "table" || value === "workflow" ? value : "chat"; } catch { return "chat"; }
}
/** Deliberately allowlisted summary: never render env, credentials, paths or raw config JSON. */
export function taskExecution(task: Issue, agent?: Agent) {
  const model = task.assigneeAdapterOverrides?.adapterConfig?.model ?? agent?.adapterConfig?.model;
  const parsed = aiRuntimeConnectionBindingSchema.safeParse(agent?.runtimeConfig?.aiConnection);
  const binding = parsed.success ? parsed.data : undefined;
  return {
    model: typeof model === "string" ? model : null,
    harness: agent?.adapterType ?? null,
    source: binding?.mode === "router" ? "router" : binding?.mode === "responsible_user" ? "responsible_user" : binding?.method ?? (agent?.adapterType.endsWith("_local") ? "cli" : "unknown"),
  };
}
export function taskProgress(task: Issue, tasks: Issue[]) {
  const children = tasks.filter(child => child.parentId === task.id && child.status !== "cancelled");
  if (children.length) return { done: children.filter(child => child.status === "done").length, total: children.length };
  // No estimated percentage for a running task: only observed completion.
  return { done: task.status === "done" ? 1 : 0, total: 1 };
}
export interface WorkEdge { from: string; to: string; kind: "dependency" | "delegation" }
export function projectWorkGraph(tasks: Issue[], agents: Agent[], coordinatorId?: string | null) {
  const agentMap = new Map(agents.map(agent => [agent.id, agent]));
  const included = new Set<string>();
  function include(id: string | null | undefined) {
    while (id && agentMap.has(id) && !included.has(id)) { included.add(id); id = agentMap.get(id)?.reportsTo; }
  }
  include(coordinatorId);
  for (const task of tasks) { include(task.assigneeAgentId); include(task.createdByAgentId); }
  const nodes = new Map<string, OrgNode>();
  for (const id of included) { const agent = agentMap.get(id)!; nodes.set(id, { id, name: agent.name, role: agent.role, status: agent.status, reports: [] }); }
  for (const task of tasks) nodes.set(task.id, { id: task.id, name: task.title, role: "task", status: task.status, reports: [] });
  const roots: OrgNode[] = [];
  // A malformed hierarchy must not hide nodes or recurse forever.
  for (const id of included) {
    const parent = agentMap.get(id)?.reportsTo;
    const seen = new Set([id]); let cursor = parent; let cycle = false;
    while (cursor && included.has(cursor)) { if (seen.has(cursor)) { cycle = true; break; } seen.add(cursor); cursor = agentMap.get(cursor)?.reportsTo; }
    if (parent && nodes.has(parent) && !cycle) nodes.get(parent)!.reports.push(nodes.get(id)!); else roots.push(nodes.get(id)!);
  }
  const edges: WorkEdge[] = [];
  for (const task of tasks) {
    const node = nodes.get(task.id)!;
    if (task.assigneeAgentId && included.has(task.assigneeAgentId)) nodes.get(task.assigneeAgentId)!.reports.push(node); else roots.push(node);
    for (const blocker of task.blockedBy ?? []) if (nodes.has(blocker.id)) edges.push({ from: blocker.id, to: task.id, kind: "dependency" });
    if (task.parentId && nodes.has(task.parentId)) edges.push({ from: task.parentId, to: task.id, kind: "delegation" });
    if (task.createdByAgentId && included.has(task.createdByAgentId) && task.createdByAgentId !== task.assigneeAgentId) edges.push({ from: task.createdByAgentId, to: task.id, kind: "delegation" });
  }
  return { roots, edges };
}
