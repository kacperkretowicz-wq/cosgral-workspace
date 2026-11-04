import type { Db } from "@paperclipai/db";
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
  // Stable diagnostics as well as stable selection. Never include raw configuration,
  // other-company agents, provider errors or credentials in the conversation.
  roster.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const checks = await Promise.all(roster.map(async agent => {
    const reasons: string[] = [];
    if (agent.id === scope.coordinatorAgentId) reasons.push("koordynator rozmowy");
    if (!["idle", "running"].includes(agent.status)) reasons.push(`status ${agent.status}`);
    if (agent.lifecycleState !== "ready") reasons.push("środowisko agenta niegotowe");
    if (!agent.projectAccess) reasons.push("brak dostępu do projektu");
    if (agent.runtimeAvailability !== "local_cli_compatible_credentials_unverified") reasons.push("nieobsługiwany runtime");
    if (agent.availableSlots <= 0) reasons.push(`limit uruchomień ${agent.activeRuns}/${agent.maxConcurrentRuns}`);
    if (agent.budgetMonthlyCents > 0 && agent.spentMonthlyCents >= agent.budgetMonthlyCents) reasons.push("budżet wyczerpany");
    if (!reasons.length) {
      if (!(await canAssign(agent.id))) reasons.push("brak uprawnień do przypisania");
      else try { await assertAssignableAgent(db, scope.companyId, agent.id); }
      catch (error) {
        if (error && typeof error === "object" && "status" in error && [404, 409, 422].includes(Number(error.status))) reasons.push("nieprawidłowa hierarchia lub niedostępny agent");
        else throw error;
      }
    }
    return { agent, reasons };
  }));
  const eligible = checks.filter(row => !row.reasons.length).map(row => row.agent);
  const words = new Set(`${input.title} ${input.description ?? ""}`.toLocaleLowerCase("pl").match(/[\p{L}\p{N}+#.]+/gu)?.filter(word => word.length > 2) ?? []);
  const score = (agent: typeof eligible[number]) => {
    const skills = new Set(`${agent.role} ${agent.capabilities ?? ""}`.toLocaleLowerCase("pl").match(/[\p{L}\p{N}+#.]+/gu) ?? []);
    return (input.role && agent.role === input.role ? 100 : 0)
      + [...words].filter(word => skills.has(word)).length * 10
      + (input.model && agent.model === input.model ? 1 : 0);
  };
  // Disable cost for the WHOLE equal-capability group if any price is unknown.
  // Pairwise "skip when unknown" would make sorting non-transitive.
  const unpricedScores = new Set(eligible.filter(agent => !agent.modelPrice).map(score));
  eligible.sort((a, b) => score(b) - score(a)
    || (unpricedScores.has(score(a)) ? 0 : a.modelPrice!.usdPerReferenceBasket - b.modelPrice!.usdPerReferenceBasket)
    || a.openTaskCount - b.openTaskCount || a.activeTaskCount - b.activeTaskCount
    || a.activeRuns - b.activeRuns || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selected = input.preferredAgentId ? eligible.find(agent => agent.id === input.preferredAgentId) : eligible[0];
  const policy = "Kolejność: dostępność/uprawnienia/limity → jawny dostępny wybór → dopasowanie roli (100), słów kompetencji (10), wskazanego modelu (1) → referencyjny koszt → otwarte zadania → aktywne zadania → runy → ID rosnąco. Koszt referencyjny: standardowe API, 1 mln tokenów wejścia bez cache + 1 mln wyjścia; nie jest ceną subskrypcji ani prognozą rachunku. Brak ceny w grupie równego dopasowania wyłącza porównanie kosztu całej grupy. Limit otwartych zadań: brak w modelu; quota dostawcy i logowanie: niezweryfikowane. Wybór nie rezerwuje slotu; wykonanie ponownie sprawdza uprawnienia, pauzę i budżet.";
  const summary = selected
    ? `Dobór wykonawcy: ${selected.name} (${selected.id}). ${input.preferredAgentId ? "Jawny wybór użytkownika/koordynatora" : score(selected) > 0 ? "Dopasowanie roli/umiejętności/modelu" : "Fallback"}.`
    : `Brak wyboru: ${input.preferredAgentId ? "wybrany wykonawca jest niedostępny lub brak uprawnień; bez cichej zamiany" : "brak dostępnego wykonawcy z uprawnieniami"}.`;
  const diagnostics = checks.map(({ agent, reasons }) => {
    if (reasons.length) return `${agent.id}: ${reasons.join(", ")}.`;
    const price = agent.modelPrice ? `referencyjny koszt ${agent.modelPrice.usdPerReferenceBasket} USD (${agent.modelPrice.version})` : "brak danych o koszcie";
    return `${agent.id}: ${agent.id === selected?.id ? "wybrany" : "niższa pozycja w rankingu lub jawny wybór innego"}; dopasowanie ${score(agent)}; ${price}; otwarte zadania ${agent.openTaskCount}, aktywne zadania ${agent.activeTaskCount}; runy ${agent.activeRuns}/${agent.maxConcurrentRuns}; budżet ${agent.spentMonthlyCents}/${agent.budgetMonthlyCents} centów (limit 0 = bez limitu).`;
  });
  const unknownCost = roster.some(agent => !agent.modelPrice) ? " Dla części agentów: brak danych o koszcie." : "";
  return { agentId: selected?.id ?? null, reason: [summary, policy + unknownCost, ...diagnostics].join("\n") };
}
