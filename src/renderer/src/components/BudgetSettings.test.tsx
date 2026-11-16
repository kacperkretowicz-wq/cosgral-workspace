import type { AgentEvent, BudgetCsv } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { createMockBudgets } from "../../stories/mock-budgets";
import { BudgetSettings } from "./BudgetSettings";

function setup(botId?: string) {
  let listener: ((event: AgentEvent) => void) | undefined;
  const api = createMockBudgets((event) => listener?.(event));
  const downloaded: BudgetCsv[] = [];
  render(() => (
    <BudgetSettings
      botId={botId}
      api={api}
      onEvent={(handler) => {
        listener = handler;
        return () => {
          listener = undefined;
        };
      }}
      onDownload={(file) => downloaded.push(file)}
    />
  ));
  return { api, downloaded };
}
describe("Budget UI", () => {
  it("saves an agent budget with UTC periods and a warning threshold", async () => {
    const { api } = setup("demo");
    await screen.findByLabelText("Token limit");
    fireEvent.input(screen.getByLabelText("Token limit"), { target: { value: "1000" } });
    await waitFor(() => expect(screen.getByLabelText("Token limit")).toHaveValue(1000));
    fireEvent.submit(screen.getByRole("form", { name: "Budget limits" }));
    await screen.findByText("Budget saved.");
    expect((await api.list()).agents[0]?.budget).toMatchObject({
      scope: { kind: "agent", botId: "demo" },
      period: "month",
      tokenLimit: 1000,
      warnPercent: 80,
      hardStop: true,
    });
  });
  it("follows warning and exhausted counters without inventing cost", async () => {
    const { api } = setup();
    await screen.findByLabelText("Token limit");
    await api.set({ scope: { kind: "space" }, period: "day", tokenLimit: 100, costLimitUsd: null, hardStop: true });
    api.simulate.record("demo", 85, null);
    await screen.findByText("warning");
    expect(screen.getByText(/Cost unavailable/)).toBeTruthy();
    api.simulate.record("demo", 15, null);
    await screen.findByText("exhausted");
    expect(screen.getByText(/New turns are blocked/)).toBeTruthy();
  });
  it("marks a price-only limit as not enforceable", async () => {
    const { api } = setup();
    await screen.findByLabelText("Token limit");
    await api.set({ scope: { kind: "space" }, period: "day", tokenLimit: null, costLimitUsd: 10, hardStop: true });
    await screen.findByText(/Dollar limit not enforceable/);
    expect(screen.queryByText(/New turns are blocked/)).toBeNull();
  });
  it("hands CSV to the window download callback only after export", async () => {
    const { api, downloaded } = setup();
    const exportCall = vi.spyOn(api, "exportCsv");
    await screen.findByLabelText("Token limit");
    expect(downloaded).toHaveLength(0);
    fireEvent.input(screen.getByLabelText("From (UTC)"), { target: { value: "2026-11-01" } });
    fireEvent.input(screen.getByLabelText("To (UTC)"), { target: { value: "2026-11-16" } });
    await waitFor(() => expect(screen.getByLabelText("To (UTC)")).toHaveValue("2026-11-16"));
    fireEvent.submit(screen.getByRole("form", { name: "Export budget usage" }));
    await waitFor(() => expect(downloaded).toHaveLength(1));
    expect(exportCall).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-16" });
    expect(downloaded[0]?.fileName.endsWith(".csv")).toBe(true);
  });
});
