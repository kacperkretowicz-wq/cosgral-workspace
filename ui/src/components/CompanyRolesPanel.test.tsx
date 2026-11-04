// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompanyRolesPanel } from "./CompanyRolesPanel";
const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), apply: vi.fn(), remove: vi.fn(), access: vi.fn(), members: vi.fn(), agentRecipients: vi.fn() }));
vi.mock("../api/companyRoles", () => ({ companyRolesApi: mocks }));
vi.mock("../api/access", () => ({ accessApi: { getCurrentBoardAccess: mocks.access, listMembers: mocks.members } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const role = { id: "r", companyId: "c", name: "Rekruter", description: "Zespół", permissions: ["agents:create"], version: 2 };
let host: HTMLDivElement, root: Root, client: QueryClient;
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });
const button = (text: string) => Array.from(host.querySelectorAll("button")).find(b => b.textContent === text)!;
async function mount(viewer = false) {
 mocks.access.mockResolvedValue({ memberships: [{ companyId: "c", membershipRole: viewer ? "viewer" : "admin", status: "active" }] });
 host = document.createElement("div"); document.body.append(host); root = createRoot(host);
 client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
 await act(async () => root.render(<QueryClientProvider client={client}><CompanyRolesPanel companyId="c" userId="u" /></QueryClientProvider>)); await flush();
}
async function input(label: string, value: string) {
 const node = host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
 await act(async () => {
  Object.getOwnPropertyDescriptor(node.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value);
  node.dispatchEvent(new Event("input", { bubbles: true }));
 });
}
async function click(text: string) { await act(async () => button(text).click()); await flush(); }
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); await flush(); }
beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue([role]); mocks.agentRecipients.mockResolvedValue([{ memberId: "22222222-2222-4222-8222-222222222222", agentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Codex" }]); mocks.members.mockResolvedValue({ members: [{ id: "11111111-1111-4111-8111-111111111111", principalId: "u1", status: "active", membershipRole: "operator", user: { name: "Anna", email: "anna@example.test" } }, { id: "admin", status: "active", membershipRole: "admin", user: { name: "Admin" } }, { id: "inactive", status: "suspended", membershipRole: "operator", user: { name: "Nieaktywny" } }] }); mocks.create.mockResolvedValue({ ...role, name: "Nowa" }); mocks.update.mockResolvedValue({ ...role, name: "Zmieniona", version: 3 }); mocks.apply.mockResolvedValue({}); });
afterEach(async () => { if (root) await act(async () => root.unmount()); client?.clear(); host?.remove(); });
it("lists roles and explains versioned application", async () => { await mount(); expect(host.textContent).toContain("Rekruter"); expect(host.textContent).toContain("agents:create"); expect(host.textContent).toContain("zastępuje"); });
it("creates a role and displays saved result", async () => { await mount(); await click("Nowa rola"); await input("Nazwa roli", "Nowa"); await submit(); expect(host.textContent).toContain("Nowa"); expect(mocks.create).toHaveBeenCalledWith("c", { name: "Nowa", description: "", permissions: [] }); });
it("validates blank name without sending a mutation", async () => { await mount(); await click("Nowa rola"); await input("Nazwa roli", "   "); await submit(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("nazwę"); expect(mocks.create).not.toHaveBeenCalled(); });
it("keeps viewer read-only", async () => { await mount(true); expect(host.textContent).toContain("Rekruter"); expect(host.querySelector("button")).toBeNull(); expect(host.textContent).toContain("odczytu"); });
it("surfaces list and mutation errors", async () => { mocks.list.mockRejectedValueOnce(new Error("Brak dostępu")); await mount(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("Brak dostępu"); });
it("preserves draft on rejected save", async () => { mocks.create.mockRejectedValue(new Error("Nazwa zajęta")); await mount(); await click("Nowa rola"); await input("Nazwa roli", "Duplikat"); await submit(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nazwa zajęta"); expect((host.querySelector('[aria-label="Nazwa roli"]') as HTMLInputElement).value).toBe("Duplikat"); });
it("edits with the loaded version", async () => { await mount(); await click("Edytuj Rekruter"); await input("Nazwa roli", "Zmieniona"); await submit(); expect(mocks.update).toHaveBeenCalledWith("c", "r", { name: "Zmieniona", description: "Zespół", permissions: ["agents:create"], version: 2 }); expect(host.textContent).toContain("Zmieniona"); });
it("selects an eligible person by name and applies the exact role version", async () => { await mount(); const select = host.querySelector('[aria-label="Członek firmy"]') as HTMLSelectElement; expect(select.textContent).toContain("Anna (anna@example.test)"); expect(select.textContent).not.toContain("Admin"); expect(select.textContent).not.toContain("Nieaktywny"); await act(async () => { select.value = "11111111-1111-4111-8111-111111111111"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await click("Zastosuj Rekruter"); expect(mocks.apply).toHaveBeenCalledWith("c", "11111111-1111-4111-8111-111111111111", { roleId: "r", version: 2 }); expect(host.textContent).toContain("Zastosowano"); });

it("keeps manual membership entry available", async () => { await mount(); const kind = host.querySelector('[aria-label="Rodzaj odbiorcy"]') as HTMLSelectElement; await act(async () => { kind.value = "manual"; kind.dispatchEvent(new Event("change", { bubbles: true })); }); await input("Identyfikator członkostwa", "11111111-1111-4111-8111-111111111111"); await click("Zastosuj Rekruter"); expect(mocks.apply).toHaveBeenCalledWith("c", "11111111-1111-4111-8111-111111111111", { roleId: "r", version: 2 }); });
it("selects an agent by name but submits its membership ID", async () => { await mount(); const kind = host.querySelector('[aria-label="Rodzaj odbiorcy"]') as HTMLSelectElement; await act(async () => { kind.value = "agent"; kind.dispatchEvent(new Event("change", { bubbles: true })); }); const select = host.querySelector('[aria-label="Agent"]') as HTMLSelectElement; expect(select.textContent).toContain("Codex"); await act(async () => { select.value = "22222222-2222-4222-8222-222222222222"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await click("Zastosuj Rekruter"); expect(mocks.apply).toHaveBeenCalledWith("c", "22222222-2222-4222-8222-222222222222", { roleId: "r", version: 2 }); });

it("shows directory errors without allowing a user assignment", async () => { mocks.members.mockRejectedValue(new Error("Błąd katalogu")); await mount(); for (let i = 0; i < 10 && !host.textContent?.includes("Błąd katalogu"); i++) await flush(); expect(host.textContent).toContain("Błąd katalogu"); expect(button("Zastosuj Rekruter").disabled).toBe(true); });

it("deletes a role only after explicit confirmation", async () => { mocks.remove.mockResolvedValue({ deleted: true }); await mount(); await click("Usuń Rekruter"); expect(mocks.remove).not.toHaveBeenCalled(); await click("Potwierdź usunięcie Rekruter"); expect(mocks.remove).toHaveBeenCalledWith("c", "r", 2); expect(host.textContent).not.toContain("Edytuj Rekruter"); });
