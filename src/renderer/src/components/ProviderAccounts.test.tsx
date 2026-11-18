import type { PoolSettingsInput, ProviderAccount } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderAccountCard, ProviderAccounts, safeLoginUrl } from "./ProviderAccounts";

const account: ProviderAccount = {
  id: "acc-demo0001",
  provider: "codex",
  label: "Praca",
  stateDir: "acc-demo0001",
  system: false,
  loggedIn: false,
  account: null,
  plan: null,
  isDefault: false,
  inPool: false,
  poolOrder: 1,
  enabled: true,
  limitedUntil: null,
  login: { phase: "idle", message: null, url: null, userCode: null },
  checkedAt: null,
};
describe("provider account", () => {
  it("protects the system account", () => {
    render(() => (
      <ProviderAccountCard
        account={{ ...account, system: true }}
        busy={false}
        poolFull={false}
        position={0}
        count={1}
        onAction={vi.fn()}
        onPool={vi.fn()}
      />
    ));
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
  it("asks before enabling the pool each time", async () => {
    const pool = vi.fn();
    render(() => (
      <ProviderAccountCard
        account={account}
        busy={false}
        poolFull={false}
        position={0}
        count={1}
        onAction={vi.fn()}
        onPool={pool}
      />
    ));
    await fireEvent.click(screen.getByRole("switch", { name: "In the pool" }));
    expect(pool).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole("button", { name: "Add to pool" }));
    await waitFor(() => expect(pool).toHaveBeenCalledWith({ id: account.id, inPool: true }));
  });
});

afterEach(() => vi.unstubAllGlobals());
it("only accepts https login pages without embedded credentials", () => {
  expect(safeLoginUrl("javascript:alert(1)")).toBeNull();
  expect(safeLoginUrl("https://user:pass@example.invalid")).toBeNull();
  expect(safeLoginUrl("https://example.invalid/login")).toBe("https://example.invalid/login");
});
it("asks before deleting and offers a terminal only after login failure", async () => {
  const action = vi.fn();
  render(() => (
    <ProviderAccountCard
      account={{ ...account, login: { ...account.login, phase: "error", message: "Brak połączenia" } }}
      busy={false}
      poolFull={false}
      position={0}
      count={1}
      onAction={action}
      onPool={vi.fn()}
    />
  ));
  await fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(action).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "Remove account and data" }));
  expect(action).toHaveBeenCalledWith("removeAccount", account.id);
  await fireEvent.click(screen.getByRole("button", { name: "Open terminal with the command…" }));
  expect(action).toHaveBeenCalledWith("openLoginTerminal", account.id);
});
it("clears a submitted code immediately and supports cancellation", async () => {
  const action = vi.fn();
  render(() => (
    <ProviderAccountCard
      account={{ ...account, login: { ...account.login, phase: "code-required" } }}
      busy={false}
      poolFull={false}
      position={0}
      count={1}
      onAction={action}
      onPool={vi.fn()}
    />
  ));
  await fireEvent.input(screen.getByLabelText("Sign-in code"), { target: { value: "demo-code" } });
  await fireEvent.click(screen.getByRole("button", { name: "Submit code" }));
  expect(action).toHaveBeenCalledWith("submitLoginCode", account.id, "demo-code");
  await waitFor(() => expect(screen.getByLabelText("Sign-in code")).toHaveValue(""));
});
it("changes order through keyboard-focusable buttons and respects pool capacity", async () => {
  const pool = vi.fn();
  render(() => (
    <ProviderAccountCard
      account={{ ...account, inPool: true, poolOrder: 2 }}
      busy={false}
      poolFull={true}
      position={1}
      count={2}
      onAction={vi.fn()}
      onPool={pool}
    />
  ));
  await fireEvent.click(screen.getByRole("button", { name: "Move Praca up" }));
  expect(pool).toHaveBeenCalledWith({ id: account.id, inPool: true, poolOrder: 1 });
  expect(screen.getByRole("button", { name: "Move Praca down" })).toBeDisabled();
});
it("loads account snapshots and shows full capacity", async () => {
  vi.stubGlobal("openbot", {
    subscriptions: {
      listAccounts: async () => ({
        accounts: [{ ...account, inPool: true }],
        pool: { maxAccountsPerProvider: 1, switchBeforeFirstAction: true },
        assignments: [],
      }),
    },
    agent: { onEvent: () => () => {} },
  });
  render(() => <ProviderAccounts />);
  await screen.findByRole("heading", { name: "Praca" });
  expect(screen.getByText(/Maximum number of accounts reached/)).toBeInTheDocument();
});

