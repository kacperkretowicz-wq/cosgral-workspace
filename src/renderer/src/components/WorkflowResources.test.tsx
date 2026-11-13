import type { WorkflowGraph } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { WorkflowCanvas } from "./WorkflowsPage";

describe("workflow resources", () => {
  it("offers agent names instead of requiring IDs", () => {
    render(() => (
      <WorkflowCanvas
        nodes={[{ id: "agent", type: "agent", title: "Work", x: 0, y: 0, botId: "", prompt: "" }]}
        edges={[]}
        onChange={vi.fn()}
        bots={[{ id: "a", name: "Ada" }]}
        channels={[]}
        routines={[]}
      />
    ));
    expect(screen.getByRole("option", { name: "Ada" })).toHaveValue("a");
  });
  it("moves a node when its handle is dragged", async () => {
    const [graph, setGraph] = createSignal<WorkflowGraph>({
      nodes: [{ id: "agent", type: "agent", title: "Work", x: 10, y: 20, botId: "", prompt: "" }],
      edges: [],
    });
    render(() => <WorkflowCanvas nodes={graph().nodes} edges={graph().edges} onChange={setGraph} />);
    await fireEvent.pointerDown(screen.getByRole("button", { name: /Move Work/ }), {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    await fireEvent.pointerMove(window, { clientX: 150, clientY: 130 });
    await fireEvent.pointerUp(window);
    expect(graph().nodes[0]?.x).toBe(60);
    expect(graph().nodes[0]?.y).toBe(50);
  });
  it("connects a dragged output to the node under the pointer", async () => {
    const [graph, setGraph] = createSignal<WorkflowGraph>({
      nodes: [
        { id: "start", type: "trigger", title: "Start", x: 0, y: 0, trigger: { kind: "manual" } },
        { id: "agent", type: "agent", title: "Work", x: 250, y: 0, botId: "", prompt: "" },
      ],
      edges: [],
    });
    const view = render(() => <WorkflowCanvas nodes={graph().nodes} edges={graph().edges} onChange={setGraph} />);
    const target = view.container.querySelector('[data-workflow-node="agent"]');
    const elementFromPoint = vi.fn(() => target);
    Object.defineProperty(document, "elementFromPoint", { value: elementFromPoint, configurable: true });
    await fireEvent.pointerDown(screen.getByRole("button", { name: /Drag connection from Start/ }), {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    await fireEvent.pointerUp(window, { clientX: 260, clientY: 10 });
    expect(graph().edges[0]).toMatchObject({ from: "start", to: "agent", on: "next" });
  });
});
