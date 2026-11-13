// COSGRAL W3: more providers, fallback models, usage and limits (parity rows 35 and 21).
//
// ACP agents: any program that speaks the Agent Client Protocol over stdio (Gemini CLI, OpenCode, …)
// is a provider. A person adds it with a command and arguments; it shows up as one model
// "acp:<id>" next to the Codex and Claude models, and gets the same program tools.
//
// Fallback models: an agent may list models to use, in order, when its own model's provider answers
// with a usage limit or is not available. Each model is tried at most once per message, so there is no
// loop, and a user error (bad input, refused request) never switches the model. While a turn runs on a
// fallback, the agent's `BotSummary.activeModel` names it and a `model-fallback` event says why.
//
// Usage: one entry per provider with its limit state and reset time; `provider-usage-changed` carries
// the whole list whenever a provider hits or leaves a limit.

import type { AgentModelId, AgentProviderId } from "./ipc-conversation";
import { isAgentModel } from "./ipc-conversation";
import { isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const PROVIDER_LIMITS = {
  /** ACP agent id: lowercase letter first, then lowercase letters, digits and dashes. */
  acpId: 40,
  acpName: 80,
  command: 1_000,
  arg: 2_000,
  args: 64,
  acpAgents: 16,
  fallbackModels: 4,
  /** Minutes a provider counts as unavailable after an availability error without a reset time. */
  unavailableCooldownMinutes: 5,
  /** Minutes a usage limit lasts when the provider gives no reset time. */
  limitWithoutResetMinutes: 60,
} as const;

export interface AcpAgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveAcpAgentInput {
  /** Kept when editing; a new agent's id becomes part of its model id "acp:<id>". */
  id: string;
  name: string;
  command: string;
  args?: string[];
}

export interface AcpAgentIdInput {
  id: string;
}

export const PROVIDER_USAGE_STATES = ["ok", "limited", "unavailable"] as const;
export type ProviderUsageState = (typeof PROVIDER_USAGE_STATES)[number];

export interface ProviderUsage {
  provider: AgentProviderId;
  /** For ACP: the ACP agent's model id; null for the whole provider. */
  model: AgentModelId | null;
  state: ProviderUsageState;
  /** When the limit or the unavailability ends: Unix seconds; null when unknown. */
  resetsAt: number | null;
  /** Highest used percentage of the provider's windows when it reports one. */
  usedPercent: number | null;
  /** Short readable reason for "limited" and "unavailable". */
  reason: string | null;
}

export interface FallbackModelsInput {
  botId: string;
  /** Tried in this order after the agent's own model; at most PROVIDER_LIMITS.fallbackModels. */
  fallbackModels: AgentModelId[];
}

export function acpModelId(acpId: string): `acp:${string}` {
  return `acp:${acpId}`;
}

export function isAcpAgentId(value: unknown): value is string {
  return isString(value) && value.length <= PROVIDER_LIMITS.acpId && /^[a-z][a-z0-9-]*$/.test(value);
}

export function isAcpAgentConfig(value: unknown): value is AcpAgentConfig {
  return (
    isDynamicRecord(value) &&
    isAcpAgentId(value.id) &&
    isString(value.name) &&
    isString(value.command) &&
    Array.isArray(value.args) &&
    value.args.every(isString) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isProviderUsage(value: unknown): value is ProviderUsage {
  return (
    isDynamicRecord(value) &&
    (value.provider === "codex" || value.provider === "claude" || value.provider === "acp") &&
    (value.model === null || isAgentModel(value.model)) &&
    isOneOf(PROVIDER_USAGE_STATES, value.state) &&
    (value.resetsAt === null || isNumber(value.resetsAt)) &&
    (value.usedPercent === null || isNumber(value.usedPercent)) &&
    (value.reason === null || isString(value.reason))
  );
}
