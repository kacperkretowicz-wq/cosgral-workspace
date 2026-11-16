// COSGRAL W5-BE4: fallback model lists for Storybook and the preview. Demo data only. The same rules as the program:
// up to 8 models, no repeats, order kept; an agent without its own list follows the general list ("*").
// `removedAcpModels` names ACP models whose agent is gone: they stay in the list but are shown as unavailable.

import {
  type AgentModelId,
  type FallbackModelsInfo,
  fallbackModelsProblem,
  GENERAL_FALLBACK_SCOPE,
  type ProvidersDesktopApi,
} from "@openbot/contracts/ipc";

type FallbackMethods = Pick<
  ProvidersDesktopApi,
  "getFallbackModels" | "setFallbackModels" | "getFallbackInfo" | "resetFallbackModels"
>;

export function createMockFallbackModelsApi(removedAcpModels: readonly AgentModelId[] = []): Required<FallbackMethods> {
  const lists = new Map<string, AgentModelId[]>();
  const info = (botId: string): FallbackModelsInfo => {
    const own = lists.get(botId) ?? null;
    const general = lists.get(GENERAL_FALLBACK_SCOPE) ?? [];
    const list = own ?? general;
    return {
      botId,
      own: own ? [...own] : null,
      general: [...general],
      effective: list.filter((model) => !removedAcpModels.includes(model)),
      unavailable: list.filter((model) => removedAcpModels.includes(model)),
    };
  };
  return {
    getFallbackModels: async (botId) => [...(lists.get(botId) ?? [])],
    setFallbackModels: async ({ botId, fallbackModels }) => {
      const problem = fallbackModelsProblem(fallbackModels);
      if (problem) throw new Error(problem);
      lists.set(botId, [...fallbackModels]);
      return [...fallbackModels];
    },
    getFallbackInfo: async (botId) => info(botId),
    resetFallbackModels: async (botId) => {
      lists.delete(botId);
      return info(botId);
    },
  };
}
