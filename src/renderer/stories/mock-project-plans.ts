// COSGRAL: the plan of a project for Storybook and the preview (`window.openbot.projectPlans`). Demo data only; the same rules as the
// program: the plan must be accepted before the two questions, skills and the review need their own yes, and nothing is turned on by
// itself. The lead "writes" a canned plan after `delayMs` (0 = at once, for tests); `finish()` ends the wait early.

import {
  type ProjectPlan,
  type ProjectPlansDesktopApi,
  parseDecideProjectPlanInput,
  parseProjectPlanChannelInput,
  parseProjectPlanReply,
  parseRequestProjectPlanInput,
  parseSaveProjectDescriptionInput,
  parseSetProjectReviewItemInput,
} from "@openbot/contracts/ipc";

export const MOCK_PLAN_REPLY = [
  "## Cel",
  "Otworzyć sklep ze świecami i sprzedać pierwsze sto sztuk w dwa miesiące.",
  "## Zakres",
  "Sklep internetowy, płatności, wysyłka. Bez własnej aplikacji.",
  "## Ryzyka",
  "Opóźnione dostawy wosku. Zbyt mały ruch na starcie.",
  "## Kroki",
  "1. Wybrać platformę sklepu. 2. Dodać produkty. 3. Uruchomić płatności. 4. Zrobić pierwszą kampanię.",
  "## Zależności",
  "Dostawca wosku, konto firmowe w banku, kurier.",
  "## Jakość",
  "Każdy produkt ma zdjęcie, opis i cenę. Strona działa też na telefonie.",
  "## Testy",
  "Próbne zamówienie od początku do końca przed otwarciem.",
  "## Bezpieczeństwo",
  "Płatności tylko przez sprawdzonego operatora. Dane klientów nie trafiają do arkuszy.",
  "## Kolejność",
  "Najpierw sklep i płatności, potem kampania.",
  "## Skille do utworzenia",
  "### opis-produktu",
  "Opis: gdy trzeba napisać opis nowego produktu.",
  "Instrukcja:",
  "Zapytaj o zapach i wielkość. Napisz trzy krótkie zdania. Dodaj skład.",
  "## Potrzebne narzędzia",
  "- GitHub",
  "- Kalendarz",
].join("\n");

export interface MockProjectPlans extends Required<ProjectPlansDesktopApi> {
  /** The lead's work ends now: the plan is proposed. */
  finish: () => void;
}

export function createMockProjectPlans(options: { delayMs?: number } = {}): MockProjectPlans {
  const plans = new Map<string, ProjectPlan>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let clock = Date.parse("2026-11-25T10:00:00.000Z");
  const now = () => {
    clock += 1_000;
    return new Date(clock).toISOString();
  };
  const need = (channelId: string): ProjectPlan => {
    const plan = plans.get(channelId);
    if (!plan) throw new Error("There is no plan for this project yet.");
    return plan;
  };
  const accepted = (channelId: string): ProjectPlan => {
    const plan = need(channelId);
    if (plan.phase !== "accepted") throw new Error("Accept the plan first.");
    return plan;
  };
  const put = (plan: ProjectPlan): ProjectPlan => {
    const next = { ...plan, updatedAt: now() };
    plans.set(plan.channelId, next);
    return structuredClone(next);
  };
  const propose = (channelId: string) => {
    const plan = plans.get(channelId);
    if (plan?.phase !== "planning") return;
    const parsed = parseProjectPlanReply(MOCK_PLAN_REPLY);
    put({
      ...plan,
      phase: "proposed",
      sections: parsed.sections,
      skills: parsed.skills.map((skill) => ({ ...skill, state: "draft", problem: null })),
      needs: parsed.needs,
    });
  };
  return {
    get: async (input) => {
      const plan = plans.get(parseProjectPlanChannelInput(input).channelId);
      return plan ? structuredClone(plan) : null;
    },
    saveDescription: async (input) => {
      const { channelId, description } = parseSaveProjectDescriptionInput(input);
      const existing = plans.get(channelId);
      if (existing?.phase === "planning")
        throw new Error("The lead is still working on the plan. Wait for it to finish.");
      const at = now();
      return put(
        existing
          ? { ...existing, description }
          : {
              channelId,
              description,
              phase: "described",
              taskId: null,
              sections: [],
              raw: "",
              skills: [],
              needs: [],
              skillsConsent: "not-asked",
              reviewConsent: "not-asked",
              review: [],
              reviewedAt: null,
              createdAt: at,
              updatedAt: at,
            },
      );
    },
    requestPlan: async (input) => {
      const { channelId } = parseRequestProjectPlanInput(input);
      const plan = need(channelId);
      if (plan.phase === "planning") throw new Error("The lead is already working on the plan.");
      if (plan.phase === "accepted")
        throw new Error("The plan is already accepted. Ask for changes in the project chat.");
      const next = put({
        ...plan,
        phase: "planning",
        taskId: `task-${channelId}`,
        sections: [],
        raw: "",
        skills: [],
        needs: [],
        skillsConsent: "not-asked",
        reviewConsent: "not-asked",
        review: [],
        reviewedAt: null,
      });
      timers.set(
        channelId,
        setTimeout(() => propose(channelId), options.delayMs ?? 0),
      );
      return next;
    },
    accept: async (input) => {
      const plan = need(parseProjectPlanChannelInput(input).channelId);
      if (plan.phase !== "proposed") throw new Error("There is no plan to accept yet.");
      return put({ ...plan, phase: "accepted" });
    },
    decideSkills: async (input) => {
      const { channelId, allow } = parseDecideProjectPlanInput(input);
      const plan = accepted(channelId);
      if (!allow) return put({ ...plan, skillsConsent: "declined" });
      if (plan.skills.length === 0) throw new Error("The plan has no skills to create.");
      return put({
        ...plan,
        skillsConsent: "done",
        skills: plan.skills.map((skill) => ({ ...skill, state: "created", problem: null })),
      });
    },
    decideReview: async (input) => {
      const { channelId, allow } = parseDecideProjectPlanInput(input);
      const plan = accepted(channelId);
      if (!allow) return put({ ...plan, reviewConsent: "declined", review: [], reviewedAt: null });
      return put({
        ...plan,
        reviewConsent: "done",
        reviewedAt: now(),
        review: [
          { id: "github", kind: "plugin", title: "GitHub", reason: "Named in the plan: GitHub", state: "suggested" },
          {
            id: "skill:writing-helper",
            kind: "skill",
            title: "Writing helper",
            reason: "Fits: opisy, produktu",
            state: "suggested",
          },
        ],
      });
    },
    setReviewItem: async (input) => {
      const { channelId, itemId, state } = parseSetProjectReviewItemInput(input);
      const plan = accepted(channelId);
      if (plan.reviewConsent !== "done") throw new Error("Allow the review first.");
      if (!plan.review.some((item) => item.id === itemId)) throw new Error("This item is not in the review.");
      return put({ ...plan, review: plan.review.map((item) => (item.id === itemId ? { ...item, state } : item)) });
    },
    finish: () => {
      for (const channelId of plans.keys()) propose(channelId);
    },
  };
}
