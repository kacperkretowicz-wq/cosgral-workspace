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
import { isAcpModel, isAgentModel, isClaudeModel } from "./ipc-conversation";
import { isEndpointId, parseEndpointModel } from "./ipc-endpoints";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const PROVIDER_LIMITS = {
  /** ACP agent id: lowercase letter first, then lowercase letters, digits and dashes. */
  acpId: 40,
  acpName: 80,
  command: 1_000,
  arg: 2_000,
  args: 64,
  acpAgents: 16,
  /** W5-BE4: 4 -> 8. Lists saved with up to 4 models stay valid. */
  fallbackModels: 8,
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

/**
 * W5-BE4: the id that stands for the general fallback list (agents without an own list use it). `getFallbackModels`
 * and `setFallbackModels` take it as `botId`; no agent can have this id.
 */
export const GENERAL_FALLBACK_SCOPE = "*";

/**
 * W5-BE7: a provider's own fallback list. `getFallbackModels`, `setFallbackModels`, `getFallbackInfo` and
 * `resetFallbackModels` take it as `botId`, like "*": "provider:codex", "provider:claude", "provider:acp:<id>",
 * "provider:endpoint:<id>". Its models may be of any provider.
 */
export const PROVIDER_FALLBACK_PREFIX = "provider:";

/** W5-BE7: which layer a model of the chain comes from (shown as Agent / Provider / All providers). */
export const FALLBACK_SOURCES = ["own", "provider", "general"] as const;
export type FallbackSource = (typeof FALLBACK_SOURCES)[number];

export interface FallbackChainEntry {
  model: AgentModelId;
  source: FallbackSource;
  /** false: an ACP agent or own endpoint that was removed; shown, never tried. */
  available: boolean;
}

/** W5-BE4/BE7: what an agent tries after its own model, and where each model comes from. */
export interface FallbackModelsInfo {
  /** The agent id, "*" or a provider list ("provider:…"). */
  botId: string;
  /** The saved list of `botId` itself (an agent's own list; for "*" and "provider:…" that list); null = none saved. */
  own: AgentModelId[] | null;
  general: AgentModelId[];
  /** The models of `chain` that can run, in order. */
  effective: AgentModelId[];
  /** The models of `chain` that cannot run now (an ACP agent or own endpoint that was removed); shown, never tried. */
  unavailable: AgentModelId[];
  /** W5-BE7: for an agent, the provider list it follows (from its own model); null for "*" and provider lists. */
  providerScope: string | null;
  /** W5-BE7: the saved list of `providerScope`; null = none saved (or no provider scope). */
  provider: AgentModelId[] | null;
  /**
   * W5-BE7: the whole order after the agent's own model: its own list, then its provider's list, then the general
   * list, each model once (the first layer that lists it wins) and never the agent's own model.
   */
  chain: FallbackChainEntry[];
}

/** W5-BE7: the provider list a model belongs to. */
export function providerFallbackScope(model: AgentModelId): string {
  const endpoint = parseEndpointModel(model);
  if (endpoint) return `${PROVIDER_FALLBACK_PREFIX}endpoint:${endpoint.endpointId}`;
  if (isAcpModel(model)) return `${PROVIDER_FALLBACK_PREFIX}${model}`;
  return `${PROVIDER_FALLBACK_PREFIX}${isClaudeModel(model) ? "claude" : "codex"}`;
}

export function isProviderFallbackScope(value: unknown): value is string {
  if (!isString(value) || !value.startsWith(PROVIDER_FALLBACK_PREFIX)) return false;
  const rest = value.slice(PROVIDER_FALLBACK_PREFIX.length);
  if (rest === "codex" || rest === "claude") return true;
  if (rest.startsWith("acp:")) return isAcpAgentId(rest.slice(4));
  return rest.startsWith("endpoint:") && isEndpointId(rest.slice(9));
}

/** W5-BE7: why `botId` cannot hold a fallback list, or null (an agent id, "*" or a valid provider list). */
export function fallbackScopeProblem(scope: unknown) {
  if (!isString(scope) || scope.length === 0) return 'The fallback list needs an agent, "*" or a provider.';
  if (scope.startsWith(PROVIDER_FALLBACK_PREFIX) && !isProviderFallbackScope(scope))
    return "Unknown provider for a fallback list.";
  return null;
}

/** W5-BE7: own list, then provider list, then general list; each model once, never `ownModel`. */
export function fallbackChain(input: {
  ownModel: AgentModelId | null;
  own: readonly AgentModelId[] | null;
  provider: readonly AgentModelId[] | null;
  general: readonly AgentModelId[];
  isAvailable: (model: AgentModelId) => boolean;
}): FallbackChainEntry[] {
  const seen = new Set<string>(input.ownModel ? [input.ownModel] : []);
  const chain: FallbackChainEntry[] = [];
  const layers: Array<[FallbackSource, readonly AgentModelId[] | null]> = [
    ["own", input.own],
    ["provider", input.provider],
    ["general", input.general],
  ];
  for (const [source, models] of layers) {
    for (const model of models ?? []) {
      if (seen.has(model)) continue;
      seen.add(model);
      chain.push({ model, source, available: input.isAvailable(model) });
    }
  }
  return chain;
}

/** A readable reason a list is not allowed (more than 8, a repeat, an unknown model), or null. */
export function fallbackModelsProblem(models: unknown): string | null {
  if (!Array.isArray(models)) return "The fallback models must be a list.";
  if (models.length > PROVIDER_LIMITS.fallbackModels)
    return `At most ${PROVIDER_LIMITS.fallbackModels} fallback models.`;
  if (!models.every(isAgentModel)) return "Unknown model in the fallback list.";
  if (new Set(models).size !== models.length) return "A fallback model is listed twice.";
  return null;
}

/** A stored list read back: order kept, unknown models and repeats dropped, cut at the limit. */
export function normalizeFallbackModels(value: unknown): AgentModelId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const models: AgentModelId[] = [];
  for (const item of value) {
    if (!isAgentModel(item) || seen.has(item)) continue;
    seen.add(item);
    models.push(item);
    if (models.length === PROVIDER_LIMITS.fallbackModels) break;
  }
  return models;
}

export function isFallbackModelsInfo(value: unknown): value is FallbackModelsInfo {
  const isList = (list: unknown): list is AgentModelId[] => Array.isArray(list) && list.every(isAgentModel);
  const isEntry = (entry: unknown): entry is FallbackChainEntry =>
    isDynamicRecord(entry) &&
    isAgentModel(entry.model) &&
    isOneOf(FALLBACK_SOURCES, entry.source) &&
    isBoolean(entry.available);
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    (value.own === null || isList(value.own)) &&
    isList(value.general) &&
    isList(value.effective) &&
    isList(value.unavailable) &&
    (value.providerScope === null || isProviderFallbackScope(value.providerScope)) &&
    (value.provider === null || isList(value.provider)) &&
    Array.isArray(value.chain) &&
    value.chain.every(isEntry)
  );
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
