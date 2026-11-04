import type { Db } from "@paperclipai/db";
import { unprocessable } from "../errors.js";
import { projectConversationRoster } from "./heartbeat/project-conversation-roster.js";
import { assertAssignableAgent } from "./agent-assignability.js";

export interface ExecutorSelectionInput {
  title: string;
  description?: string;
  role?: string;
  model?: string;
  preferredAgentId?: string;
}

/** A recommendation under current authority, never a reservation or execution grant. */
export async function selectProjectExecutor(db: Db, scope: {
  companyId: string; projectId: string; coordinatorAgentId: string | null;
}, input: ExecutorSelectionInput, canAssign: (agentId: string) => Promise<boolean>) {
  const roster = await projectConversationRoster(db, scope.companyId, scope.projectId);
  const available = roster.filter(agent => agent.id !== scope.coordinatorAgentId
    && ["idle", "running"].includes(agent.status) && agent.projectAccess
    && agent.runtimeAvailability === "local_cli_compatible_credentials_unverified"
    && agent.availableSlots > 0
    && (agent.budgetMonthlyCents === 0 || agent.spentMonthlyCents < agent.budgetMonthlyCents));
  // One company-scoped snapshot; evaluate assignment with exactly the same task scope
  // as the eventual create route. Org-chain eligibility remains owned by assignability.
  const checks = await Promise.all(available.map(async agent => {
    if (!(await canAssign(agent.id))) return false;
    try { await assertAssignableAgent(db, scope.companyId, agent.id); return true; }
    catch (error) {
      if (error && typeof error === "object" && "status" in error && [404, 409, 422].includes(Number(error.status))) return false;
      throw error;
    }
  }));
  const eligible = available.filter((_, index) => checks[index]);
  const words = new Set(`${input.title} ${input.description ?? ""}`.toLocaleLowerCase("pl").match(/[\p{L}\p{N}+#.]+/gu)?.filter(word => word.length > 2) ?? []);
  const score = (agent: typeof eligible[number]) => {
    const skills = new Set(`${agent.role} ${agent.capabilities ?? ""}`.toLocaleLowerCase("pl").match(/[\p{L}\p{N}+#.]+/gu) ?? []);
    return (input.role && agent.role === input.role ? 100 : 0)
      + [...words].filter(word => skills.has(word)).length * 10
      + (input.model && agent.model === input.model ? 1 : 0);
  };
  eligible.sort((a, b) => score(b) - score(a) || a.activeTaskCount - b.activeTaskCount
    || a.activeRuns - b.activeRuns || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selected = input.preferredAgentId ? eligible.find(agent => agent.id === input.preferredAgentId) : eligible[0];
  if (!selected) throw unprocessable(input.preferredAgentId
    ? "Wybrany wykonawca jest niedostępny lub brak uprawnień do przypisania; wybierz innego jawnie."
    : "Brak dostępnego wykonawcy z uprawnieniami do projektu i przypisania.");
  const reason = `Dobór wykonawcy: ${selected.name} (${selected.id}). ${input.preferredAgentId ? "Jawny wybór użytkownika/koordynatora" : score(selected) > 0 ? "Dopasowanie roli/umiejętności/modelu" : "Fallback: najmniejsze obciążenie, następnie stały porządek ID"}; rola: ${selected.role}; model: ${selected.model ?? "nieustalony"}; dopasowanie: ${score(selected)}; aktywne zadania: ${selected.activeTaskCount}; runy: ${selected.activeRuns}/${selected.maxConcurrentRuns}. Dostęp i budżet sprawdzone; limity dostawcy, cena i logowanie niezweryfikowane. Wybór nie rezerwuje slotu; wykonanie ponownie sprawdza uprawnienia, pauzę i budżet.`;
  return { agentId: selected.id, reason };
}
