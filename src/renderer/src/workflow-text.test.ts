import { WORKFLOW_CONDITION_OPERATORS, type WorkflowNode } from "@openbot/contracts/ipc";
import { flush } from "solid-js";
import { afterEach, expect, it } from "vitest";
import { setLanguage } from "./i18n";
import { conditionOperatorLabel, conditionText, workflowDiffText } from "./workflow-text";

afterEach(() => {
  setLanguage("en");
  flush();
});

const condition: Extract<WorkflowNode, { type: "condition" }> = {
  id: "c",
  title: "Check",
  x: 0,
  y: 0,
  type: "condition",
  subject: "{{previous}}",
  operator: "contains",
  value: "gotowe",
  caseSensitive: false,
};

it("keeps the English words of a condition in English", () => {
  expect(conditionText(condition)).toBe('{{previous}} contains "gotowe"');
});

it("says every operator of a condition in Polish", () => {
  setLanguage("pl");
  flush();
  for (const operator of WORKFLOW_CONDITION_OPERATORS) {
    expect(conditionOperatorLabel(operator), operator).toMatch(/^[a-ząćęłńóśźż ]+$/);
    expect(conditionOperatorLabel(operator)).not.toMatch(/\b(contain|exactly|starts|ends|empty|is not)\b/);
  }
  expect(conditionText(condition)).toBe('{{previous}} zawiera "gotowe"');
  expect(conditionText({ ...condition, operator: "is-empty" })).toBe("{{previous}} jest pusty");
});

it("says what changed between two versions in the window language", () => {
  const diff = {
    added: ["Wyjście"],
    removed: [],
    changed: ["Agent", "Zgoda"],
    connectionsChanged: true,
    different: true,
  };
  expect(workflowDiffText(diff)).toBe("Added: Wyjście. Changed: Agent, Zgoda. Connections changed.");
  setLanguage("pl");
  flush();
  expect(workflowDiffText(diff)).toBe("Dodano: Wyjście. Zmieniono: Agent, Zgoda. Zmieniły się połączenia.");
  expect(workflowDiffText({ added: [], removed: [], changed: [], connectionsChanged: false, different: false })).toBe(
    "Zmieniło się tylko położenie kroków na płótnie.",
  );
});