it("preserves a code draft and focus across snapshots, then clears it on completion", async () => {
  let emit: (event: import("@openbot/contracts/ipc").AgentEvent) => void = () => {};
  const snapshot = {
    accounts: [{ ...account, login: { ...account.login, phase: "code-required" as const } }],
    pool: { maxAccountsPerProvider: 3, switchBeforeFirstAction: true as const },
    assignments: [],
  };
  vi.stubGlobal("openbot", {
    subscriptions: { listAccounts: async () => snapshot },
    agent: {
      onEvent: (listener: typeof emit) => {
        emit = listener;
        return () => {};
      },
    },
  });
  render(() => <ProviderAccounts />);
  const input = await screen.findByLabelText("Sign-in code");
  input.focus();
  await fireEvent.input(input, { target: { value: "demo-draft" } });
  emit({
    type: "accounts-changed",
    ...snapshot,
    accounts: snapshot.accounts.map((a) => ({ ...a, checkedAt: "2026-11-16T00:00:00Z" })),
  });
  await waitFor(() => expect(screen.getByLabelText("Sign-in code")).toBe(input));
  expect(input).toHaveValue("demo-draft");
  expect(input).toHaveFocus();
  emit({
    type: "accounts-changed",
    ...snapshot,
    accounts: [{ ...account, loggedIn: true, login: { ...account.login, phase: "success" } }],
  });
  await waitFor(() => expect(screen.queryByLabelText("Sign-in code")).toBeNull());
});

function returnSetting(initial?: boolean) {
  let pool = { maxAccountsPerProvider: 3, switchBeforeFirstAction: true as const, returnAfterReset: initial };
  const set = vi.fn(async (input: PoolSettingsInput) => {
    pool = { ...pool, ...input };
    return pool;
  });
  vi.stubGlobal("openbot", {
    subscriptions: { listAccounts: async () => ({ accounts: [], pool, assignments: [] }), setPoolSettings: set },
    agent: { onEvent: () => () => {} },
  });
  render(() => <ProviderAccounts />);
  return { set, pool: () => pool };
}
it("defaults missing returnAfterReset to on and saves false with the current pool size", async () => {
  const { set } = returnSetting();
  const control = await screen.findByRole("switch", { name: "Return to the first account after the limit resets" });
  expect(control).toHaveAttribute("aria-checked", "true");
  await fireEvent.input(screen.getByLabelText("Max accounts in the pool"), { target: { value: "7" } });
  await fireEvent.click(control);
  await waitFor(() => expect(set).toHaveBeenCalledWith({ maxAccountsPerProvider: 3, returnAfterReset: false }));
  await waitFor(() => expect(control).toHaveAttribute("aria-checked", "false"));
});
it("can enable returnAfterReset while keeping the current pool size", async () => {
  const { set } = returnSetting(false);
  const control = await screen.findByRole("switch", { name: "Return to the first account after the limit resets" });
  expect(control).toHaveAttribute("aria-checked", "false");
  await fireEvent.click(control);
  await waitFor(() => expect(set).toHaveBeenCalledWith({ maxAccountsPerProvider: 3, returnAfterReset: true }));
});
it("saving only a new pool size preserves the return setting", async () => {
  const { set, pool } = returnSetting(false);
  await screen.findByRole("switch", { name: "Return to the first account after the limit resets" });
  await fireEvent.input(screen.getByLabelText("Max accounts in the pool"), { target: { value: "4" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save limit" }));
  await waitFor(() => expect(set).toHaveBeenCalledWith({ maxAccountsPerProvider: 4 }));
  expect(pool().returnAfterReset).toBe(false);
});
