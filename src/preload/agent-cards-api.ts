// COSGRAL W11 (BE-B): the window API of the agent cards. Answers are checked with the contract guards.

import {
  type AgentCardDetails,
  type AgentCardsDesktopApi,
  type AgentCardsOverview,
  type AgentPreferences,
  type AgentPublishDetails,
  IPC_CHANNELS,
  isAgentCardDetails,
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
    details: (input) => invoke(IPC_CHANNELS.agentCardsDetails, input, decodeDetails),
    publishTemplate: (input) => invoke(IPC_CHANNELS.agentCardsPublishTemplate, input, decodePublish),
    unpublishTemplate: (input) => invoke(IPC_CHANNELS.agentCardsUnpublishTemplate, input, decodePublish),
  };
}

function decodeOverview(value: unknown): AgentCardsOverview {
  if (!isAgentCardsOverview(value)) throw new Error("Invalid agent cards overview.");
  return value;
}

function decodeDetails(value: unknown): AgentCardDetails {
  if (!isAgentCardDetails(value)) throw new Error("Invalid agent card details.");
  return value;
}

function decodePublish(value: unknown): AgentPublishDetails {
  if (!isAgentCardDetails(value) || value.card !== "publish") throw new Error("Invalid publish state.");
  return value;
}

function decodePreferences(value: unknown): AgentPreferences {
  if (!isAgentPreferences(value)) throw new Error("Invalid agent preferences.");
  return value;
}
