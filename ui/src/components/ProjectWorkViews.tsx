import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ISSUE_STATUSES, ISSUE_PRIORITIES, type Agent, type Issue } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { projectWorkGraph, taskExecution, taskProgress, type ProjectWorkView } from "../lib/project-work";
import { OrgChart } from "../pages/OrgChart";
import { useCosgralTranslation } from "../i18n/cosgral";
import { Button } from "./ui/button";

const taskHref = (task: Issue) => `/issues/${task.identifier ?? task.id}`;
function TaskEvidence({ task }: { task: Issue }) {
  const { t } = useCosgralTranslation();
  const [enabled, setEnabled] = useState(false);
  const costs = useQuery({ queryKey: queryKeys.issues.costSummary(task.id), queryFn: () => issuesApi.getCostSummary(task.id), enabled });
  const results = useQuery({ queryKey: queryKeys.issues.workProducts(task.id), queryFn: () => issuesApi.listWorkProducts(task.id), enabled });
  return <>
    <td className="p-3 align-top">{!enabled ? <Button variant="ghost" size="sm" onClick={() => setEnabled(true)}>{t("work.checkEvidence")}</Button> : costs.isError ? <Button variant="ghost" onClick={() => void costs.refetch()}>{t("retry")}</Button> : costs.data ? <span title={t("work.costScope")}>{new Intl.NumberFormat("pl-PL", { style: "currency", currency: "USD" }).format(costs.data.costCents / 100)}</span> : t("work.loading")}</td>
    <td className="p-3 align-top">{results.isError ? <Button variant="ghost" onClick={() => void results.refetch()}>{t("retry")}</Button> : results.data?.length ? results.data.map(product => <Link key={product.id} className="block underline" to={taskHref(task)}>{product.title} · {product.status}</Link>) : <Link className="underline" to={taskHref(task)}>{t(enabled && results.isSuccess ? "work.noResult" : "work.openTask")}</Link>}</td>
  </>;
}

