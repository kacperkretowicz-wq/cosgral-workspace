import { describe, expect, it } from "vitest";
import {
  addWorkflowNode,
  checkWorkflowDraft,
  connectionKindsOf,
  connectWorkflowNodes,
  describeWorkflowCondition,
  emptyWorkflowGraph,
  evaluateWorkflowCondition,
  isWorkflowEdge,
  isWorkflowNode,
  removeWorkflowNode,
  WORKFLOW_CONDITION_OPERATORS,
  type WorkflowGraph,
  workflowOperatorNeedsValue,
  workflowPalette,
  workflowProblems,
} from "./ipc";

const KNOWN = { botIds: ["chief"], channelIds: ["general"], routineIds: [] };

/** trigger → agent → condition(contains "approved") → yes: output "Posted" / no: output "Not posted". */
function branching(): WorkflowGraph {
  let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger");
  graph = addWorkflowNode(graph, "agent", { botId: "chief", prompt: "Review {{input}}" });
  graph = addWorkflowNode(graph, "condition", { subject: "{{previous}}", operator: "contains", value: "approved" });
  graph = addWorkflowNode(graph, "channel-output", { channelId: "general", text: "Posted" });
  return addWorkflowNode(graph, "channel-output", { channelId: "general", text: "Not posted", after: "condition" });
}

describe("evaluating a condition", () => {
  it("compares trimmed text, ignoring case unless asked", () => {
    expect(evaluateWorkflowCondition("  Approved by Ann ", "contains", "approved", false)).toBe(true);
    expect(evaluateWorkflowCondition("Approved by Ann", "contains", "approved", true)).toBe(false);
    expect(evaluateWorkflowCondition("Approved", "equals", " approved ", false)).toBe(true);
    expect(evaluateWorkflowCondition("Approved!", "equals", "approved", false)).toBe(false);
    expect(evaluateWorkflowCondition("Approved!", "not-equals", "approved", false)).toBe(true);
    expect(evaluateWorkflowCondition("no problem", "not-contains", "error", false)).toBe(true);
    expect(evaluateWorkflowCondition("Error 500", "starts-with", "error", false)).toBe(true);
    expect(evaluateWorkflowCondition("Error 500", "ends-with", "500", true)).toBe(true);
    expect(evaluateWorkflowCondition("Error 500", "ends-with", "404", true)).toBe(false);
  });

  it("is-empty and is-not-empty need no value, and a blank text is empty", () => {
    expect(evaluateWorkflowCondition("  \n ", "is-empty", "", false)).toBe(true);
    expect(evaluateWorkflowCondition("x", "is-empty", "", false)).toBe(false);
    expect(evaluateWorkflowCondition("x", "is-not-empty", "", false)).toBe(true);
    expect(WORKFLOW_CONDITION_OPERATORS.filter((operator) => !workflowOperatorNeedsValue(operator))).toEqual([
      "is-empty",
      "is-not-empty",
    ]);
  });

  it("describes the condition on a card", () => {
    const node = branching().nodes.find((item) => item.type === "condition");
    if (node?.type !== "condition") throw new Error("no condition");
    expect(describeWorkflowCondition(node)).toBe('{{previous}} contains "approved"');
    expect(describeWorkflowCondition({ ...node, operator: "is-empty", subject: "{{steps.a}}" })).toBe(
      "{{steps.a}} is empty",
    );
    expect(describeWorkflowCondition({ ...node, subject: " " })).toBe('… contains "approved"');
    // The window passes its own words for the operator.
    expect(describeWorkflowCondition(node, () => "zawiera")).toBe('{{previous}} zawiera "approved"');
  });
});

