import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockWorkflows } from "../../stories/mock-workflows";
import { WorkflowVersionsPanel } from "./WorkflowVersionsPanel";

const KNOWN = { botIds: ["chief"], channelIds: ["general"], routineIds: [] };

function makeMock() {
  return createMockWorkflows(() => undefined, {
    known: () => KNOWN,
    seed: { botId: "chief", channelId: "general" },
    now: () => new Date("2026-11-17T09:00:00.000Z"),
  });
}

let mock = makeMock();

beforeEach(() => {
  mock = makeMock();
  Object.assign(window, { openbot: { workflows: mock.api, agent: { onEvent: () => () => undefined } } });
});
afterEach(cleanup);

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <WorkflowVersionsPanel workflowId="w1" />);
  expect(screen.getByText("Versions are not available in this version.")).toBeInTheDocument();
});

it("lists the versions and marks the current one", async () => {
  const first = (await mock.api.list())[0];
  if (!first) throw new Error("no seeded workflow");
  render(() => <WorkflowVersionsPanel workflowId={first.id} />);
  expect(await screen.findByText("Current")).toBeInTheDocument();
});

it("restores an older version through the contract", async () => {
  const first = (await mock.api.list())[0];
  if (!first) throw new Error("no seeded workflow");
  const edited = first.nodes.map((node) => (node.type === "agent" ? { ...node, prompt: `${node.prompt} (v2)` } : node));
  await mock.api.update({ workflowId: first.id, name: first.name, nodes: edited, edges: first.edges });
  const restore = vi.spyOn(mock.api, "restoreVersion");
  render(() => <WorkflowVersionsPanel workflowId={first.id} />);
  const buttons = await screen.findAllByRole("button", { name: "Restore this version" });
  const older = buttons[0];
  if (!older) throw new Error("no older version");
  await fireEvent.click(older);
  await waitFor(() => expect(restore).toHaveBeenCalledOnce());
});
