import { type WorkflowGraph, workflowProblems } from "@openbot/contracts/ipc";
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
  ['Connection e3 leaves the approval "Ask": use "allow" or "deny".', "e3"],
  ['Connection e4 leaves the condition "Check": use "yes" or "no".', "e4"],
  ['Connection e5 leaves "Run": use "next".', "e5"],
  ["The trigger cannot have incoming connections (e6).", "e6"],
  ['The approval "Ask" needs an Allow connection.', "Ask"],
  ['The approval "Ask" has more than one way on for a decision.', "Ask"],
  ['The condition "Check" needs a Yes or a No connection.', "Check"],
  ['The condition "Check" has more than one way on for an answer.', "Check"],
  ['These steps are not reachable from the trigger: "A", "B".', "A"],
  ['"Run" has more than one way on; keep one connection.', "Run"],
  ["A workflow has exactly one trigger.", "trigger"],
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
