// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CompanyRolesPanel } from "./CompanyRolesPanel";
const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), apply: vi.fn(), remove: vi.fn(), access: vi.fn() }));
vi.mock("../api/companyRoles", () => ({ companyRolesApi: mocks }));
vi.mock("../api/access", () => ({ accessApi: { getCurrentBoardAccess: mocks.access } }));
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
beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue([role]); mocks.create.mockResolvedValue({ ...role, name: "Nowa" }); mocks.update.mockResolvedValue({ ...role, name: "Zmieniona", version: 3 }); mocks.apply.mockResolvedValue({}); });
afterEach(async () => { if (root) await act(async () => root.unmount()); client?.clear(); host?.remove(); });
it("lists roles and explains versioned application", async () => { await mount(); expect(host.textContent).toContain("Rekruter"); expect(host.textContent).toContain("agents:create"); expect(host.textContent).toContain("zastępuje"); });
it("creates a role and displays saved result", async () => { await mount(); await click("Nowa rola"); await input("Nazwa roli", "Nowa"); await submit(); expect(host.textContent).toContain("Nowa"); expect(mocks.create).toHaveBeenCalledWith("c", { name: "Nowa", description: "", permissions: [] }); });
it("validates blank name without sending a mutation", async () => { await mount(); await click("Nowa rola"); await input("Nazwa roli", "   "); await submit(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("nazwę"); expect(mocks.create).not.toHaveBeenCalled(); });
it("keeps viewer read-only", async () => { await mount(true); expect(host.textContent).toContain("Rekruter"); expect(host.querySelector("button")).toBeNull(); expect(host.textContent).toContain("odczytu"); });
it("surfaces list and mutation errors", async () => { mocks.list.mockRejectedValueOnce(new Error("Brak dostępu")); await mount(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("Brak dostępu"); });
it("preserves draft on rejected save", async () => { mocks.create.mockRejectedValue(new Error("Nazwa zajęta")); await mount(); await click("Nowa rola"); await input("Nazwa roli", "Duplikat"); await submit(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nazwa zajęta"); expect((host.querySelector('[aria-label="Nazwa roli"]') as HTMLInputElement).value).toBe("Duplikat"); });
it("edits with the loaded version", async () => { await mount(); await click("Edytuj Rekruter"); await input("Nazwa roli", "Zmieniona"); await submit(); expect(mocks.update).toHaveBeenCalledWith("c", "r", { name: "Zmieniona", description: "Zespół", permissions: ["agents:create"], version: 2 }); expect(host.textContent).toContain("Zmieniona"); });
it("applies the exact role version to a membership", async () => { await mount(); await input("Identyfikator członkostwa", "11111111-1111-4111-8111-111111111111"); await click("Zastosuj Rekruter"); expect(mocks.apply).toHaveBeenCalledWith("c", "11111111-1111-4111-8111-111111111111", { roleId: "r", version: 2 }); expect(host.textContent).toContain("Zastosowano"); });

it("deletes a role only after explicit confirmation", async () => { mocks.remove.mockResolvedValue({ deleted: true }); await mount(); await click("Usuń Rekruter"); expect(mocks.remove).not.toHaveBeenCalled(); await click("Potwierdź usunięcie Rekruter"); expect(mocks.remove).toHaveBeenCalledWith("c", "r", 2); expect(host.textContent).not.toContain("Edytuj Rekruter"); });
