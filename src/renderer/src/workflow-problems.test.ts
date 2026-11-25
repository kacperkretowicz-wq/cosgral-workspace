import { checkWorkflowDraft, type WorkflowGraph, workflowProblems } from "@openbot/contracts/ipc";
import { flush } from "solid-js";
import { afterEach, expect, it } from "vitest";
import { setLanguage } from "./i18n";
import { workflowProblemText } from "./workflow-problems";

afterEach(() => {
  setLanguage("en");
  flush();
});

const SAMPLES: Array<[string, string]> = [
  ["At most 40 steps.", "40"],
  ["At most 80 connections.", "80"],
  ["Two steps have the same id: n1.", "n1"],
  ["Two connections have the same id: e1.", "e1"],
  ["Connection e2 points to an unknown step.", "e2"],
  ['Connection "Ask" → "Say" leaves the approval "Ask": use Allow or Deny.', "Say"],
  ['Connection "Check" → "Say" leaves the condition "Check": use Yes or No.', "Say"],
  ['Connection "Run" → "Say" leaves "Run": use Next.', "Say"],
  ['The trigger cannot have incoming connections ("Say" → "Start").', "Start"],
  ['The approval "Ask" needs an Allow connection.', "Ask"],
  ['The approval "Ask" has more than one way on for a decision.', "Ask"],
  ['The condition "Check" needs a Yes or a No connection.', "Check"],
  ['The condition "Check" has more than one way on for an answer.', "Check"],
  ['These steps are not reachable from the trigger: "A", "B".', "A"],
  ['"Run" has more than one way on; keep one connection.', "Run"],
  ["A workflow has exactly one trigger.", "trigger"],
  ["Every step needs a title (1–80 characters).", "80"],
  ['The routine "r1" in the trigger does not exist.', "r1"],
  ['The agent "bot" in step "Ask" does not exist.', "Ask"],
  ['The project "general" in step "Post" does not exist.', "Post"],
  ['Step "Ask" needs an agent.', "Ask"],
  ['Step "Post" needs a project.', "Post"],
  ['Step "Ask" needs an instruction.', "Ask"],
  ['Step "Check" needs a text to check.', "Check"],
  ['Step "Check" needs a value to compare with.', "Check"],
  ['Step "Say" needs a text.', "Say"],
  ['Step "Say": the text is longer than 8000 characters.', "8000"],
  ['Step "Check": the value is longer than 500 characters.', "500"],
  ['This workflow cannot be saved: Step "Post" needs a project. Step "Check" needs a value to compare with.', "Post"],
];

it("leaves the English sentence as it is in English", () => {
  for (const [sentence] of SAMPLES) expect(workflowProblemText(sentence)).toBe(sentence);
});

it("translates every sentence the contract can produce and keeps its value", () => {
  setLanguage("pl");
  flush();
  for (const [sentence, value] of SAMPLES) {
    const text = workflowProblemText(sentence);
    expect(text, sentence).not.toBe(sentence);
    if (value !== "trigger") expect(text, sentence).toContain(value);
  }
});

it("covers the problems the contract really reports for a broken graph", () => {
  const base = { x: 0, y: 0 };
  const graph: WorkflowGraph = {
    nodes: [
      { ...base, id: "t1", title: "Start", type: "trigger", trigger: { kind: "manual" } },
      { ...base, id: "a1", title: "Ask", type: "approval", botId: "bot", text: "Ok?" },
      { ...base, id: "p1", title: "Say", type: "prompt", text: "Hi" },
      { ...base, id: "p1", title: "Say again", type: "prompt", text: "Hi" },
      {
        ...base,
        id: "c1",
        title: "Check",
        type: "condition",
        subject: "x",
        operator: "contains",
        value: "y",
        caseSensitive: false,
      },
    ],
    edges: [
      { id: "e1", from: "t1", to: "a1", on: "next" },
      { id: "e1", from: "a1", to: "p1", on: "next" },
      { id: "e2", from: "a1", to: "missing", on: "allow" },
      { id: "e3", from: "p1", to: "t1", on: "next" },
      { id: "e4", from: "c1", to: "p1", on: "allow" },
    ],
  };
  const problems = workflowProblems(graph);
  expect(problems.length).toBeGreaterThan(5);
  setLanguage("pl");
  flush();
  for (const problem of problems) expect(workflowProblemText(problem), problem).not.toBe(problem);
});

it("shows no raw step or connection id, in either language", () => {
  const base = { x: 0, y: 0 };
  const graph: WorkflowGraph = {
    nodes: [
      { ...base, id: "step-1795613226335", title: "Start", type: "trigger", trigger: { kind: "manual" } },
      { ...base, id: "step-1795613226336", title: "Zgoda", type: "approval", botId: "bot", text: "Ok?" },
      { ...base, id: "step-1795613226337", title: "Say", type: "prompt", text: "Hi" },
    ],
    edges: [
      { id: "edge-1795613226338", from: "step-1795613226335", to: "step-1795613226336", on: "next" },
      { id: "edge-1795613226339", from: "step-1795613226336", to: "step-1795613226337", on: "next" },
    ],
  };
  const problems = workflowProblems(graph);
  expect(problems.length).toBeGreaterThan(1);
  for (const language of ["en", "pl"] as const) {
    setLanguage(language);
    flush();
    for (const problem of problems) {
      const text = workflowProblemText(problem);
      expect(text).not.toMatch(/step-\d|edge-\d/);
    }
  }
});

it("translates what a step still needs before the workflow can be saved", () => {
  const base = { x: 0, y: 0 };
  const graph: WorkflowGraph = {
    nodes: [
      { ...base, id: "t", title: "Start", type: "trigger", trigger: { kind: "manual" } },
      { ...base, id: "a", title: "Ask", type: "agent", botId: "", prompt: "" },
      {
        ...base,
        id: "c",
        title: "Check",
        type: "condition",
        subject: "{{previous}}",
        operator: "contains",
        value: "",
        caseSensitive: false,
      },
      { ...base, id: "o", title: "Post", type: "channel-output", channelId: "", text: "Done" },
    ],
    edges: [
      { id: "e1", from: "t", to: "a", on: "next" },
      { id: "e2", from: "a", to: "c", on: "next" },
      { id: "e3", from: "c", to: "o", on: "yes" },
    ],
  };
  const check = checkWorkflowDraft(graph, { botIds: [], channelIds: [], routineIds: [] });
  expect(check.canSave).toBe(false);
  const messages = check.nodeIssues.map((issue) => issue.message);
  expect(messages).toEqual(
    expect.arrayContaining([
      'Step "Ask" needs an agent.',
      'Step "Check" needs a value to compare with.',
      'Step "Post" needs a project.',
    ]),
  );
  setLanguage("pl");
  flush();
  for (const message of messages) expect(workflowProblemText(message), message).not.toBe(message);
  expect(workflowProblemText('Step "Post" needs a project.')).toBe("Krok „Post” wymaga wybrania projektu.");
});

it("drops Electron's prefix from a refused save", () => {
  setLanguage("pl");
  flush();
  expect(
    workflowProblemText("Error invoking remote method 'workflows:create': Error: Step \"Post\" needs a channel."),
  ).toBe("Krok „Post” wymaga wybrania projektu.");
});
