import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, Moon, PanelRight, Send, Sun, Settings2 } from "lucide-react";
import type { Agent, Issue } from "@paperclipai/shared";
import { Link, useParams } from "@/lib/router";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { useCompany } from "../context/CompanyContext";
import { useTheme } from "../context/ThemeContext";
import { useCompanyLiveEvent } from "../context/LiveUpdatesProvider";
import { useMobileVisualViewport } from "../hooks/useMobileVisualViewport";
import { useCosgralTranslation } from "../i18n/cosgral";
import { queryKeys } from "../lib/queryKeys";
import { agentHierarchy, conversationTasks } from "../lib/project-conversation";
import { buildCompanyUserProfileMap, buildMarkdownMentionOptions, type CompanyUserProfile } from "../lib/company-members";
import { AgentAvatar } from "../components/AgentAvatar";
import { AgentStatusCapsule } from "../components/StatusBadge";
import { Identity } from "../components/Identity";
import { MarkdownBody } from "../components/MarkdownBody";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "../components/ui/sheet";

const PAGE_SIZE = 40;
const conversationKey = (companyId: string, projectId: string) => ["projects", "conversation", companyId, projectId];

function Drawer({ open, onOpenChange, side, title, children }: {
  open: boolean; onOpenChange: (value: boolean) => void; side: "left" | "right"; title: string; children: ReactNode;
}) {
  const { t } = useCosgralTranslation();
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side={side} showCloseButton={false} className="overflow-y-auto">
      <SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription className="sr-only">{title}</SheetDescription>
        <SheetClose asChild><Button variant="outline">{t("close")}</Button></SheetClose>
      </SheetHeader>{children}
    </SheetContent>
  </Sheet>;
}

