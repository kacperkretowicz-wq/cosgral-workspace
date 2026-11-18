import { describe, expect, it } from "vitest";
import {
  addWorkflowNode,
  describeWorkflowDiff,
  diffWorkflowGraphs,
  emptyWorkflowGraph,
  isWorkflowVersionDetails,
  isWorkflowVersionSummary,
  moveWorkflowNode,
  WORKFLOW_VERSION_LIMITS,
  type WorkflowGraph,
  workflowGraphSummary,
  workflowGraphsEqual,
} from "./ipc";

function base(): WorkflowGraph {
  let graph = addWorkflowNode(emptyWorkflowGraph(), "trigger");
  graph = addWorkflowNode(graph, "agent", { botId: "chief", prompt: "Write the brief" });
  return addWorkflowNode(graph, "channel-output", { channelId: "general", text: "{{previous}}" });
}

describe("workflow versions: the summary of a graph", () => {
  it("counts the kinds of steps in plain words, with one and many", () => {
    expect(workflowGraphSummary(emptyWorkflowGraph())).toBe("empty");
    expect(workflowGraphSummary(base())).toBe("1 trigger, 1 agent step, 1 output");
    const more = addWorkflowNode(base(), "approval", { botId: "chief", text: "Ok?", after: "agent" });
    expect(workflowGraphSummary(addWorkflowNode(more, "agent", { botId: "chief", prompt: "Again" }))).toBe(
      "1 trigger, 2 agent steps, 1 approval, 1 output",
    );
  });

  it("keeps 20 versions", () => {
    expect(WORKFLOW_VERSION_LIMITS.kept).toBe(20);
  });
});

describe("workflow versions: equality and differences", () => {
  it("two graphs are equal whatever the order of their lists, but not when a position changes", () => {
    const graph = base();
    const shuffled: WorkflowGraph = { nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() };
    expect(workflowGraphsEqual(graph, shuffled)).toBe(true);
    expect(workflowGraphsEqual(graph, moveWorkflowNode(graph, "agent", 1, 1))).toBe(false);
  });

  it("says what was added, removed and changed, and that moving a step is not a change of content", () => {
    const older = base();
    const added = addWorkflowNode(older, "approval", { botId: "chief", text: "Post it?", after: "agent" });
    expect(describeWorkflowDiff(diffWorkflowGraphs(older, added))).toBe("Added: Approval. Connections changed.");
    expect(describeWorkflowDiff(diffWorkflowGraphs(added, older))).toBe("Removed: Approval. Connections changed.");

    const edited: WorkflowGraph = {
      nodes: older.nodes.map((node) =>
        node.id === "agent" && node.type === "agent" ? { ...node, prompt: "Write it short" } : node,
      ),
      edges: older.edges,
    };
    const diff = diffWorkflowGraphs(older, edited);
    expect(diff).toMatchObject({
      added: [],
      removed: [],
      changed: ["Agent"],
      connectionsChanged: false,
      different: true,
    });
    expect(describeWorkflowDiff(diff)).toBe("Changed: Agent.");

    const moved = moveWorkflowNode(older, "agent", 500, 500);
    const movedDiff = diffWorkflowGraphs(older, moved);
    expect(movedDiff.different).toBe(false);
    expect(describeWorkflowDiff(movedDiff)).toBe("Only positions on the canvas changed.");
  });
});

describe("workflow versions: guards", () => {
  const summary = {
    number: 2,
    savedAt: "2026-11-17T09:00:00.000Z",
    reason: "edited",
    restoredFrom: null,
    name: "Morning brief",
    steps: 3,
    connections: 2,
    summary: "1 trigger, 1 agent step, 1 output",
    current: true,
  };

  it("accepts a row and a row with its graph, and refuses wrong values", () => {
    expect(isWorkflowVersionSummary(summary)).toBe(true);
    expect(isWorkflowVersionSummary({ ...summary, restoredFrom: 1, reason: "restored" })).toBe(true);
    expect(isWorkflowVersionSummary({ ...summary, number: 0 })).toBe(false);
    expect(isWorkflowVersionSummary({ ...summary, reason: "deleted" })).toBe(false);
    expect(isWorkflowVersionSummary({ ...summary, current: "yes" })).toBe(false);
    expect(isWorkflowVersionDetails({ ...summary, ...base() })).toBe(true);
    expect(isWorkflowVersionDetails({ ...summary, nodes: [{ id: "x" }], edges: [] })).toBe(false);
    expect(isWorkflowVersionDetails(summary)).toBe(false);
  });
});
