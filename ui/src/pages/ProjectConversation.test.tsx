import { defaultPersonalization } from "@paperclipai/shared/personalization";
// @vitest-environment jsdom
import { pendingSuggestedTasksInteraction, pendingRequestConfirmationInteraction } from "../fixtures/issueThreadInteractionFixtures";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectConversation } from "./ProjectConversation";
import { queryKeys } from "../lib/queryKeys";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  live: null as ((event: { companyId: string; type: string; payload: Record<string, unknown> }) => void) | null, tree: vi.fn(), release: vi.fn(), get: vi.fn(), getConversation: vi.fn(), openConversation: vi.fn(), setCoordinator: vi.fn(), projects: vi.fn(),
  projectHistory: vi.fn(), decisions: vi.fn(), accept: vi.fn(), reject: vi.fn(),
  cost: vi.fn(), products: vi.fn(), comments: vi.fn(), send: vi.fn(), tasks: vi.fn(), agents: vi.fn(), directory: vi.fn(), session: vi.fn(), liveRuns: vi.fn(),
}));
vi.mock("./OrgChart", () => ({ OrgChart: ({ orgTree }: { orgTree: unknown }) => <div data-testid="workflow-chart">{JSON.stringify(orgTree)}</div> }));
vi.mock("../api/projects", () => ({ projectsApi: { get: mocks.get, getConversation: mocks.getConversation, openConversation: mocks.openConversation, setConversationCoordinator: mocks.setCoordinator, list: mocks.projects } }));
vi.mock("../api/issues", () => ({ issuesApi: { projectHistory: mocks.projectHistory, listInteractions: mocks.decisions, acceptInteraction: mocks.accept, rejectInteraction: mocks.reject, listComments: mocks.comments, addComment: mocks.send, listAll: mocks.tasks, getCostSummary: mocks.cost, listWorkProducts: mocks.products, getTreeControlState: mocks.tree, releaseTreeHold: mocks.release } }));
vi.mock("../api/agents", () => ({ agentsApi: { list: mocks.agents } }));
vi.mock("../api/heartbeats", () => ({ heartbeatsApi: { liveRunsForIssue: mocks.liveRuns } }));
vi.mock("../api/access", () => ({ accessApi: { listUserDirectory: mocks.directory } }));
vi.mock("../api/workspacePreferences", () => ({ workspacePreferencesApi: {
  getPersonalization: vi.fn(async () => defaultPersonalization()),
  updatePersonalization: vi.fn(async (_company: string, value: unknown) => value),
} }));
vi.mock("../api/auth", () => ({ authApi: { getSession: mocks.session } }));
vi.mock("@/lib/router", () => ({ useParams: () => ({ companyPrefix: "COS", projectId: "p" }), Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a> }));
vi.mock("../context/LiveUpdatesProvider", () => ({ useTaskRunLiveUpdates: () => false, useCompanyLiveEvent: (handler: typeof mocks.live) => { mocks.live = handler; } }));
const company = { id: "c", issuePrefix: "COS" };
vi.mock("../context/CompanyContext", () => ({ useCompany: () => ({ companies: [company], selectedCompanyId: "c", setSelectedCompanyId: vi.fn() }) }));
vi.mock("../context/ThemeContext", () => ({ useTheme: () => ({ theme: "dark", setTheme: vi.fn(), toggleTheme: vi.fn() }) }));
vi.mock("../components/MarkdownBody", () => ({ MarkdownBody: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../components/MarkdownEditor", () => ({ MarkdownEditor: ({ value, onChange, onSubmit, readOnly, submitOnEnter, placeholder }: { placeholder: string; value: string; onChange: (v: string) => void; onSubmit: () => void; readOnly: boolean; submitOnEnter: boolean }) => <textarea aria-label="Wiadomość" placeholder={placeholder} value={value} readOnly={readOnly} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (submitOnEnter && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }} /> }));

const presenceMock = vi.hoisted(() => ({ users: [] as Array<{ userId: string; typingUntil: number }>, connected: false, typing: vi.fn(), stopTyping: vi.fn() }));
vi.mock("../hooks/useProjectConversationPresence", () => ({ useProjectConversationPresence: () => presenceMock }));

const originalViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
function click(text: string) { const button = [...document.querySelectorAll("button")].find(b => b.textContent === text || b.getAttribute("aria-label") === text); if (!button) throw new Error(`Missing ${text}`); button.click(); }
async function type(body: string) {
  await act(async () => {
    const textarea = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, body);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  presenceMock.users = []; presenceMock.connected = false;
  mocks.liveRuns.mockResolvedValue([]);
  mocks.projectHistory.mockResolvedValue({ entries: [], nextCursor: null });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  mocks.get.mockResolvedValue({ id: "p", name: "Uszko", companyId: "c" });
  mocks.getConversation.mockResolvedValue({ issueId: "chat", identifier: "COS-1", coordinatorAgentId: null, canManageCoordinator: true, canResolveApprovals: true });
  mocks.projects.mockResolvedValue([{ id: "p", name: "Uszko" }]);
  mocks.comments.mockResolvedValue([{ id: "comment", body: "Wspólna historia", authorUserId: "u", createdAt: new Date().toISOString() }]);
  mocks.tree.mockResolvedValue({ activePauseHold: null }); mocks.release.mockResolvedValue({});
  mocks.decisions.mockResolvedValue([]);
  mocks.tasks.mockResolvedValue([]); mocks.agents.mockResolvedValue([]);
  mocks.directory.mockResolvedValue({ users: [{ principalId: "u", status: "active", user: { name: "Anna" } }] });
  mocks.session.mockResolvedValue({ user: { id: "u", name: "Anna" } });
  host = document.createElement("div"); document.body.append(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  root = createRoot(host);
  await act(async () => root.render(<QueryClientProvider client={client}><ProjectConversation /></QueryClientProvider>));
  await settle(); await settle();
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); if (originalViewport) Object.defineProperty(window, "visualViewport", originalViewport); else delete (window as { visualViewport?: unknown }).visualViewport; });

describe("project conversation", () => {
  it("filters chronologically with counts, empty state and expandable agent messages", async () => {
    mocks.comments.mockResolvedValue([
      { id: "agent", authorAgentId: "worker", body: "Raport wykonawcy\nSzczegóły audytu", createdAt: "2026-11-04T10:02:00Z" },
      { id: "human", authorUserId: "u", body: "Polecenie człowieka", createdAt: "2026-11-04T10:01:00Z" },
    ]);
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.issues.comments("chat") }); }); await settle();
    const filter = host.querySelector<HTMLSelectElement>('select[aria-label="Filtr wiadomości"]');
    expect(filter).toBeTruthy();
    expect(host.querySelector("details")?.open).toBe(false);
    await act(async () => { filter!.value = "humans"; filter!.dispatchEvent(new Event("change", { bubbles: true })); });
    const log = host.querySelector('[role="log"]')!;
    expect(log.textContent).toContain("Polecenie człowieka");
    expect(log.textContent).not.toContain("Raport wykonawcy");
    expect(host.textContent).toContain("Tylko ludzie (1)");
    await act(async () => { filter!.value = "errors"; filter!.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(log.textContent).toContain("Brak wiadomości dla tego filtra");
  });

  it("merges task activity, child comments, runtime errors and approvals in chronological order", async () => {
    mocks.agents.mockResolvedValue([{ id: "worker", name: "Wykonawca" }, { id: "coord", name: "Koordynator" }]);
    mocks.comments.mockResolvedValue([{ id: "human", authorUserId: "u", body: "Początek", createdAt: "2026-11-04T10:00:00Z" }]);
    mocks.projectHistory.mockResolvedValue({ nextCursor: null, entries: [
      { id: "error", issueId: "child", kind: "error", body: "Błąd wykonania", createdAt: "2026-11-04T10:03:00Z" },
      { id: "child-message", issueId: "child", kind: "comment", authorAgentId: "coord", recipientAgentId: "worker", body: "Sprawdź GPU", createdAt: "2026-11-04T10:02:00Z" },
      { id: "task", issueId: "child", kind: "task", body: "Delegowanie zadania", createdAt: "2026-11-04T10:01:00Z" },
    ] });
    await act(async () => { await client.invalidateQueries(); }); await settle();
    const articles = [...host.querySelectorAll('[role="log"] article')];
    expect(articles.map(a => a.textContent).join("|")).toMatch(/Początek.*Delegowanie zadania.*Sprawdź GPU.*Błąd wykonania/s);
    expect(host.textContent).toContain("Koordynator → Wykonawca");
    await act(async () => { const f = host.querySelector<HTMLSelectElement>("#conversation-filter")!; f.value = "agents"; f.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.querySelector('[role="log"]')!.textContent).toContain("Sprawdź GPU");
    expect(host.querySelector('[role="log"]')!.textContent).not.toContain("Delegowanie zadania");
  });
  it("shows human approval proposals, accepts via the existing API and refreshes another user's decision live", async () => {
    const proposal = { ...pendingSuggestedTasksInteraction, id: "proposal", issueId: "chat", companyId: "c", resolverPolicy: "human_only" as const, effectiveResolverPolicy: "human_only" as const };
    mocks.decisions.mockResolvedValue([proposal]);
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.issues.interactions("chat") }); });
    await settle();
    expect(host.textContent).toContain(proposal.payload.tasks[0]!.title);
    const approve = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Zatwierdź");
    expect(approve).toBeTruthy();
    mocks.accept.mockImplementation(async () => { const receipt = { ...proposal, status: "accepted", result: { version: 1, createdTasks: [] } }; mocks.decisions.mockResolvedValue([receipt]); return receipt; });
    await act(async () => approve!.click()); await settle();
    expect(mocks.accept).toHaveBeenCalledWith("chat", "proposal", expect.any(Object));
    expect(Array.from(host.querySelectorAll("button")).some(button => button.textContent === "Zatwierdź")).toBe(false);
    const decision = { ...pendingRequestConfirmationInteraction, issueId: "chat", companyId: "c", payload: { ...pendingRequestConfirmationInteraction.payload, prompt: "Publikacja wymaga zgody", acceptLabel: "Zatwierdź", rejectLabel: "Odrzuć" } };
    mocks.decisions.mockResolvedValue([decision]);
    await act(async () => mocks.live?.({ companyId: "c", type: "activity.logged", payload: { entityType: "issue", entityId: "chat", action: "issue.thread_interaction_created" } })); await settle();
    expect(host.textContent).toContain("Publikacja wymaga zgody");
    mocks.decisions.mockResolvedValue([{ ...decision, status: "rejected" }]);
    await act(async () => mocks.live?.({ companyId: "c", type: "activity.logged", payload: { entityType: "issue", entityId: "chat", action: "issue.thread_interaction_rejected" } })); await settle();
    expect(Array.from(host.querySelectorAll("button")).some(button => button.textContent === "Zatwierdź")).toBe(false);
  });

  it("shows decision failures, preserves the pending card and submits rejection", async () => {
    const decision = { ...pendingRequestConfirmationInteraction, issueId: "chat", companyId: "c", payload: { ...pendingRequestConfirmationInteraction.payload, prompt: "Publikować?", target: undefined, rejectRequiresReason: false, acceptLabel: "Zatwierdź", rejectLabel: "Odrzuć" } };
    mocks.decisions.mockResolvedValue([decision]);
    mocks.accept.mockRejectedValueOnce(new Error("Brak połączenia z serwerem"));
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.issues.interactions("chat") }); }); await settle();
    await act(async () => click("Zatwierdź")); await settle();
    expect(host.textContent).toContain("Brak połączenia z serwerem");
    expect(host.textContent).toContain("Publikować?");
    mocks.reject.mockImplementation(async () => { const receipt = { ...decision, status: "rejected" }; mocks.decisions.mockResolvedValue([receipt]); return receipt; });
    await act(async () => click("Odrzuć")); await settle();
    expect(mocks.reject).toHaveBeenCalledWith("chat", decision.id, undefined);
    expect([...host.querySelectorAll("button")].some(b => b.textContent === "Zatwierdź")).toBe(false);
  });

  it("keeps approval cards read-only for a viewer", async () => {
    mocks.getConversation.mockResolvedValue({ issueId: "chat", coordinatorAgentId: "a", canManageCoordinator: false, canResolveApprovals: false });
    mocks.decisions.mockResolvedValue([{ ...pendingRequestConfirmationInteraction, issueId: "chat", companyId: "c", payload: { ...pendingRequestConfirmationInteraction.payload, prompt: "Decyzja człowieka", target: undefined, rejectRequiresReason: false, acceptLabel: "Zatwierdź", rejectLabel: "Odrzuć" } }]);
    await act(async () => { await client.invalidateQueries(); }); await settle();
    expect(host.textContent).toContain("Decyzja człowieka");
    const actions = [...host.querySelectorAll("button")].filter(b => ["Zatwierdź", "Odrzuć"].includes(b.textContent ?? ""));
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every(b => b.disabled)).toBe(true);
    expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.reject).not.toHaveBeenCalled();
  });

  it("surfaces approval load failures and lets the user retry", async () => {
    mocks.decisions.mockRejectedValue(new Error("unavailable"));
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.issues.interactions("chat") }); }); await settle();
    expect(host.textContent).toContain("Nie udało się wczytać zatwierdzeń");
  });

  it("shows present humans and other users typing using directory names", async () => {
    presenceMock.connected = true;
    presenceMock.users = [{ userId: "u", typingUntil: Date.now() + 5000 }, { userId: "b", typingUntil: Date.now() + 5000 }];
    mocks.directory.mockResolvedValue({ users: [{ principalId: "u", status: "active", user: { name: "Anna" } }, { principalId: "b", status: "active", user: { name: "Bogdan" } }] });
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.access.companyUserDirectory("c") }); }); await settle();
    expect(host.querySelector('[data-testid="conversation-presence-summary"]')?.textContent).toContain("Obecni: Anna, Bogdan");
    expect(host.querySelector('[data-testid="conversation-typing"]')?.textContent).toContain("Bogdan pisze…");
    expect(host.querySelector('[data-testid="conversation-typing"]')?.textContent).not.toContain("Anna pisze…");
    await act(async () => click("Szczegóły projektu")); await settle();
    expect(host.querySelector('[data-testid="conversation-presence"]')?.textContent).toContain("Bogdan");
    expect(host.querySelector('[data-testid="conversation-presence"]')?.textContent).toContain("Anna");
    expect(host.textContent).not.toContain("Obecność niedostępna");
  });
  it("shows coordinator work only for an active run in this conversation", async () => {
    client.setQueryData(["agents", "c"], [{ id: "a", name: "Ala", status: "running" }]);
    client.setQueryData(["projects", "conversation", "c", "p"], { issueId: "chat", coordinatorAgentId: "a", canManageCoordinator: true, canResolveApprovals: true });
    await settle();
    expect(host.textContent).not.toContain("Ala pracuje nad tą rozmową");
    mocks.liveRuns.mockResolvedValue([{ id: "run", agentId: "a", status: "running" }]);
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.issues.liveRuns("chat") }); }); await settle();
    expect(mocks.liveRuns).toHaveBeenCalledWith("chat");
    expect(host.textContent).toContain("Ala pracuje nad tą rozmową");
    mocks.liveRuns.mockResolvedValue([]);
  mocks.projectHistory.mockResolvedValue({ entries: [], nextCursor: null });
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.issues.liveRuns("chat") }); }); await settle();
    expect(host.textContent).not.toContain("Ala pracuje nad tą rozmową");
  });
  it("shows work from conversation runs even without a selected coordinator", async () => {
    mocks.agents.mockResolvedValue([{ id: "a", name: "Ala", status: "running" }, { id: "b", name: "Beata", status: "running" }]);
    mocks.liveRuns.mockResolvedValue([{ id: "run", agentId: "a", agentName: "Ala", status: "running" }]);
    await act(async () => { await client.invalidateQueries({ queryKey: ["agents", "c"] }); await client.invalidateQueries({ queryKey: queryKeys.issues.liveRuns("chat") }); }); await settle();
    expect(host.textContent).toContain("Ala pracuje nad tą rozmową");
    expect(host.textContent).not.toContain("Beata pracuje nad tą rozmową");
  });
  it("shows coordinator failures as system messages in the conversation", async () => {
    mocks.comments.mockResolvedValue([{ id: "notice", authorType: "system", body: "Nie udało się zakończyć odpowiedzi koordynatora.", createdAt: new Date().toISOString() }]);
    await act(async () => { await client.invalidateQueries({ queryKey: ["issues", "comments", "chat"] }); }); await settle();
    expect(host.querySelector('article[aria-label="System"]')?.textContent).toContain("Nie udało się");
  });
  it("selects and persists the coordinator without sending a message", async () => {
    mocks.agents.mockResolvedValue([{ id: "a", name: "Ala", status: "idle" }]);
    mocks.setCoordinator.mockResolvedValue({ issueId: "chat", identifier: "COS-1", coordinatorAgentId: "a", canManageCoordinator: true, canResolveApprovals: true });
    await act(async () => { await client.invalidateQueries({ queryKey: ["agents", "c"] }); }); await settle();
    expect(host.textContent).toContain("Wybierz koordynatora");
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Koordynator projektu"]')!;
    expect(select).not.toBeNull();
    await act(async () => { select.value = "a"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
    expect(mocks.setCoordinator).toHaveBeenCalledWith("p", "a", "c");
    expect(host.querySelector("textarea")?.placeholder).toBe("Wiadomość do Ala…");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("shows coordinator readiness and observed company execution without claiming a reply", async () => {
    client.setQueryData(["agents", "c"], [{ id: "a", name: "Ala", status: "paused" }, { id: "b", name: "Beata", status: "running" }]);
    client.setQueryData(["projects", "conversation", "c", "p"], { issueId: "chat", coordinatorAgentId: "a", canManageCoordinator: false });
    await settle();
    expect(host.textContent).toContain("Koordynator jest wstrzymany");
    expect(host.textContent).toContain("Beata pracuje w firmie");
    expect(host.querySelector<HTMLSelectElement>("#project-coordinator")?.disabled).toBe(true);
    await type("Szkic");
    await act(async () => click("Wyślij"));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(host.querySelector("textarea")?.value).toBe("Szkic");
  });
  it("selects the first coordinator through the same endpoint before a conversation exists", async () => {
    client.setQueryData(["projects", "conversation", "c", "p"], null);
    client.setQueryData(["agents", "c"], [{ id: "a", name: "Ala", status: "idle" }]);
    mocks.setCoordinator.mockResolvedValue({ issueId: "new-chat", identifier: "COS-2", coordinatorAgentId: "a", canManageCoordinator: true, canResolveApprovals: true });
    await settle(); await type("Szkic przed wyborem");
    const select = host.querySelector<HTMLSelectElement>("#project-coordinator")!;
    await act(async () => { select.value = "a"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
    expect(mocks.setCoordinator).toHaveBeenCalledWith("p", "a", "c");
    expect(mocks.openConversation).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(host.querySelector("textarea")?.value).toBe("Szkic przed wyborem");
    expect(host.querySelector("textarea")?.placeholder).toBe("Wiadomość do Ala…");
    expect(host.querySelector('a[href="/issues/COS-2"]')).not.toBeNull();
  });
  it("preserves the draft when selecting a coordinator for an empty conversation fails", async () => {
    client.setQueryData(["projects", "conversation", "c", "p"], null);
    client.setQueryData(["agents", "c"], [{ id: "a", name: "Ala", status: "idle" }]);
    mocks.setCoordinator.mockRejectedValue(new Error("Forbidden"));
    await settle(); await type("Zachowany szkic");
    const select = host.querySelector<HTMLSelectElement>("#project-coordinator")!;
    await act(async () => { select.value = "a"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
    expect(host.textContent).toContain("Nie udało się zmienić koordynatora");
    expect(host.querySelector("textarea")?.value).toBe("Zachowany szkic");
    expect(select.value).toBe("");
    expect(mocks.openConversation).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("refreshes the persisted coordinator on company activity", async () => {
    mocks.getConversation.mockResolvedValue({ issueId: "chat", coordinatorAgentId: "a", canManageCoordinator: true, canResolveApprovals: true });
    client.setQueryData(["agents", "c"], [{ id: "a", name: "Ala", status: "idle" }]);
    await act(async () => mocks.live?.({ companyId: "c", type: "activity.logged", payload: { action: "project.conversation_coordinator_changed", entityId: "chat" } })); await settle();
    expect(host.querySelector("textarea")?.placeholder).toBe("Wiadomość do Ala…");
  });
  it("shows stored messages and author, hides the details panel and absent task cards", async () => {
    expect(host.textContent).toContain("Wspólna historia");
    expect(host.textContent).toContain("Anna");
    expect(host.querySelector('[aria-label="Szczegóły projektu"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(host.textContent).not.toContain("Plan i delegowanie");
    await act(async () => click("Szczegóły projektu")); await settle();
    expect(document.body.textContent).toContain("Obecni w rozmowie");
  });
  it("sends a comment, keeps the composer pending, and clears only after confirmation", async () => {
    let resolve!: (value: unknown) => void;
    mocks.send.mockReturnValue(new Promise(r => { resolve = r; }));
    await type("Nowa wiadomość");
    await act(async () => click("Wyślij")); await settle();
    expect(mocks.send.mock.calls[0]?.slice(0, 2)).toEqual(["chat", "Nowa wiadomość"]);
    expect(host.querySelector("textarea")?.readOnly).toBe(true);
    expect(host.textContent).toContain("Wysyłanie…");
    await act(async () => resolve({ id: "new", body: "Nowa wiadomość" })); await settle();
    expect(host.querySelector("textarea")?.value).toBe("");
  });
  it("retains failed text and reuses the request key on retry", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Network")).mockResolvedValueOnce({ id: "new", body: "Ponów" });
    await type("Ponów"); await act(async () => click("Wyślij")); await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nie udało się potwierdzić");
    expect(host.querySelector("textarea")?.value).toBe("Ponów");
    await act(async () => click("Spróbuj ponownie")); await settle();
    expect(mocks.send.mock.calls[0][5]).toBe(mocks.send.mock.calls[1][5]);
  });
  it("loads the conversation created by another member while this view was empty", async () => {
    client.setQueryData(["projects", "conversation", "c", "p"], null);
    await settle();
    mocks.getConversation.mockResolvedValue({ issueId: "created-by-b", identifier: "COS-2" });
    mocks.comments.mockResolvedValue([{ id: "new", body: "Pierwsza od B", createdAt: new Date().toISOString() }]);
    await act(async () => mocks.live?.({ companyId: "c", type: "activity.logged", payload: { action: "project.conversation_created", entityId: "created-by-b" } })); await settle(); await settle();
    expect(host.textContent).toContain("Pierwsza od B");
  });
  it("refreshes messages from another tab of the same user", async () => {
    mocks.comments.mockResolvedValue([{ id: "new", body: "Z drugiej karty", createdAt: new Date().toISOString() }]);
    await act(async () => mocks.live?.({ companyId: "c", type: "activity.logged", payload: { action: "issue.comment_added", entityId: "chat", actorType: "user", actorId: "u" } })); await settle();
    expect(host.textContent).toContain("Z drugiej karty");
  });
  it("preserves a draft under a pause and resumes through the existing hold API", async () => {
    await type("Szkic");
    mocks.tree.mockResolvedValue({ activePauseHold: { holdId: "hold", rootIssueId: "chat", isRoot: true } });
    await act(async () => { await client.invalidateQueries({ queryKey: ["issues", "tree-control-state", "chat"] }); }); await settle();
    expect(host.querySelector("textarea")?.readOnly).toBe(true);
    expect(host.querySelector("textarea")?.value).toBe("Szkic");
    mocks.tree.mockResolvedValue({ activePauseHold: null });
    await act(async () => click("Wznów rozmowę")); await settle();
    expect(mocks.release).toHaveBeenCalledWith("chat", "hold", { metadata: { wakeAgents: false } });
    expect(host.querySelector("textarea")?.value).toBe("Szkic");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks inherited pauses and links to the holding ancestor", async () => {
    mocks.tree.mockResolvedValue({ activePauseHold: { holdId: "hold", rootIssueId: "ancestor", isRoot: false } });
    await act(async () => { await client.invalidateQueries({ queryKey: ["issues", "tree-control-state", "chat"] }); }); await settle();
    expect(host.querySelector("textarea")?.readOnly).toBe(true);
    expect(host.querySelector('a[href="/issues/ancestor"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Wznów rozmowę");
  });
  it("loads a descending cursor page into chronological history without moving the reading anchor", async () => {
    const comment = (n: number) => ({ id: `id-${n}`, body: `History ${n}`, createdAt: new Date(Date.UTC(2026, 10, 4, 10, n)).toISOString() });
    mocks.comments.mockImplementation((_id, filters) => Promise.resolve(filters?.after ? Array.from({ length: 5 }, (_, i) => comment(5 - i)) : Array.from({ length: 40 }, (_, i) => comment(45 - i))));
    await act(async () => { await client.invalidateQueries({ queryKey: ["issues", "comments", "chat"] }); }); await settle();
    const scroller = host.querySelector<HTMLElement>("#cosgral-messages")!;
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => host.querySelectorAll("article").length * 100 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => 300 });
    scroller.scrollTop = 2400;
    await act(async () => scroller.dispatchEvent(new Event("scroll")));
    await act(async () => click("Wczytaj wcześniejsze wiadomości")); await settle();
    expect(mocks.comments).toHaveBeenLastCalledWith("chat", { order: "desc", limit: 40, after: "id-6" });
    const articles = [...host.querySelectorAll("article")];
    expect(articles).toHaveLength(45);
    expect(articles[0].textContent).toContain("History 1");
    expect(articles.at(-1)?.textContent).toContain("History 45");
    expect(scroller.scrollTop).toBe(2900);
  });
  it("keeps history and the draft mounted after a background project read error", async () => {
    await type("Zachowany szkic");
    mocks.get.mockRejectedValue(new Error("Offline"));
    await act(async () => { await client.invalidateQueries({ queryKey: ["projects", "detail", "p"] }); }); await settle();
    expect(host.textContent).toContain("Wspólna historia");
    expect(host.querySelector("textarea")?.value).toBe("Zachowany szkic");
    expect(host.textContent).toContain("Nie udało się odświeżyć części danych");
  });
  it("attaches the mobile viewport after delayed project loading", async () => {
    await act(async () => root.unmount()); client.clear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const viewport = { height: 600, scale: 1, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    let ready!: (value: unknown) => void;
    mocks.get.mockReturnValue(new Promise(resolve => { ready = resolve; }));
    root = createRoot(host);
    await act(async () => root.render(<QueryClientProvider client={client}><ProjectConversation /></QueryClientProvider>)); await settle();
    expect(host.querySelector(".cosgral-conversation")).toBeNull();
    expect(viewport.addEventListener).not.toHaveBeenCalled();
    await act(async () => ready({ id: "p", companyId: "c", name: "Uszko" })); await settle();
    const shell = host.querySelector<HTMLElement>(".cosgral-conversation")!;
    expect(shell.style.getPropertyValue("--mobile-chat-viewport-height")).toBe("600px");
    viewport.height = 500;
    await act(async () => viewport.addEventListener.mock.calls.find(call => call[0] === "resize")![1]());
    expect(shell.style.getPropertyValue("--mobile-chat-viewport-height")).toBe("500px");
  });
  it("refreshes canonical messages when the live provider invalidates the issue key", async () => {
    mocks.comments.mockResolvedValue([{ id: "other", body: "Od drugiej osoby", createdAt: new Date().toISOString() }]);
    await act(async () => { await client.invalidateQueries({ queryKey: ["issues", "comments", "chat"] }); }); await settle();
    expect(host.textContent).toContain("Od drugiej osoby");
  });
});


it("switches real project data between views, filters and keeps draft and preference", async () => {
  const rows = [{ id: "t", projectId: "p", title: "Backend", priority: "high", status: "in_progress", assigneeAgentId: "a", blockedBy: [] }, { id: "t2", projectId: "p", title: "Frontend", priority: "low", status: "done", assigneeAgentId: null, blockedBy: [] }];
  mocks.tasks.mockResolvedValue(rows); mocks.agents.mockResolvedValue([{ id: "a", name: "Ala", status: "idle", adapterType: "codex_local", adapterConfig: { model: "test-model", env: { SECRET: "must-not-render" } }, runtimeConfig: {} }]);
  await act(async () => { await client.invalidateQueries({ queryKey: ["issues"] }); await client.invalidateQueries({ queryKey: ["agents", "c"] }); }); await settle();
  await type("Zachowany szkic");
  await act(async () => click("Tabela"));
  expect(host.querySelector("table")?.textContent).toContain("Backend");
  expect(host.querySelector("table")?.textContent).toContain("test-model");
  expect(host.textContent).not.toContain("must-not-render");
  expect(localStorage.getItem("cosgral.view:u:c:p")).toBe("table");
  const filter = host.querySelector<HTMLSelectElement>('select[aria-label="Status"]')!;
  await act(async () => { filter.value = "done"; filter.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelector("tbody")?.textContent).not.toContain("Backend");
  expect(host.querySelector("tbody")?.textContent).toContain("Frontend");
  await act(async () => click("Workflow"));
  expect(host.querySelector('[data-testid="workflow-chart"]')?.textContent).toContain("Frontend");
  await act(async () => click("Chat"));
  expect(host.querySelector("textarea")?.value).toBe("Zachowany szkic");
});
it("refreshes tasks and configured model after sanitized company activity", async () => {
  mocks.tasks.mockResolvedValue([{ id: "t", projectId: "p", title: "Nowe zadanie", priority: "high", status: "todo" }]);
  const before = mocks.tasks.mock.calls.length;
  await act(async () => { mocks.live?.({ companyId: "c", type: "activity.logged", payload: { action: "issue.created", entityType: "issue", entityId: "t" } }); }); await settle();
  expect(mocks.tasks.mock.calls.length).toBeGreaterThan(before);
  await act(async () => click("Tabela"));
  expect(host.querySelector("table")?.textContent).toContain("Nowe zadanie");
  const agentsBefore = mocks.agents.mock.calls.length;
  await act(async () => { mocks.live?.({ companyId: "c", type: "activity.logged", payload: { action: "agent.updated", entityType: "agent", entityId: "a" } }); }); await settle();
  expect(mocks.agents.mock.calls.length).toBeGreaterThan(agentsBefore);
});

it("loads recorded cost and result only on demand and refreshes them after task activity", async () => {
  mocks.tasks.mockResolvedValue([{ id: "t", projectId: "p", title: "Dostarczone", priority: "high", status: "done" }]);
  mocks.cost.mockResolvedValue({ costCents: 125 }); mocks.products.mockResolvedValue([{ id: "product", title: "Raport", status: "ready" }]);
  await act(async () => { await client.invalidateQueries({ queryKey: ["issues"] }); }); await settle();
  await act(async () => click("Tabela"));
  expect(mocks.cost).not.toHaveBeenCalled();
  await act(async () => click("Sprawdź koszt i wynik")); await settle();
  expect(mocks.cost).toHaveBeenCalledWith("t"); expect(mocks.products).toHaveBeenCalledWith("t");
  expect(host.querySelector("tbody")?.textContent).toContain("Raport"); expect(host.querySelector("tbody")?.textContent).toContain("1,25");
  mocks.products.mockResolvedValue([{ id: "product", title: "Poprawiony raport", status: "ready" }]);
  await act(async () => { mocks.live?.({ companyId: "c", type: "activity.logged", payload: { entityType: "issue", entityId: "t", action: "issue.work_product_updated" } }); }); await settle();
  expect(host.querySelector("tbody")?.textContent).toContain("Poprawiony raport");
});
