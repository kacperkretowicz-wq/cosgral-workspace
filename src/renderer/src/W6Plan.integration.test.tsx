import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { expect, it } from "vitest";
import { createMockOpenBot } from "../stories/mock-openbot";
import { planFixture } from "../stories/w6-ui-fixtures";
import { App } from "./App";

it("restores a pending plan in Needs you, answers it, and retains saved progress", async () => {
  const plan = planFixture();
  const mock = createMockOpenBot({ pendingRequests: [{ kind: "plan", plan }] });
  window.openbot = mock.api;
  if (!mock.api.plans) throw new Error("missing API");
  mock.api.plans.list = async () => [plan];
  mock.api.plans.respond = async ({ decision }) => {
    const next = { ...plan, phase: decision === "approve" ? ("approved" as const) : ("rejected" as const) };
    mock.emitAgentEvent({ type: "plan-changed", plan: next });
    return next;
  };
  const view = render(() => <App />);
  const needs = within(await screen.findByRole("region", { name: /Needs you/ }));
  expect(await needs.findByText(plan.title)).toBeInTheDocument();
  const decision = within(await screen.findByRole("region", { name: "Decision" }));
  fireEvent.click(decision.getByRole("button", { name: "Approve plan" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Decision" })).not.toBeInTheDocument());
  expect(await screen.findByText("Approved")).toBeInTheDocument();
  view.unmount();
  mock.dispose();
});