export function ProjectWorkViews({ view, tasks, agents, coordinatorId, onChat }: {
  view: Exclude<ProjectWorkView, "chat">; tasks: Issue[]; agents: Agent[]; coordinatorId?: string | null; onChat: (task: Issue) => void;
}) {
  const { t } = useCosgralTranslation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState("priority");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const agentMap = useMemo(() => new Map(agents.map(agent => [agent.id, agent])), [agents]);
  const filtered = tasks.filter(task => (!status || task.status === status) && (!priority || task.priority === priority) && (!assignee || (assignee === "unassigned" ? !task.assigneeAgentId : task.assigneeAgentId === assignee)) && `${task.title} ${task.identifier ?? ""} ${agentMap.get(task.assigneeAgentId ?? "")?.name ?? ""}`.toLocaleLowerCase("pl").includes(search.toLocaleLowerCase("pl"))).sort((a, b) => {
    let order = 0;
    if (sort === "priority") order = ISSUE_PRIORITIES.indexOf(a.priority) - ISSUE_PRIORITIES.indexOf(b.priority);
    else if (sort === "status") order = ISSUE_STATUSES.indexOf(a.status) - ISSUE_STATUSES.indexOf(b.status);
    else if (sort === "agent") order = (agentMap.get(a.assigneeAgentId ?? "")?.name ?? "").localeCompare(agentMap.get(b.assigneeAgentId ?? "")?.name ?? "", "pl");
    else order = a.title.localeCompare(b.title, "pl");
    return (descending ? -1 : 1) * (order || a.title.localeCompare(b.title, "pl") || a.id.localeCompare(b.id));
  });
  const graph = useMemo(() => projectWorkGraph(filtered, agents, coordinatorId), [tasks, agents, coordinatorId, search, status, priority, assignee, sort, descending]);
  const links = Object.fromEntries([...agents.map(agent => [agent.id, `/agents/${agent.id}`]), ...tasks.map(task => [task.id, taskHref(task)])]);
  const details = Object.fromEntries([...agents.map(agent => [agent.id, `${agent.id === coordinatorId ? t("coordinator") : agent.title ?? agent.role} · ${t(`status.${agent.status}`)}`]), ...tasks.map(task => [task.id, `${t("work.task")} · ${t(`status.${task.status}`)}`])]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
  const fieldClass = "rounded-md border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring";
  return <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4" aria-label={t(`work.${view}`)}>
    <div className="flex flex-wrap items-center gap-2">
      <input className={fieldClass} aria-label={t("work.search")} placeholder={t("work.search")} value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
      <select className={fieldClass} aria-label={t("work.status")} value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="">{t("work.allStatuses")}</option>{ISSUE_STATUSES.map(value => <option key={value} value={value}>{t(`status.${value}`)}</option>)}</select>
      <select className={fieldClass} aria-label={t("work.agent")} value={assignee} onChange={event => { setAssignee(event.target.value); setPage(0); }}><option value="">{t("work.allAgents")}</option><option value="unassigned">{t("pending")}</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
      <select className={fieldClass} aria-label={t("work.priority")} value={priority} onChange={event => { setPriority(event.target.value); setPage(0); }}><option value="">{t("work.allPriorities")}</option>{ISSUE_PRIORITIES.map(value => <option key={value} value={value}>{t(`work.priorities.${value}`)}</option>)}</select>
      <select className={fieldClass} aria-label={t("work.sort")} value={sort} onChange={event => setSort(event.target.value)}>{["priority", "title", "status", "agent"].map(value => <option key={value} value={value}>{t(`work.${value}`)}</option>)}</select>
      <Button variant="outline" onClick={() => setDescending(value => !value)}>{t(descending ? "work.descending" : "work.ascending")}</Button>
    </div>
    <p className="text-xs text-muted-foreground">{t("work.executionHint")}</p>
    {view === "workflow" ? <>
      <p className="text-sm text-muted-foreground">{t("work.legend")}</p>
      {graph.roots.length ? <OrgChart embedded orgTree={graph.roots} agents={agents} nodeLinks={links} nodeDetails={details} relations={graph.edges} controlLabels={{ zoomIn: t("work.zoomIn"), zoomOut: t("work.zoomOut"), fit: t("work.fit") }} /> : <p>{t("noTasks")}</p>}
      <ul className="flex flex-col gap-1 text-sm" aria-label={t("work.dependencies")}>{graph.edges.map((edge, index) => <li key={index}><Link className="underline" to={links[edge.from]}>{tasks.find(task => task.id === edge.from)?.title ?? agentMap.get(edge.from)?.name}</Link> → <Link className="underline" to={links[edge.to]}>{tasks.find(task => task.id === edge.to)?.title}</Link> · {t(`work.${edge.kind}`)}</li>)}</ul>
    </> : <>
      <div className="overflow-x-auto rounded-md border"><table className="w-full text-left text-sm"><caption className="sr-only">{t("tasks")}</caption><thead className="bg-muted"><tr>{["title", "agent", "model", "source", "status", "priority", "dependencies", "progress", "cost", "result"].map(column => <th key={column} scope="col" className="whitespace-nowrap p-3">{t(`work.${column}`)}</th>)}</tr></thead>
        <tbody>{filtered.slice(currentPage * 25, (currentPage + 1) * 25).map(task => {
          const agent = agentMap.get(task.assigneeAgentId ?? ""); const execution = taskExecution(task, agent); const progress = taskProgress(task, tasks);
          return <tr key={task.id} className="border-t hover:bg-muted/50">
            <td className="p-3 align-top"><Link className="font-medium underline" to={taskHref(task)}>{task.title}</Link><Button variant="ghost" size="sm" onClick={() => onChat(task)}>{t("work.inChat")}</Button></td>
            <td className="p-3 align-top">{agent ? <Link className="underline" to={`/agents/${agent.id}`}>{agent.name}</Link> : task.assigneeUserId ? t("user") : t("pending")}</td>
            <td className="p-3 align-top">{execution.model ?? t("work.unknown")}<span className="block text-xs text-muted-foreground">{execution.harness}</span></td>
            <td className="p-3 align-top">{t(`work.sources.${execution.source}`)}</td>
            <td className="p-3 align-top">{t(`status.${task.status}`)}</td><td className="p-3 align-top">{t(`work.priorities.${task.priority}`)}</td>
            <td className="p-3 align-top">{task.blockedBy?.length ? task.blockedBy.map(blocker => <Link key={blocker.id} className="block underline" to={`/issues/${blocker.identifier ?? blocker.id}`}>{blocker.title ?? blocker.identifier ?? t("work.task")}</Link>) : t("work.none")}</td>
            <td className="p-3 align-top"><span>{progress.done}/{progress.total}</span><progress className="project-task-progress h-2 w-full" aria-label={t("progress")} max={progress.total} value={progress.done} /></td><TaskEvidence task={task} />
          </tr>;
        })}</tbody></table></div>
      {!filtered.length && <p>{t("noTasks")}</p>}
      {filtered.length > 25 && <div className="flex items-center gap-2"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("work.previous")}</Button><span>{currentPage + 1}/{Math.ceil(filtered.length / 25)}</span><Button variant="outline" disabled={(currentPage + 1) * 25 >= filtered.length} onClick={() => setPage(currentPage + 1)}>{t("work.next")}</Button></div>}
    </>}
  </section>;
}
