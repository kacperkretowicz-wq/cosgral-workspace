// COSGRAL W6-BE3: the window API of the plan card. Answers are checked with the contract guards.

import {
  type AgentPlan,
  IPC_CHANNELS,
  isAgentPlan,
  isAgentPlanList,
  type PlansDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createPlansApi(invoke: Invoke): PlansDesktopApi {
  return {
    respond: (input) => invoke(IPC_CHANNELS.plansRespond, input, decodePlan),
    list: (input) => invoke(IPC_CHANNELS.plansList, input, decodePlans),
  };
}

function decodePlan(value: unknown): AgentPlan {
  if (!isAgentPlan(value)) throw new Error("Invalid plan.");
  return value;
}

function decodePlans(value: unknown): AgentPlan[] {
  if (!isAgentPlanList(value)) throw new Error("Invalid plan list.");
  return value;
}
