import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { AccountLimitReachedCard, AccountSwitchedCard } from "./AccountLimitCards";
import type { AccountLimitReachedView, AccountSwitchedView } from "./account-usage-view";

const nowMs = Date.UTC(2026, 10, 16, 12, 0, 0);

const switched: AccountLimitReachedView = {
  reason: "Codex returned a rate limit before the first action.",
  exhaustedAccountLabel: "Work Codex",
  switchedToAccountLabel: "Home Codex",
  resetsAt: Math.floor(nowMs / 1000) + 7200,
  canReturnAfterReset: true,
  returnAccountLabel: "Work Codex",
};

const allExhausted: AccountLimitReachedView = {
  reason: "Every Codex account in the pool is limited.",
  exhaustedAccountLabel: "Home Codex",
  switchedToAccountLabel: null,
  resetsAt: Math.floor(nowMs / 1000) + 7200,
  canReturnAfterReset: false,
  returnAccountLabel: null,
};

const notice: AccountSwitchedView = {
  toAccountLabel: "Home Codex",
  fromAccountLabel: "Work Codex",
  reason: "Switched before the first action of the turn.",
};

describe("AccountLimitReachedCard", () => {
  it("shows the switch target and return action when a later account is free", async () => {
    const onReturn = vi.fn();
    const onDismiss = vi.fn();
    render(() => (
      <AccountLimitReachedCard view={switched} nowMs={nowMs} onReturnAfterReset={onReturn} onDismiss={onDismiss} />
    ));
    expect(screen.getByRole("region", { name: "Account limit reached" })).toBeInTheDocument();
    expect(screen.getByText(/Switched to account Home Codex/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to Work Codex after reset" })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Return to Work Codex after reset" }));
    expect(onReturn).toHaveBeenCalledOnce();
    await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("hides the return button when every account is exhausted", () => {
    render(() => <AccountLimitReachedCard view={allExhausted} nowMs={nowMs} />);
    expect(screen.getByText(/Every account in the pool is exhausted/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Return to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });
});

describe("AccountSwitchedCard", () => {
  it("shows the new account and dismisses", async () => {
    const onDismiss = vi.fn();
    render(() => <AccountSwitchedCard view={notice} onDismiss={onDismiss} />);
    expect(screen.getByRole("status", { name: "Switched to account Home Codex" })).toBeInTheDocument();
    expect(screen.getByText("Previous account: Work Codex")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
