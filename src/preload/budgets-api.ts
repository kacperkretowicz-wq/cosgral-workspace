// COSGRAL W8-KK2: the window API of the budgets. Answers are checked with the contract guards.

import {
  type BudgetCsv,
  type BudgetOverview,
  type BudgetsDesktopApi,
  IPC_CHANNELS,
  isBudgetCsv,
  isBudgetOverview,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createBudgetsApi(invoke: Invoke): BudgetsDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.budgetsList, null, decodeOverview),
    set: (input) => invoke(IPC_CHANNELS.budgetsSet, input, decodeOverview),
    clear: (input) => invoke(IPC_CHANNELS.budgetsClear, input, decodeOverview),
    exportCsv: (input) => invoke(IPC_CHANNELS.budgetsExportCsv, input, decodeCsv),
  };
}

function decodeOverview(value: unknown): BudgetOverview {
  if (!isBudgetOverview(value)) throw new Error("Invalid budget overview.");
  return value;
}

function decodeCsv(value: unknown): BudgetCsv {
  if (!isBudgetCsv(value)) throw new Error("Invalid budget export.");
  return value;
}
