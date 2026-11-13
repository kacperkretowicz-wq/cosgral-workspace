import type { AgentEvent, ProviderUsage } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsagePage } from "./UsagePage";

afterEach(() => vi.unstubAllGlobals());

const USAGE: ProviderUsage[] = [
  { provider: "codex", model: null, state: "ok", resetsAt: null, usedPercent: 42, reason: null },
  { provider: "claude", model: null, state: "limited", resetsAt: null, usedPercent: 100, reason: "Weekly limit" },
];

describe("Usage page", () => {
  it("shows each provider's state from listUsage and refreshes on request", async () => {
    let listener: (event: AgentEvent) => void = () => undefined;
    const listUsage = vi.fn().mockResolvedValue(USAGE);
    vi.stubGlobal("openbot", {
      providers: { listUsage, listAcpAgents: vi.fn().mockResolvedValue([]) },
      agent: {
        onEvent: (fn: (event: AgentEvent) => void) => {
          listener = fn;
          return () => undefined;
        },
      },
    });
    render(() => <UsagePage />);
    expect(await screen.findByText("42% used")).toBeInTheDocument();
    expect(screen.getByText("Limit reached")).toBeInTheDocument();
    expect(screen.getByText("Weekly limit")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(listUsage).toHaveBeenCalledTimes(2);
    const signedOut: ProviderUsage = {
      provider: "codex",
      model: null,
      state: "unavailable",
      resetsAt: null,
      usedPercent: null,
      reason: "Signed out",
    };
    const changed: AgentEvent = { type: "provider-usage-changed", usage: [signedOut] };
    listener(changed);
    expect(await screen.findByText("Signed out")).toBeInTheDocument();
  });

  it("says when this build has no usage information", async () => {
    vi.stubGlobal("openbot", { agent: { onEvent: () => () => undefined } });
    render(() => <UsagePage />);
    expect(await screen.findByText("Usage is not available in this build.")).toBeInTheDocument();
  });
});
