// COSGRAL W5-BE4/BE7: fallback model lists for Storybook and the preview. Demo data only. The same rules as the
// program: up to 8 models per list, no repeats, order kept. After an agent's own model come its own list, then the list
// of its provider ("provider:codex", "provider:claude", "provider:acp:<id>", "provider:endpoint:<id>"), then the general
// list ("*"), each model once (`fallbackChain` from the contract, the same as the program).
// `removedModels` names ACP or endpoint models whose agent or endpoint is gone: shown as unavailable, never tried.
// `agentModels` gives the demo agents their own model, so the mock knows which provider list they follow.

import {
  type AgentModelId,
  type FallbackModelsInfo,
  fallbackChain,
  fallbackModelsProblem,
  fallbackScopeProblem,
  GENERAL_FALLBACK_SCOPE,
  isProviderFallbackScope,
  type ProvidersDesktopApi,
  providerFallbackScope,
} from "@openbot/contracts/ipc";

type FallbackMethods = Pick<
  ProvidersDesktopApi,
  "getFallbackModels" | "setFallbackModels" | "getFallbackInfo" | "resetFallbackModels"
>;

export interface MockFallbackOptions {
  /** The own model of each demo agent (default: "gpt-5.6-luna", a Codex model). */
  agentModels?: Record<string, AgentModelId>;
}

export function createMockFallbackModelsApi(
  removedModels: readonly AgentModelId[] = [],
  options: MockFallbackOptions = {},
): Required<FallbackMethods> {
  const lists = new Map<string, AgentModelId[]>();
  const info = (botId: string): FallbackModelsInfo => {
    const own = lists.get(botId) ?? null;
    const general = lists.get(GENERAL_FALLBACK_SCOPE) ?? [];
    const isAgent = botId !== GENERAL_FALLBACK_SCOPE && !isProviderFallbackScope(botId);
    const ownModel = isAgent ? (options.agentModels?.[botId] ?? "gpt-5.6-luna") : null;
    const providerScope = ownModel ? providerFallbackScope(ownModel) : null;
    const provider = providerScope ? (lists.get(providerScope) ?? null) : null;
    const chain = fallbackChain({
      ownModel,
      // A provider list is its own layer "provider"; the general list is "general".
      own: isAgent ? own : null,
      provider: isAgent ? provider : isProviderFallbackScope(botId) ? own : null,
      general,
      isAvailable: (model) => !removedModels.includes(model),
    });
    return {
      botId,
      own: own ? [...own] : null,
      general: [...general],
      effective: chain.filter((entry) => entry.available).map((entry) => entry.model),
      unavailable: chain.filter((entry) => !entry.available).map((entry) => entry.model),
      providerScope,
      provider: provider ? [...provider] : null,
      chain,
    };
  };
  const check = (botId: string) => {
    const problem = fallbackScopeProblem(botId);
    if (problem) throw new Error(problem);
  };
  return {
    getFallbackModels: async (botId) => [...(lists.get(botId) ?? [])],
    setFallbackModels: async ({ botId, fallbackModels }) => {
      check(botId);
      const problem = fallbackModelsProblem(fallbackModels);
      if (problem) throw new Error(problem);
      lists.set(botId, [...fallbackModels]);
      return [...fallbackModels];
    },
    getFallbackInfo: async (botId) => info(botId),
    resetFallbackModels: async (botId) => {
      check(botId);
      lists.delete(botId);
      return info(botId);
    },
  };
}
