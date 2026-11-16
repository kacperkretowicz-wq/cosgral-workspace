// COSGRAL W8-KK2: the `budgets:*` IPC (this computer only): the overview, set and clear a budget, export the CSV. Every
// request is parsed by the contract first. The CSV goes back as text for the window to save: this file writes nothing.

import {
  IPC_CHANNELS,
  parseClearBudgetInput,
  parseExportBudgetCsvInput,
  parseSetBudgetInput,
} from "@openbot/contracts/ipc";
import type { BudgetMeter } from "../backend/budget-meter";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerBudgetsIpc(meter: () => BudgetMeter | null): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Budgets are managed on this computer only.");
    return request.payload;
  };
  const current = (): BudgetMeter => {
    const value = meter();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.budgetsList, (input: unknown) => {
    local(input);
    return current().overview();
  });
  handleTrusted(IPC_CHANNELS.budgetsSet, (input: unknown) => {
    const request = parseSetBudgetInput(local(input));
    return current().set(request);
  });
  handleTrusted(IPC_CHANNELS.budgetsClear, (input: unknown) => {
    const request = parseClearBudgetInput(local(input));
    return current().clear(request);
  });
  handleTrusted(IPC_CHANNELS.budgetsExportCsv, (input: unknown) => {
    const request = parseExportBudgetCsvInput(local(input));
    return current().exportCsv(request);
  });
}
