import type { AccountLimitReached, AccountSwitched } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { AccountLimitReachedCard, AccountSwitchedCard } from "./AccountLimitCards";
import { addAccountNotice, limitReachedView, switchedView } from "./account-usage-view";

const nowMs = Date.UTC(2026, 10, 16, 12, 0, 0);
const resetsAt = new Date(nowMs + 7_200_000).toISOString();

function limitEvent(
  fields: Partial<AccountLimitReached> = {},
): { type: "account-limit-reached" } & AccountLimitReached {
  return {
    type: "account-limit-reached",
    botId: "chief",
    provider: "codex",
    accountId: "acc-aaaaaaaa",
    accountLabel: "Work Codex",
    resetsAt,
    resetsAtAssumed: false,
    outcome: "switched",
    nextAccountId: "acc-bbbbbbbb",
    nextAccountLabel: "Home Codex",
    afterAction: false,
    ...fields,
  };
}

function switchEvent(fields: Partial<AccountSwitched> = {}): { type: "account-switched" } & AccountSwitched {
  return {
    type: "account-switched",
    botId: "chief",
    provider: "codex",
    fromAccountId: "acc-aaaaaaaa",
    fromLabel: "Work Codex",
    toAccountId: "acc-bbbbbbbb",
    toLabel: "Home Codex",
    reason: "usage-limit",
    ...fields,
  };
}

describe("AccountLimitReachedCard", () => {
  it("shows the account that took over and has no button besides Dismiss", async () => {
    const onDismiss = vi.fn();
    render(() => <AccountLimitReachedCard view={limitReachedView(limitEvent())} nowMs={nowMs} onDismiss={onDismiss} />);
    expect(screen.getByRole("region", { name: "Account limit reached" })).toBeInTheDocument();
    expect(screen.getByText(/Switched to account Home Codex/)).toBeInTheDocument();
    expect(screen.getByText(/goes back to its first account by itself/)).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Dismiss"]);
    await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("says nothing was repeated and points to the card in Needs you after an action", () => {
    const view = limitReachedView(limitEvent({ outcome: "asks", afterAction: true }));
    render(() => <AccountLimitReachedCard view={view} nowMs={nowMs} />);
    expect(screen.getByText(/after this turn had already changed something/)).toBeInTheDocument();
    expect(screen.getByText("A card in Needs you asks whether to continue on Home Codex.")).toBeInTheDocument();
    expect(screen.queryByText(/Switched to account/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the reset time when every account is exhausted, and marks an assumed one", () => {
    const view = limitReachedView(
      limitEvent({ outcome: "exhausted", nextAccountId: null, nextAccountLabel: null, resetsAtAssumed: true }),
    );
    render(() => <AccountLimitReachedCard view={view} nowMs={nowMs} />);
    expect(screen.getByText(/Every account in the pool is exhausted/)).toBeInTheDocument();
    expect(screen.getByText(/Assumed reset at/)).toBeInTheDocument();
    expect(screen.queryByText(/Switched to account/)).not.toBeInTheDocument();
  });
});

describe("AccountSwitchedCard", () => {
  it("shows the new account and why, and dismisses", async () => {
    const onDismiss = vi.fn();
    render(() => <AccountSwitchedCard view={switchedView(switchEvent())} onDismiss={onDismiss} />);
    expect(screen.getByRole("status", { name: "Switched to account Home Codex" })).toBeInTheDocument();
    expect(screen.getByText("Previous account: Work Codex")).toBeInTheDocument();
    expect(screen.getByText(/previous account reached its usage limit/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("explains the way back to the first account", () => {
    render(() => (
      <AccountSwitchedCard view={switchedView(switchEvent({ reason: "returned" }))} onDismiss={() => undefined} />
    ));
    expect(screen.getByText("Back on the first account: its limit has passed.")).toBeInTheDocument();
  });
});

describe("account notices of the open conversation", () => {
  it("keeps the newest three per agent and leaves other agents alone", () => {
    let notices = addAccountNotice([], switchEvent({ botId: "scout" }), "s1");
    for (const id of ["a", "b", "c", "d"]) notices = addAccountNotice(notices, limitEvent(), id);
    expect(notices.filter((notice) => notice.botId === "chief").map((notice) => notice.id)).toEqual(["d", "c", "b"]);
    expect(notices.filter((notice) => notice.botId === "scout").map((notice) => notice.id)).toEqual(["s1"]);
  });

  it("reads the reset time as Unix seconds and survives a broken date", () => {
    expect(limitReachedView(limitEvent()).resetsAt).toBe(Math.floor((nowMs + 7_200_000) / 1000));
    expect(limitReachedView(limitEvent({ resetsAt: "not a date" })).resetsAt).toBeNull();
  });
});

it("combines a returned account followed by its next usage limit without losing the limit card", () => {
  let notices = addAccountNotice(
    [],
    switchEvent({
      reason: "returned",
      fromAccountId: "backup",
      fromLabel: "Backup",
      toAccountId: "first",
      toLabel: "First",
    }),
    "returned",
  );
  notices = addAccountNotice(notices, limitEvent({ accountId: "first", accountLabel: "First" }), "limit");
  notices = addAccountNotice(
    notices,
    switchEvent({ fromAccountId: "first", fromLabel: "First", toAccountId: "other", toLabel: "Other" }),
    "switch",
  );
  expect(notices.map((notice) => notice.id)).toEqual(["switch", "limit"]);
  const newest = notices[0];
  if (newest.kind !== "switched") throw new Error("Expected a switch.");
  expect(newest.view.reason).toContain("Returned from Backup to First");
  expect(newest.view.reason).toContain("First reached its usage limit again, so switched to Other");
});
it("does not combine switches of another provider or a different account with the same label", () => {
  const notices = addAccountNotice(
    [],
    switchEvent({ reason: "returned", toAccountId: "first", toLabel: "First" }),
    "return",
  );
  expect(addAccountNotice(notices, switchEvent({ provider: "claude", fromAccountId: "first" }), "claude")).toHaveLength(
    2,
  );
  expect(
    addAccountNotice(notices, switchEvent({ fromAccountId: "different", fromLabel: "First" }), "different"),
  ).toHaveLength(2);
  expect(addAccountNotice(notices, switchEvent({ botId: "scout", fromAccountId: "first" }), "scout")).toHaveLength(2);
});
it("does not hide a newer unrelated switch when an older return matches", () => {
  let notices = addAccountNotice([], switchEvent({ reason: "returned", toAccountId: "first" }), "return");
  notices = addAccountNotice(notices, switchEvent({ fromAccountId: "unrelated" }), "other");
  expect(
    addAccountNotice(notices, switchEvent({ fromAccountId: "first" }), "latest").map((notice) => notice.id),
  ).toEqual(["latest", "other", "return"]);
});
