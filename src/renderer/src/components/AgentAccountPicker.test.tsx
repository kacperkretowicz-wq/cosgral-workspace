import type { AccountsSnapshot } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { AgentAccountPicker } from "./AgentAccountPicker";

afterEach(() => vi.unstubAllGlobals());
it("filters provider accounts and saves explicit/default assignment", async () => {
  const assignAccountToAgent = vi.fn();
  const snapshot: AccountsSnapshot = {
    accounts: [],
    pool: { maxAccountsPerProvider: 3, switchBeforeFirstAction: true },
    assignments: [],
  };
  const base = {
    stateDir: "demo",
    system: false,
    loggedIn: true,
    account: null,
    plan: null,
    isDefault: false,
    inPool: true,
    poolOrder: 1,
    enabled: true,
    limitedUntil: null,
    login: { phase: "idle" as const, message: null, url: null, userCode: null },
    checkedAt: null,
  };
  snapshot.accounts = [
    { ...base, id: "acc-demo0001", provider: "codex", label: "Praca" },
    { ...base, id: "acc-demo0002", provider: "claude", label: "Drugie" },
  ];
  vi.stubGlobal("openbot", {
    subscriptions: { listAccounts: async () => snapshot, assignAccountToAgent },
    agent: { onEvent: () => () => {} },
  });
  render(() => <AgentAccountPicker botId="chief" provider="codex" />);
  await screen.findByRole("option", { name: "Praca" });
  expect(screen.queryByRole("option", { name: "Drugie" })).toBeNull();
  await fireEvent.change(screen.getByLabelText("Konto"), { target: { value: "acc-demo0001" } });
  await waitFor(() => expect(assignAccountToAgent).toHaveBeenCalledWith({ botId: "chief", accountId: "acc-demo0001" }));
  await waitFor(() => expect(screen.getByLabelText("Konto")).toBeEnabled());
  await fireEvent.change(screen.getByLabelText("Konto"), { target: { value: "" } });
  await waitFor(() => expect(assignAccountToAgent).toHaveBeenCalledWith({ botId: "chief", accountId: null }));
});

it("restores the saved choice when assignment fails", async () => {
  const base = {
    stateDir: "demo",
    system: false,
    loggedIn: true,
    account: null,
    plan: null,
    isDefault: false,
    inPool: true,
    poolOrder: 1,
    enabled: true,
    limitedUntil: null,
    login: { phase: "idle" as const, message: null, url: null, userCode: null },
    checkedAt: null,
  };
  vi.stubGlobal("openbot", {
    subscriptions: {
      listAccounts: async () => ({
        accounts: [{ ...base, id: "acc-demo0001", provider: "codex", label: "Praca" }],
        pool: { maxAccountsPerProvider: 3, switchBeforeFirstAction: true },
        assignments: [],
      }),
      assignAccountToAgent: async () => {
        throw new Error("Nie zapisano wyboru.");
      },
    },
    agent: { onEvent: () => () => {} },
  });
  render(() => <AgentAccountPicker botId="chief" provider="codex" />);
  await screen.findByRole("option", { name: "Praca" });
  await fireEvent.change(screen.getByLabelText("Konto"), { target: { value: "acc-demo0001" } });
  await screen.findByRole("alert");
  await waitFor(() => expect(screen.getByLabelText("Konto")).toHaveValue(""));
});

it("says which account the agent answers with now", async () => {
  vi.stubGlobal("openbot", {
    subscriptions: {
      listAccounts: async () => ({
        accounts: [],
        pool: { maxAccountsPerProvider: 3, switchBeforeFirstAction: true },
        assignments: [],
        active: [
          { botId: "chief", accountId: "acc-demo0001", label: "Praca" },
          { botId: "other", accountId: "acc-demo0002", label: "Drugie" },
        ],
      }),
      assignAccountToAgent: vi.fn(),
    },
    agent: { onEvent: () => () => {} },
  });
  render(() => <AgentAccountPicker botId="chief" provider="codex" />);
  expect(await screen.findByText("Teraz odpowiada kontem: Praca")).toBeInTheDocument();
  expect(screen.queryByText(/Drugie/)).toBeNull();
});
