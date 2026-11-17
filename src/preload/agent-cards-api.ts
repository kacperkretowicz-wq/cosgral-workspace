// COSGRAL W11 (BE-B): the window API of the agent cards. Answers are checked with the contract guards.

import {
  type AgentCardsDesktopApi,
  type AgentCardsOverview,
  type AgentPreferences,
  IPC_CHANNELS,
  isAgentCardsOverview,
  isAgentPreferences,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createAgentCardsApi(invoke: Invoke): AgentCardsDesktopApi {
  return {
    overview: (input) => invoke(IPC_CHANNELS.agentCardsOverview, input, decodeOverview),
    getPreferences: (input) => invoke(IPC_CHANNELS.agentCardsGetPreferences, input, decodePreferences),
    updatePreferences: (input) => invoke(IPC_CHANNELS.agentCardsUpdatePreferences, input, decodePreferences),
    resetSession: (input) => invoke(IPC_CHANNELS.agentCardsResetSession, input, decodeOverview),
  };
}

function decodeOverview(value: unknown): AgentCardsOverview {
  if (!isAgentCardsOverview(value)) throw new Error("Invalid agent cards overview.");
  return value;
}

function decodePreferences(value: unknown): AgentPreferences {
  if (!isAgentPreferences(value)) throw new Error("Invalid agent preferences.");
  return value;
}