describe("the new steps in a graph", () => {
  it("a condition takes Yes first, then No; a prompt takes Next", () => {
    const graph = branching();
    expect(graph.edges.filter((edge) => edge.from === "condition").map((edge) => edge.on)).toEqual(["yes", "no"]);
    expect(workflowProblems(graph)).toEqual([]);
    const condition = graph.nodes.find((node) => node.id === "condition");
    if (!condition) throw new Error("no condition");
    expect(connectionKindsOf(condition)).toEqual(["yes", "no"]);
    let withPrompt = addWorkflowNode(emptyWorkflowGraph(), "trigger");
    withPrompt = addWorkflowNode(withPrompt, "prompt", { text: "Be brief." });
    withPrompt = addWorkflowNode(withPrompt, "agent", { botId: "chief", prompt: "{{previous}} Now answer." });
    expect(withPrompt.edges.map((edge) => edge.on)).toEqual(["next", "next"]);
    expect(withPrompt.nodes[1]).toMatchObject({ id: "prompt", title: "Prompt", text: "Be brief." });
    expect(workflowProblems(withPrompt)).toEqual([]);
  });

  it("the shape rules: a condition needs a Yes or a No, one of each at most, and no Next", () => {
    const graph = branching();
    const [yes, no] = graph.edges.filter((edge) => edge.from === "condition");
    if (!yes || !no) throw new Error("no condition edges");
    const none: WorkflowGraph = { nodes: graph.nodes, edges: graph.edges.filter((edge) => edge.from !== "condition") };
    expect(workflowProblems(none).join(" ")).toMatch(/needs a Yes or a No connection/);
    const onlyNo: WorkflowGraph = { nodes: graph.nodes, edges: graph.edges.filter((edge) => edge.id !== yes.id) };
    expect(workflowProblems(onlyNo).filter((problem) => /condition/.test(problem))).toEqual([]);
    const twoYes: WorkflowGraph = { nodes: graph.nodes, edges: [...graph.edges, { ...no, id: "extra", on: "yes" }] };
    expect(workflowProblems(twoYes).join(" ")).toMatch(/more than one way on for an answer/);
    const wrong: WorkflowGraph = {
      nodes: graph.nodes,
      edges: graph.edges.map((edge) => (edge.id === yes.id ? { ...edge, on: "next" as const } : edge)),
    };
    expect(workflowProblems(wrong).join(" ")).toMatch(/leaves the condition .*: use Yes or No/);
    // "yes" leaving an agent step is refused too.
    const agentYes: WorkflowGraph = {
      nodes: graph.nodes,
      edges: graph.edges.map((edge) => (edge.from === "agent" ? { ...edge, on: "yes" as const } : edge)),
    };
    expect(workflowProblems(agentYes).join(" ")).toMatch(/use Next/);
    // A person reads these: titles, never the ids of steps or connections.
    for (const text of [...workflowProblems(wrong), ...workflowProblems(agentYes)]) {
      for (const node of graph.nodes) expect(text).not.toContain(`(${node.id})`);
      for (const edge of graph.edges) expect(text).not.toContain(edge.id);
    }
  });

  it("connecting from a condition picks Yes then No, and the guards accept the new steps and edges", () => {
    let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger");
    graph = addWorkflowNode(graph, "condition", { value: "ok" });
    graph = addWorkflowNode(graph, "channel-output", { channelId: "general", text: "A", after: null });
    graph = addWorkflowNode(graph, "channel-output", { channelId: "general", text: "B", after: null });
    graph = connectWorkflowNodes(graph, "condition", "output");
    graph = connectWorkflowNodes(graph, "condition", "output-2");
    expect(graph.edges.filter((edge) => edge.from === "condition").map((edge) => [edge.on, edge.to])).toEqual([
      ["yes", "output"],
      ["no", "output-2"],
    ]);
    expect(graph.nodes.every(isWorkflowNode)).toBe(true);
    expect(graph.edges.every(isWorkflowEdge)).toBe(true);
    expect(
      isWorkflowNode({
        id: "c",
        type: "condition",
        title: "C",
        x: 0,
        y: 0,
        subject: "x",
        operator: "huh",
        value: "",
        caseSensitive: false,
      }),
    ).toBe(false);
    expect(
      isWorkflowNode({
        id: "c",
        type: "condition",
        title: "C",
        x: 0,
        y: 0,
        subject: "x",
        operator: "equals",
        value: "",
        caseSensitive: "no",
      }),
    ).toBe(false);
    expect(isWorkflowNode({ id: "p", type: "prompt", title: "P", x: 0, y: 0 })).toBe(false);
  });

  it("removing a condition in the middle does not bridge two ways into one", () => {
    const graph = removeWorkflowNode(branching(), "condition");
    expect(graph.edges.map((edge) => edge.from)).toEqual(["trigger"]);
  });

  it("the draft check names what the new steps still need, and the picker offers both", () => {
    let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger");
    graph = addWorkflowNode(graph, "prompt");
    graph = addWorkflowNode(graph, "condition", { subject: " ", operator: "equals" });
    const messages = checkWorkflowDraft(graph, KNOWN).nodeIssues.map((issue) => issue.message);
    expect(messages).toEqual([
      'Step "Prompt" needs a text.',
      'Step "Condition" needs a text to check.',
      'Step "Condition" needs a value to compare with.',
    ]);
    const entries = workflowPalette(addWorkflowNode(emptyWorkflowGraph(), "trigger")).flatMap(
      (section) => section.entries,
    );
    expect(
      entries
        .filter((entry) => entry.id === "prompt" || entry.id === "condition")
        .map((entry) => [entry.type, entry.available]),
    ).toEqual([
      ["prompt", true],
      ["condition", true],
    ]);
    // A condition that compares for emptiness needs no value.
    const empty = addWorkflowNode(addWorkflowNode(emptyWorkflowGraph(), "trigger"), "condition", {
      operator: "is-empty",
    });
    expect(checkWorkflowDraft(empty, KNOWN).nodeIssues).toEqual([]);
  });
});
