import { describe, expect, it } from "vitest";
import {
  isProjectPlan,
  PROJECT_PLAN_HEADINGS,
  PROJECT_PLAN_LIMITS,
  parseDecideProjectPlanInput,
  parseProjectPlanReply,
  parseRequestProjectPlanInput,
  parseSaveProjectDescriptionInput,
  parseSetProjectReviewItemInput,
  projectDescriptionProblem,
  projectPlanRequestMessage,
} from "./ipc-project-plans";

const REPLY = [
  "Oto plan.",
  "## Cel",
  "Otworzyć sklep.",
  "## Zakres",
  "Sklep i płatności.",
  "## Ryzyka",
  "Opóźnienia.",
  "## Kroki",
  "1. Platforma",
  "## Zależności",
  "Dostawca.",
  "## Jakość",
  "Zdjęcia.",
  "## Testy",
  "Próbne zamówienie.",
  "## Bezpieczeństwo",
  "Płatności u operatora.",
  "## Kolejność",
  "Sklep, potem reklama.",
  "## Skille do utworzenia",
  "### opis-produktu",
  "Opis: gdy trzeba opisać produkt.",
  "Instrukcja:",
  "Zapytaj o zapach.",
  "### Zły Skill!",
  "Opis: nazwa jest niepoprawna.",
  "Instrukcja:",
  "Pominięty.",
  "## Potrzebne narzędzia",
  "- GitHub",
  "* Kalendarz",
  "Zwykłe zdanie bez punktora.",
].join("\n");

describe("parseProjectPlanReply", () => {
  it("splits the reply into the nine sections in a fixed order", () => {
    const parsed = parseProjectPlanReply(REPLY);
    expect(parsed.sections.map((section) => section.aspect)).toEqual([
      "goal",
      "scope",
      "risks",
      "steps",
      "dependencies",
      "quality",
      "tests",
      "security",
      "order",
    ]);
    expect(parsed.sections[0]?.text).toBe("Otworzyć sklep.");
  });

  it("does not take the skills heading for the steps and keeps only valid skill names", () => {
    const parsed = parseProjectPlanReply(REPLY);
    expect(parsed.sections.find((section) => section.aspect === "steps")?.text).toBe("1. Platforma");
    expect(parsed.skills).toEqual([
      { name: "opis-produktu", description: "gdy trzeba opisać produkt.", instructions: "Zapytaj o zapach." },
    ]);
  });

  it("lists only bullet lines as needs", () => {
    expect(parseProjectPlanReply(REPLY).needs).toEqual(["GitHub", "Kalendarz"]);
  });

  it("accepts English headings and gives no sections for a reply without known headings", () => {
    expect(parseProjectPlanReply("## Goal\nShip it.\n## Security\nNo secrets.").sections).toHaveLength(2);
    expect(parseProjectPlanReply("Just a paragraph.").sections).toEqual([]);
  });
});

describe("requests", () => {
  it("asks for every side of the project and promises that nothing is created", () => {
    const message = projectPlanRequestMessage("Sklep ze świecami", "Więcej o ryzykach");
    for (const heading of PROJECT_PLAN_HEADINGS) expect(message).toContain(heading);
    expect(message.length).toBeLessThan(1_300);
    expect(message).toContain("Sklep ze świecami");
    expect(message).toContain("Więcej o ryzykach");
    expect(message).toContain("Niczego nie twórz");
    expect(message).not.toMatch(/--|—/);
  });

  it("checks the description and the inputs", () => {
    expect(projectDescriptionProblem("  ")).toBe("Describe the project in a few sentences first.");
    expect(projectDescriptionProblem("x".repeat(PROJECT_PLAN_LIMITS.description + 1))).toBe(
      "The description is too long. Shorten it.",
    );
    expect(projectDescriptionProblem("Sklep")).toBeNull();
    expect(parseSaveProjectDescriptionInput({ channelId: "c", description: "  Sklep " })).toEqual({
      channelId: "c",
      description: "Sklep",
    });
    expect(parseRequestProjectPlanInput({ channelId: "c" })).toEqual({ channelId: "c" });
    expect(parseRequestProjectPlanInput({ channelId: "c", feedback: " Mniej " })).toEqual({
      channelId: "c",
      feedback: "Mniej",
    });
    expect(() => parseDecideProjectPlanInput({ channelId: "c", allow: "yes" })).toThrow("Answer yes or no.");
    expect(() => parseSetProjectReviewItemInput({ channelId: "c", itemId: "a", state: "suggested" })).toThrow();
    expect(() => parseRequestProjectPlanInput({})).toThrow("Choose a project.");
  });

  it("recognizes a plan and refuses a broken one", () => {
    const plan = {
      channelId: "c",
      description: "d",
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
      createdAt: "a",
      updatedAt: "b",
    };
    expect(isProjectPlan(plan)).toBe(true);
    expect(isProjectPlan({ ...plan, phase: "done" })).toBe(false);
    expect(isProjectPlan({ ...plan, skills: [{ name: "Bad Name" }] })).toBe(false);
  });
});
