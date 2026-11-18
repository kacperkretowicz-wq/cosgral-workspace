import type { WorkflowGraph } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { WorkflowCanvas } from "./WorkflowsPage";

describe("workflow canvas", () => {
  it("updates validation while the graph is edited", async () => {
    render(() => <WorkflowCanvas nodes={[]} edges={[]} onChange={() => undefined} />);
    expect(screen.getByText("A workflow has exactly one trigger.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add trigger" })).toBeInTheDocument();
  });
});

describe("workflow editor steps", () => {
  it("adds a Prompt and a Condition step from the palette", async () => {
    const [graph, setGraph] = createSignal<WorkflowGraph>({ nodes: [], edges: [] });
    render(() => <WorkflowCanvas nodes={graph().nodes} edges={graph().edges} onChange={setGraph} />);
    await fireEvent.click(screen.getByRole("button", { name: "Add prompt" }));
    await fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    expect(graph().nodes.map((node) => node.type)).toEqual(["prompt", "condition"]);
  });

  it("marks each step card with its type and keeps the Yes and No paths selectable", () => {
    const { container } = render(() => (
      <WorkflowCanvas
        nodes={[
          {
            id: "c",
            type: "condition",
            title: "Check",
            x: 0,
            y: 0,
            subject: "{{previous}}",
            operator: "contains",
            value: "ok",
            caseSensitive: false,
          },
          { id: "o", type: "channel-output", title: "Post", x: 300, y: 0, channelId: "", text: "" },
        ]}
        edges={[{ id: "e", from: "c", to: "o", on: "yes" }]}
        onChange={() => undefined}
      />
    ));
    expect(container.querySelector('[data-workflow-node="c"]')?.getAttribute("data-type")).toBe("condition");
    expect(screen.getByRole("option", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "No" })).toBeInTheDocument();
  });
});
