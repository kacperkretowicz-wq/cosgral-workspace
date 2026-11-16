import type { ProviderAccount } from "@openbot/contracts/ipc";
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
    expect(screen.queryByRole("button", { name: "Usuń" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Wyloguj" })).toBeNull();
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
    await fireEvent.click(screen.getByRole("switch", { name: "W puli" }));
    expect(pool).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole("button", { name: "Włącz do puli" }));
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
  await fireEvent.click(screen.getByRole("button", { name: "Usuń" }));
  expect(action).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "Usuń konto i dane" }));
  expect(action).toHaveBeenCalledWith("removeAccount", account.id);
  await fireEvent.click(screen.getByRole("button", { name: "Otwórz terminal z poleceniem…" }));
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
  await fireEvent.input(screen.getByLabelText("Kod logowania"), { target: { value: "demo-code" } });
  await fireEvent.click(screen.getByRole("button", { name: "Przekaż kod" }));
  expect(action).toHaveBeenCalledWith("submitLoginCode", account.id, "demo-code");
  await waitFor(() => expect(screen.getByLabelText("Kod logowania")).toHaveValue(""));
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
  await fireEvent.click(screen.getByRole("button", { name: "Przesuń Praca w górę" }));
  expect(pool).toHaveBeenCalledWith({ id: account.id, inPool: true, poolOrder: 1 });
  expect(screen.getByRole("button", { name: "Przesuń Praca w dół" })).toBeDisabled();
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
  expect(screen.getByText(/Osiągnięto maksymalną liczbę/)).toBeInTheDocument();
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
  const input = await screen.findByLabelText("Kod logowania");
  input.focus();
  await fireEvent.input(input, { target: { value: "demo-draft" } });
  emit({
    type: "accounts-changed",
    ...snapshot,
    accounts: snapshot.accounts.map((a) => ({ ...a, checkedAt: "2026-11-16T00:00:00Z" })),
  });
  await waitFor(() => expect(screen.getByLabelText("Kod logowania")).toBe(input));
  expect(input).toHaveValue("demo-draft");
  expect(input).toHaveFocus();
  emit({
    type: "accounts-changed",
    ...snapshot,
    accounts: [{ ...account, loggedIn: true, login: { ...account.login, phase: "success" } }],
  });
  await waitFor(() => expect(screen.queryByLabelText("Kod logowania")).toBeNull());
});
