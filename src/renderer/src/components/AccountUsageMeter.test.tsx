import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { AccountUsageMeter } from "./AccountUsageMeter";
import { accountUsageFromSources, windowState } from "./account-usage-view";

const nowMs = Date.UTC(2026, 10, 16, 12, 0, 0);
const account: {
  id: string;
  label: string;
  provider: "codex";
  limitedUntil: string | null;
} = {
  id: "acc-1",
  label: "Work Codex",
  provider: "codex",
  limitedUntil: null,
};

describe("account-usage-view helpers", () => {
  it("maps ok, exhausted, and unknown window states", () => {
    expect(windowState(40, null, nowMs)).toBe("ok");
    expect(windowState(100, null, nowMs)).toBe("exhausted");
    expect(windowState(null, null, nowMs)).toBe("unknown");
  });

  it("builds a view from primary and secondary windows", () => {
    const view = accountUsageFromSources({
      account,
      primary: { usedPercent: 72, windowDurationMins: 300, resetsAt: Math.floor(nowMs / 1000) + 3600 },
      secondary: { usedPercent: 18, windowDurationMins: 10_080, resetsAt: Math.floor(nowMs / 1000) + 86_400 },
      nowMs,
    });
    expect(view.state).toBe("ok");
    expect(view.windows).toHaveLength(2);
    expect(view.windows[0]?.label).toBe("5-hour window");
    expect(view.windows[1]?.label).toBe("Weekly window");
  });
});

describe("AccountUsageMeter", () => {
  it("renders ok usage with a meter and reset time", () => {
    const usage = accountUsageFromSources({
      account,
      primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: Math.floor(nowMs / 1000) + 3600 },
      secondary: { usedPercent: 10, windowDurationMins: 10_080, resetsAt: Math.floor(nowMs / 1000) + 86_400 },
      nowMs,
    });
    render(() => <AccountUsageMeter usage={usage} nowMs={nowMs} />);
    const region = screen.getByRole("region", { name: "Usage for Work Codex" });
    expect(region).toHaveAttribute("data-state", "ok");
    expect(screen.getAllByText("OK").length).toBeGreaterThan(0);
    expect(screen.getByRole("meter", { name: "5-hour window" })).toHaveValue(42);
    expect(screen.getAllByText(/Resets at/).length).toBeGreaterThan(0);
  });

  it("renders exhausted and unknown states with readable labels", () => {
    const exhausted = accountUsageFromSources({
      account: { ...account, limitedUntil: new Date(nowMs + 3_600_000).toISOString() },
      primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: Math.floor(nowMs / 1000) + 3600 },
      secondary: { usedPercent: 100, windowDurationMins: 10_080, resetsAt: Math.floor(nowMs / 1000) + 86_400 },
      nowMs,
      reason: "Weekly ChatGPT limit reached.",
    });
    const { unmount } = render(() => <AccountUsageMeter usage={exhausted} nowMs={nowMs} />);
    expect(screen.getByRole("region", { name: "Usage for Work Codex" })).toHaveAttribute("data-state", "exhausted");
    expect(screen.getAllByText("Exhausted").length).toBeGreaterThan(0);
    expect(screen.getByText("Weekly ChatGPT limit reached.")).toBeInTheDocument();
    unmount();

    const unknown = accountUsageFromSources({
      account,
      providerUsage: { state: "unavailable", usedPercent: null, resetsAt: null, reason: "CLI not installed." },
      nowMs,
    });
    render(() => <AccountUsageMeter usage={unknown} nowMs={nowMs} />);
    expect(screen.getByRole("region", { name: "Usage for Work Codex" })).toHaveAttribute("data-state", "unknown");
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getByText("Usage not reported")).toBeInTheDocument();
  });
});
