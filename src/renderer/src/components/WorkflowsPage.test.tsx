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

  it("shows readable Prompt and Condition fields with a live preview", async () => {
    const [graph, setGraph] = createSignal<WorkflowGraph>({
      nodes: [
        { id: "p", type: "prompt", title: "Say hi", x: 0, y: 0, text: "Hello next step" },
        {
          id: "c",
          type: "condition",
          title: "Gate",
          x: 280,
          y: 0,
          subject: "{{previous}}",
          operator: "contains",
          value: "Hello",
          caseSensitive: false,
        },
      ],
      edges: [],
    });
    const { container } = render(() => (
      <WorkflowCanvas nodes={graph().nodes} edges={graph().edges} onChange={setGraph} />
    ));
    const promptField = container.querySelector<HTMLTextAreaElement>(".workflow-prompt-text");
    const subjectField = container.querySelector<HTMLTextAreaElement>(".workflow-condition-subject");
    expect(promptField).not.toBeNull();
    expect(subjectField).not.toBeNull();
    expect(promptField).toHaveValue("Hello next step");
    expect(container.querySelector('[data-workflow-preview="prompt"]')).toHaveTextContent("Hello next step");
    expect(subjectField).toHaveValue("{{previous}}");
    expect(screen.getByDisplayValue("Hello")).toBeInTheDocument();
    expect(container.querySelector('[data-workflow-preview="condition"]')).toHaveTextContent(
      '{{previous}} contains "Hello"',
    );
    expect(screen.getByText("Connect Yes when the test passes, No when it fails.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Match case" })).toBeInTheDocument();
    if (!promptField) throw new Error("prompt field missing");
    await fireEvent.input(promptField, { target: { value: "Updated prompt" } });
    expect(graph().nodes.find((node) => node.id === "p")).toMatchObject({ text: "Updated prompt" });
  });
});
