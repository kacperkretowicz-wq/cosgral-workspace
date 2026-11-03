// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectConversation } from "./ProjectConversation";
import { queryKeys } from "../lib/queryKeys";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  live: null as ((event: { companyId: string; type: string; payload: Record<string, unknown> }) => void) | null, tree: vi.fn(), release: vi.fn(), get: vi.fn(), getConversation: vi.fn(), openConversation: vi.fn(), setCoordinator: vi.fn(), projects: vi.fn(),
  comments: vi.fn(), send: vi.fn(), tasks: vi.fn(), agents: vi.fn(), directory: vi.fn(), session: vi.fn(), liveRuns: vi.fn(),
}));
vi.mock("../api/projects", () => ({ projectsApi: { get: mocks.get, getConversation: mocks.getConversation, openConversation: mocks.openConversation, setConversationCoordinator: mocks.setCoordinator, list: mocks.projects } }));
vi.mock("../api/issues", () => ({ issuesApi: { listComments: mocks.comments, addComment: mocks.send, listAll: mocks.tasks, getTreeControlState: mocks.tree, releaseTreeHold: mocks.release } }));
vi.mock("../api/agents", () => ({ agentsApi: { list: mocks.agents } }));
vi.mock("../api/heartbeats", () => ({ heartbeatsApi: { liveRunsForIssue: mocks.liveRuns } }));
vi.mock("../api/access", () => ({ accessApi: { listUserDirectory: mocks.directory } }));
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
  presenceMock.users = []; presenceMock.connected = false;
  mocks.liveRuns.mockResolvedValue([]);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  mocks.get.mockResolvedValue({ id: "p", name: "Uszko", companyId: "c" });
  mocks.getConversation.mockResolvedValue({ issueId: "chat", identifier: "COS-1", coordinatorAgentId: null, canManageCoordinator: true });
  mocks.projects.mockResolvedValue([{ id: "p", name: "Uszko" }]);
  mocks.comments.mockResolvedValue([{ id: "comment", body: "Wspólna historia", authorUserId: "u", createdAt: new Date().toISOString() }]);
  mocks.tree.mockResolvedValue({ activePauseHold: null }); mocks.release.mockResolvedValue({});
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
  it("shows present humans and other users typing using directory names", async () => {
    presenceMock.connected = true;
    presenceMock.users = [{ userId: "u", typingUntil: Date.now() + 5000 }, { userId: "b", typingUntil: Date.now() + 5000 }];
    mocks.directory.mockResolvedValue({ users: [{ principalId: "u", status: "active", user: { name: "Anna" } }, { principalId: "b", status: "active", user: { name: "Bogdan" } }] });
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.access.companyUserDirectory("c") }); }); await settle();
    expect(host.querySelector('[data-testid="conversation-presence-summary"]')?.textContent).toContain("Obecni: Anna, Bogdan");
    expect(host.querySelector('[data-testid="conversation-typing"]')?.textContent).toContain("Bogdan pisze…");
    expect(host.querySelector('[data-testid="conversation-typing"]')?.textContent).not.toContain("Anna pisze…");
    await act(async () => click("Szczegóły projektu"));
    expect(host.querySelector('[data-testid="conversation-presence"]')?.textContent).toContain("Bogdan");
    expect(host.querySelector('[data-testid="conversation-presence"]')?.textContent).toContain("Anna");
    expect(host.textContent).not.toContain("Obecność niedostępna");
  });
  it("shows coordinator work only for an active run in this conversation", async () => {
    client.setQueryData(["agents", "c"], [{ id: "a", name: "Ala", status: "running" }]);
    client.setQueryData(["projects", "conversation", "c", "p"], { issueId: "chat", coordinatorAgentId: "a", canManageCoordinator: true });
    await settle();
    expect(host.textContent).not.toContain("Ala pracuje nad tą rozmową");
    mocks.liveRuns.mockResolvedValue([{ id: "run", agentId: "a", status: "running" }]);
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.issues.liveRuns("chat") }); }); await settle();
    expect(mocks.liveRuns).toHaveBeenCalledWith("chat");
    expect(host.textContent).toContain("Ala pracuje nad tą rozmową");
    mocks.liveRuns.mockResolvedValue([]);
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
    mocks.setCoordinator.mockResolvedValue({ issueId: "chat", identifier: "COS-1", coordinatorAgentId: "a", canManageCoordinator: true });
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
    expect(host.querySelector<HTMLSelectElement>("select")?.disabled).toBe(true);
    await type("Szkic");
    await act(async () => click("Wyślij"));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(host.querySelector("textarea")?.value).toBe("Szkic");
  });
  it("selects the first coordinator through the same endpoint before a conversation exists", async () => {
    client.setQueryData(["projects", "conversation", "c", "p"], null);
    client.setQueryData(["agents", "c"], [{ id: "a", name: "Ala", status: "idle" }]);
    mocks.setCoordinator.mockResolvedValue({ issueId: "new-chat", identifier: "COS-2", coordinatorAgentId: "a", canManageCoordinator: true });
    await settle(); await type("Szkic przed wyborem");
    const select = host.querySelector<HTMLSelectElement>("select")!;
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
    const select = host.querySelector<HTMLSelectElement>("select")!;
    await act(async () => { select.value = "a"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await settle();
    expect(host.textContent).toContain("Nie udało się zmienić koordynatora");
    expect(host.querySelector("textarea")?.value).toBe("Zachowany szkic");
    expect(select.value).toBe("");
    expect(mocks.openConversation).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("refreshes the persisted coordinator on company activity", async () => {
    mocks.getConversation.mockResolvedValue({ issueId: "chat", coordinatorAgentId: "a", canManageCoordinator: true });
    client.setQueryData(["agents", "c"], [{ id: "a", name: "Ala", status: "idle" }]);
    await act(async () => mocks.live?.({ companyId: "c", type: "activity.logged", payload: { action: "project.conversation_coordinator_changed", entityId: "chat" } })); await settle();
    expect(host.querySelector("textarea")?.placeholder).toBe("Wiadomość do Ala…");
  });
  it("shows stored messages and author, hides the details panel and absent task cards", async () => {
    expect(host.textContent).toContain("Wspólna historia");
    expect(host.textContent).toContain("Anna");
    expect(host.querySelector('[aria-label="Szczegóły projektu"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(host.textContent).not.toContain("Plan i delegowanie");
    await act(async () => click("Szczegóły projektu"));
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
    const comment = (n: number) => ({ id: `id-${n}`, body: `History ${n}`, createdAt: new Date().toISOString() });
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
