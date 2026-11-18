import type { WorkflowGraph } from "@openbot/contracts/ipc";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { WorkflowPreviewCanvas } from "./WorkflowPreviewCanvas";

afterEach(cleanup);

const GRAPH: WorkflowGraph = {
  nodes: [
    { id: "t", type: "trigger", title: "Start", x: 10, y: 10, trigger: { kind: "manual" } },
    { id: "p", type: "prompt", title: "Draft", x: 260, y: 10, text: "Write the brief" },
    {
      id: "c",
      type: "condition",
      title: "Approved?",
      x: 510,
      y: 10,
      subject: "{{previous}}",
      operator: "contains",
      value: "approved",
      caseSensitive: false,
    },
    { id: "o", type: "channel-output", title: "Post", x: 760, y: 10, channelId: "general", text: "Done" },
  ],
  edges: [
    { id: "e1", from: "t", to: "p", on: "next" },
    { id: "e2", from: "p", to: "c", on: "next" },
    { id: "e3", from: "c", to: "o", on: "yes" },
  ],
};

it("draws every step with what it does and labels the Yes way", () => {
  render(() => <WorkflowPreviewCanvas graph={GRAPH} label="Preview of version 2" />);
  expect(screen.getByRole("region", { name: "Preview of version 2" })).toBeInTheDocument();
  expect(screen.getByText("Write the brief")).toBeInTheDocument();
  expect(screen.getByText('{{previous}} contains "approved"')).toBeInTheDocument();
  expect(screen.getByText("Yes")).toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(4);
});

it("has nothing to edit", () => {
  render(() => <WorkflowPreviewCanvas graph={GRAPH} label="Preview" />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
