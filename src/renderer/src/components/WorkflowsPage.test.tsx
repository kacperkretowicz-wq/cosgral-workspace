import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { WorkflowCanvas } from "./WorkflowsPage";

describe("workflow canvas", () => {
  it("updates validation while the graph is edited", async () => {
    render(() => <WorkflowCanvas nodes={[]} edges={[]} onChange={() => undefined} />);
    expect(screen.getByText("A workflow has exactly one trigger.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add trigger" })).toBeInTheDocument();
  });
});
