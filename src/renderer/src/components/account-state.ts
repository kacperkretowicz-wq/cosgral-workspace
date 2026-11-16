import type { AccountsSnapshot } from "@openbot/contracts/ipc";
import { createSignal, onSettled } from "solid-js";
import { safeCliError } from "./ManagedCliSection";
export function accountError(error: unknown) {
  return safeCliError(error instanceof Error ? error.message : String(error)).replace(/[^\s@]+@[^\s@]+/g, "[konto]");
}
export function useAccounts() {
  const [snapshot, setSnapshot] = createSignal<AccountsSnapshot>();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let generation = 0;
  async function load() {
    const serial = ++generation;
    try {
      const value = await window.openbot.subscriptions?.listAccounts();
      if (serial === generation) setSnapshot(value);
    } catch (e) {
      setError(accountError(e));
    }
  }
  onSettled(() => {
    void load();
    const off = window.openbot.agent?.onEvent((event) => {
      if (event.type === "accounts-changed") {
        generation++;
        setSnapshot({ accounts: event.accounts, pool: event.pool, assignments: event.assignments });
      }
    });
    return () => {
      generation++;
      off?.();
    };
  });
  async function run(work: () => Promise<unknown>) {
    if (busy()) return false;
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
      return true;
    } catch (e) {
      setError(accountError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { snapshot, setSnapshot, error, busy, run, load };
}
