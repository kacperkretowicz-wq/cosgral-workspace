import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { planFixture } from "../../stories/w6-ui-fixtures";
import { PlanCard, PlanPanel } from "./PlanPanel";

it.each(["approve", "reject"] as const)("answers a proposal with %s only", async (decision) => {
  const respond = vi.fn().mockResolvedValue(planFixture({ phase: decision === "approve" ? "approved" : "rejected" }));
  render(() => <PlanCard plan={planFixture()} api={{ respond, list: async () => [] }} />);
  fireEvent.click(screen.getByRole("button", { name: decision === "approve" ? "Approve plan" : "Reject plan" }));
  await waitFor(() => expect(respond).toHaveBeenCalledWith({ requestId: "plan-ui", decision }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Approve plan" })).not.toBeInTheDocument());
});
it("loads saved progress and follows only this thread's updates", async () => {
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  if (!mock.api.plans) throw new Error("missing API");
  mock.api.plans.list = async () => [planFixture({ phase: "stopped" })];
  render(() => <PlanPanel botId="chief" threadId="thread-chief" />);
  expect(await screen.findByText("Stopped")).toBeInTheDocument();
  mock.emitAgentEvent({
    type: "plan-changed",
    plan: planFixture({
      phase: "approved",
      steps: [{ id: "s1", title: "Review the changes", detail: null, status: "done" }],
    }),
  });
  expect(await screen.findByText("1 of 1 steps finished")).toBeInTheDocument();
  mock.emitAgentEvent({ type: "plan-changed", plan: planFixture({ threadId: "other", title: "Foreign plan" }) });
  expect(screen.queryByText("Foreign plan")).not.toBeInTheDocument();
  mock.dispose();
});