function TaskCards({ tasks, agents, users, projectId, conversationId }: { tasks: Issue[]; agents: Agent[]; users: Map<string, CompanyUserProfile>; projectId: string; conversationId: string }) {
  const { t } = useCosgralTranslation();
  const progress = conversationTasks(tasks, projectId, conversationId);
  if (!progress.tasks.length) return null;
  return <div className="flex flex-col gap-4" data-testid="project-conversation-cards">
    <Card className="gap-3 p-4">
      <h2 className="text-sm font-semibold">{t("plan")}</h2>
      <ul className="flex flex-col gap-2">
        {progress.tasks.map(task => {
          const agent = agents.find(agent => agent.id === task.assigneeAgentId);
          return <li key={task.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2 text-sm">
            {agent && <AgentAvatar agent={agent} size={24} />}
            <span className="font-medium">{agent?.name ?? (task.assigneeUserId ? users.get(task.assigneeUserId)?.label ?? t("user") : t("pending"))}</span>
            <Link className="min-w-0 flex-1 break-words underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring" to={`/issues/${task.identifier ?? task.id}`}>{task.title}</Link>
            <Badge variant="secondary">{task.assigneeAgentId || task.assigneeUserId ? t("assigned") : t("pending")}</Badge>
          </li>;
        })}
      </ul>
    </Card>
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{t("progress")}</h2><span className="font-mono text-sm">{progress.percent}%</span></div>
      <progress className="project-task-progress h-2 w-full" value={progress.done} max={progress.tasks.length} aria-label={t("progress")} />
      <p className="text-sm">{t("completed", { done: progress.done, total: progress.tasks.length })}</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {progress.tasks.map(task => <li key={task.id} className="flex min-w-0 flex-col gap-1 rounded-md border p-3 text-sm">
          <span className="truncate">{task.title}</span><span className="text-muted-foreground">{t(`status.${task.status}`)}</span>
        </li>)}
      </ul>
      <p className="text-xs text-muted-foreground">{t("taskScope")}</p>
    </Card>
  </div>;
}

/** Project identity comes from the route, never from a cached task/company. */
export function ProjectConversation() {
  const { companyPrefix, projectId } = useParams<{ companyPrefix: string; projectId: string }>();
  const { companies, setSelectedCompanyId } = useCompany();
  const { t } = useCosgralTranslation();
  const { setTheme } = useTheme();
  const company = companies.find(company => company.issuePrefix.toLowerCase() === companyPrefix?.toLowerCase());
  useEffect(() => { if (company) setSelectedCompanyId(company.id); }, [company?.id, setSelectedCompanyId]);
  useEffect(() => {
    try { if (!localStorage.getItem("paperclip.theme")) setTheme("dark"); } catch { /* Restricted storage retains the current theme. */ }
  }, [setTheme]);
  if (!company || !projectId) return <p role="alert" className="p-4">{t("loadError")}</p>;
  return <ConversationData key={`${company.id}:${projectId}`} companyId={company.id} projectId={projectId} />;
}

function ConversationData({ companyId, projectId }: { companyId: string; projectId: string }) {
  const { t } = useCosgralTranslation();
  const { data: session, isPending, isError } = useQuery({ queryKey: queryKeys.auth.session, queryFn: () => authApi.getSession() });
  if (isPending) return <p role="status" className="p-4">{t("loading")}</p>;
  if (isError || !session) return <p role="alert" className="p-4">{t("loadError")}</p>;
  return <ConversationContent key={session.user.id} companyId={companyId} projectId={projectId} user={session.user} />;
}

function ConversationContent({ companyId, projectId, user }: { companyId: string; projectId: string; user: { id: string; name?: string | null; image?: string | null } }) {
  const { t } = useCosgralTranslation();
  const client = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const project = useQuery({ queryKey: queryKeys.projects.detail(projectId), queryFn: () => projectsApi.get(projectId, companyId) });
  const conversation = useQuery({ queryKey: conversationKey(companyId, projectId), queryFn: () => projectsApi.getConversation(projectId, companyId) });
  const agents = useQuery({ queryKey: queryKeys.agents.list(companyId), queryFn: () => agentsApi.list(companyId) });
  const projects = useQuery({ queryKey: queryKeys.projects.list(companyId), queryFn: () => projectsApi.list(companyId) });
  const directory = useQuery({ queryKey: queryKeys.access.companyUserDirectory(companyId), queryFn: () => accessApi.listUserDirectory(companyId) });
  const tasks = useQuery({ queryKey: [...queryKeys.issues.listByProject(companyId, project.data?.id ?? projectId), "conversation-cards"], queryFn: () => issuesApi.listAll(companyId, { projectId: project.data!.id, includeAgentCreatedTasks: true }), enabled: Boolean(project.data) });
  const issueId = conversation.data?.issueId;
  const viewportRef = useMobileVisualViewport(mobile && Boolean(project.data) && conversation.data !== undefined);
  const tree = useQuery({ queryKey: ["issues", "tree-control-state", issueId ?? "pending"], queryFn: () => issuesApi.getTreeControlState(issueId!), enabled: Boolean(issueId) });
  const hold = tree.data?.activePauseHold;
  const composerBlocked = Boolean(issueId && (tree.isPending || tree.isError || hold));
  const resume = useMutation({
    mutationFn: () => issuesApi.releaseTreeHold(issueId!, hold!.holdId, { metadata: { wakeAgents: false } }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["issues", "tree-control-state", issueId] }); },
  });
  useCompanyLiveEvent(event => {
    if (event.companyId !== companyId || event.type !== "activity.logged") return;
    const payload = event.payload;
    // Authenticated events intentionally omit details.projectId. Re-read only
    // this visible project through its authorized endpoint.
    if (payload.action === "project.conversation_created") {
      void client.invalidateQueries({ queryKey: conversationKey(companyId, projectId) });
    }
    // The global provider defers self-actor refetches for task chat optimistic
    // echoes. This view also needs comments written by the same user in another tab.
    if (issueId && payload.action === "issue.comment_added" && payload.entityId === issueId) {
      void client.invalidateQueries({ queryKey: [...queryKeys.issues.comments(issueId), "project-conversation"] });
    }
  });
  // Use the canonical issue-comments key: LiveUpdatesProvider invalidates it on
  // comment activity and refetches active queries on initial open/reconnection.
  const history = useInfiniteQuery({
    queryKey: [...queryKeys.issues.comments(issueId ?? "none"), "project-conversation"],
    queryFn: ({ pageParam }) => issuesApi.listComments(issueId!, { order: "desc", limit: PAGE_SIZE, ...(pageParam ? { after: pageParam } : {}) }),
    enabled: Boolean(issueId), initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.length === PAGE_SIZE ? page.at(-1)?.id : undefined,
    retry: false,
  });
  const comments = useMemo(() => {
    const unique = new Map((history.data?.pages.flat() ?? []).map(comment => [comment.id, comment]));
    return [...unique.values()].reverse();
  }, [history.data]);
  const profiles = useMemo(() => buildCompanyUserProfileMap(directory.data?.users), [directory.data]);
  const mentions = useMemo(() => buildMarkdownMentionOptions({ agents: agents.data, members: directory.data?.users }), [agents.data, directory.data]);
  const [draft, setDraft] = useState("");
  const attempt = useRef<{ body: string; requestId: string } | null>(null);
  const sending = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (prepend.current && !history.isFetchingNextPage) {
      scroller.scrollTop = prepend.current.top + scroller.scrollHeight - prepend.current.height;
      prepend.current = null;
    } else if (followBottom.current && !history.isFetchingNextPage) scroller.scrollTop = scroller.scrollHeight;
  }, [comments, history.isFetchingNextPage]);

  const send = useMutation({
    mutationFn: async (submission: { body: string; requestId: string }) => {
      let target = conversation.data;
      if (!target) {
        target = await projectsApi.openConversation(projectId, companyId);
        client.setQueryData(conversationKey(companyId, projectId), target);
      }
      return issuesApi.addComment(target.issueId, submission.body, undefined, undefined, undefined, submission.requestId);
    },
    onSuccess: () => {
      setDraft(""); attempt.current = null; followBottom.current = true;
      void client.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId ?? "none") });
    },
    onSettled: () => { sending.current = false; },
  });
  function submit() {
    if (!draft.trim() || sending.current || composerBlocked || conversation.isPending || conversation.isError) return;
    if (!attempt.current || attempt.current.body !== draft.trim()) attempt.current = { body: draft.trim(), requestId: crypto.randomUUID() };
    sending.current = true;
    send.mutate(attempt.current);
  }
  function older() {
    const scroller = scrollRef.current;
    if (scroller) prepend.current = { height: scroller.scrollHeight, top: scroller.scrollTop };
    void history.fetchNextPage();
  }
  const taskData = conversationTasks(tasks.data ?? [], project.data?.id ?? projectId, issueId ?? "");
  const roster = agents.data ?? [];
  const sidebar = <div className="flex h-full flex-col gap-6 p-4">
    <Link to="/projects" className="text-lg font-semibold">COSGRAL</Link>
    <nav aria-label={t("projects")} className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("projects")}</h2>
      {(projects.data ?? []).map(item => <Link key={item.id} aria-current={item.id === project.data?.id ? "page" : undefined} onClick={() => setNavigationOpen(false)} className="rounded-md px-2 py-2 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent" to={`/projects/${item.id}/conversation`}>{item.name}</Link>)}
    </nav>
    <nav aria-label={t("agents")} className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("agents")}</h2>
      {!roster.length && <p className="text-sm text-muted-foreground">{t("noAgents")}</p>}
      {agentHierarchy(roster).map(({ agent, depth }) => <div key={agent.id} className="cosgral-agent-row" style={{ "--cosgral-agent-depth": depth } as CSSProperties}>
        <Link to={`/agents/${agent.id}`} className="flex items-center gap-2 rounded-md p-1 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <AgentAvatar agent={agent} /><span className="min-w-0 flex-1 truncate">{agent.name}</span><span className="cosgral-agent-state" role="img" title={t(`status.${agent.status}`)} aria-label={t(`status.${agent.status}`)}><AgentStatusCapsule status={agent.status} /></span>
        </Link>
      </div>)}
    </nav>
    <nav className="mt-auto flex flex-col gap-3 text-sm" aria-label={t("settings")}>
      <Link to="/inbox">{t("inbox")}</Link><Link to="/company/settings">{t("settings")}</Link>
      <Identity name={user.name || t("user")} avatarUrl={user.image} />
    </nav>
  </div>;
  const details = <div className="flex flex-col gap-6 p-4 text-sm">
    <section className="flex flex-col gap-2"><h2 className="font-semibold">{t("active")}</h2>
      {roster.filter(agent => agent.status === "running").map(agent => <div className="flex items-center gap-2" key={agent.id}><AgentAvatar agent={agent} />{agent.name}</div>)}
      {!roster.some(agent => agent.status === "running") && <p className="text-muted-foreground">{t("noActive")}</p>}
    </section>
    <section className="flex flex-col gap-2"><h2 className="font-semibold">{t("tasks")}</h2>
      {taskData.tasks.map(task => <Link key={task.id} to={`/issues/${task.identifier ?? task.id}`} className="flex flex-col gap-1 rounded-md border p-2 hover:bg-accent"><span>{task.title}</span><span className="text-xs text-muted-foreground">{t(`status.${task.status}`)}</span></Link>)}
      {!taskData.tasks.length && <p className="text-muted-foreground">{t("noTasks")}</p>}
    </section>
    <section className="flex flex-col gap-2"><h2 className="font-semibold">{t("currentUser")}</h2><Identity name={user.name || t("user")} avatarUrl={user.image} /><p className="text-xs text-muted-foreground">{t("noPresence")}</p></section>
  </div>;
  if (project.isPending || conversation.isPending) return <p role="status" className="p-4">{t("loading")}</p>;
  if ((project.isError && !project.data) || (conversation.isError && conversation.data === undefined)) return <div className="p-4" role="alert">{t("loadError")} <Button onClick={() => { void project.refetch(); void conversation.refetch(); }}>{t("retry")}</Button></div>;
  return <div ref={viewportRef} data-task-chat-shell className="cosgral-conversation flex h-dvh min-h-0 overflow-hidden bg-background text-foreground">
    <a href="#cosgral-messages" className="sr-only focus:not-sr-only">{t("conversation")}</a>
    <aside className="hidden w-60 shrink-0 overflow-y-auto border-r bg-sidebar md:block">{sidebar}</aside>
    <Drawer open={navigationOpen} onOpenChange={setNavigationOpen} side="left" title={t("projects")}>{sidebar}</Drawer>
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" className="text-foreground md:hidden" aria-label={t("navigation")} onClick={() => setNavigationOpen(true)}><Menu /></Button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-base font-semibold">{project.data?.name}</h1><p className="text-xs text-muted-foreground">{t("conversation")}</p></div>
        {issueId && <Link to={`/issues/${conversation.data?.identifier ?? issueId}`} aria-label={t("advanced")} className="text-xs text-muted-foreground underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"><Settings2 className="size-4 sm:hidden" /><span className="hidden sm:inline">{t("advanced")}</span></Link>}
        <Button variant="ghost" size="icon" className="text-foreground" aria-label={t("theme")} onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
        <Button variant="ghost" size="icon" className="text-foreground" aria-label={t("details")} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}><PanelRight /></Button>
      </header>
      <div id="cosgral-messages" tabIndex={0} ref={scrollRef} onScroll={() => { const el = scrollRef.current!; followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="min-h-0 flex-1 overflow-y-auto p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6" aria-label={t("conversation")}>
        <div role="log" aria-live="polite" aria-relevant="additions text" aria-label={t("conversation")} className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {history.hasNextPage && <Button variant="ghost" disabled={history.isFetchingNextPage} onClick={older}>{history.isFetchingNextPage ? t("olderLoading") : t("older")}</Button>}
          {history.isError && <p role="alert" className="text-sm text-destructive">{t("historyError")} <Button variant="outline" onClick={() => { void history.refetch(); }}>{t("retry")}</Button></p>}
          {history.isPending && issueId && <p role="status">{t("loading")}</p>}
          {!comments.length && (!issueId || history.isSuccess) && <p className="py-6 text-sm text-muted-foreground">{t("empty")}</p>}
          {comments.map(comment => {
            const agent = roster.find(agent => agent.id === comment.authorAgentId);
            const profile = comment.authorUserId ? profiles.get(comment.authorUserId) : null;
            const name = agent?.name ?? profile?.label ?? (comment.authorUserId === user.id ? user.name : null) ?? t(comment.authorAgentId ? "unknownAgent" : "user");
            const created = new Date(comment.createdAt);
            const minutes = Math.round((created.getTime() - Date.now()) / 60000);
            const relative = new Intl.RelativeTimeFormat("pl", { numeric: "auto" }).format(Math.abs(minutes) < 60 ? minutes : Math.round(minutes / 60), Math.abs(minutes) < 60 ? "minute" : "hour");
            return <article key={comment.id} className="flex flex-col gap-2" aria-label={name}>
              <div className="flex flex-wrap items-center gap-2 text-sm">{agent ? <><AgentAvatar agent={agent} size={32} /><span className="font-semibold">{name}</span></> : <Identity name={name} avatarUrl={profile?.image ?? (comment.authorUserId === user.id ? user.image : null)} />}
                <time className="text-xs text-muted-foreground" dateTime={created.toISOString()} title={created.toLocaleString("pl-PL")}>{relative}</time>
              </div>
              <div className="min-w-0 break-words rounded-lg bg-muted/40 p-3"><MarkdownBody>{comment.body}</MarkdownBody></div>
            </article>;
          })}
          <TaskCards tasks={tasks.data ?? []} agents={roster} users={profiles} projectId={project.data?.id ?? projectId} conversationId={issueId ?? ""} />
          {[project, conversation, agents, projects, tasks, directory].some(query => query.isError) && <p role="alert" className="text-sm text-destructive">{t("dataError")} <Button variant="outline" onClick={() => { for (const query of [project, conversation, agents, projects, tasks, directory]) if (query.isError) void query.refetch(); }}>{t("retry")}</Button></p>}
        </div>
      </div>
      <footer className="border-t p-3 md:p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {hold && <div role="status" className="rounded-md border bg-muted p-3 text-sm">
            <p>{t(hold.isRoot ? "paused" : "inheritedPause")}</p>
            {hold.isRoot ? <Button variant="outline" disabled={resume.isPending} onClick={() => resume.mutate()}>{t("resume")}</Button> : <Link className="underline" to={`/issues/${hold.rootIssueId}`}>{t("advanced")}</Link>}
          </div>}
          {(tree.isError || resume.isError) && <p role="alert" className="text-sm text-destructive">{t("pauseError")} <Button variant="outline" onClick={() => { void tree.refetch(); }}>{t("retry")}</Button></p>}
          <MarkdownEditor value={draft} onChange={setDraft} ariaLabel={t("message")} placeholder={t("message")} mentions={mentions} onSubmit={submit} submitOnEnter readOnly={send.isPending || composerBlocked} className="cosgral-composer" />
          <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{t("sendHint")}</p><Button onClick={submit} disabled={send.isPending || composerBlocked || !draft.trim()}><Send className="size-4" />{t(send.isPending ? "sending" : "send")}</Button></div>
          {send.isError && <p role="alert" className="text-sm text-destructive">{t("sendError")} <Button variant="outline" onClick={submit}>{t("retry")}</Button></p>}
        </div>
      </footer>
    </main>
    {detailsOpen && !mobile && <aside aria-label={t("details")} className="w-72 shrink-0 overflow-y-auto border-l bg-sidebar">{details}</aside>}
    <Drawer open={detailsOpen && mobile} onOpenChange={setDetailsOpen} side="right" title={t("details")}>{details}</Drawer>
  </div>;
}
