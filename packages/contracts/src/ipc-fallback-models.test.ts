import { describe, expect, it } from "vitest";
import {
  fallbackChain,
  fallbackModelsProblem,
  fallbackScopeProblem,
  GENERAL_FALLBACK_SCOPE,
  IPC_CHANNELS,
  isFallbackModelsInfo,
  isProviderFallbackScope,
  normalizeFallbackModels,
  PROVIDER_LIMITS,
  providerFallbackScope,
} from "./ipc";

const EIGHT = [
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "claude-opus-5",
  "claude-sonnet-5",
  "acp:a",
  "acp:b",
  "acp:c",
] as const;

describe("fallback model list rules (W5-BE4)", () => {
  it("allows up to 8 models", () => {
    expect(PROVIDER_LIMITS.fallbackModels).toBe(8);
    expect(fallbackModelsProblem([])).toBeNull();
    expect(fallbackModelsProblem(["acp:a"])).toBeNull();
    expect(fallbackModelsProblem(EIGHT)).toBeNull();
  });

  it("refuses 9 models, a duplicate, an unknown model and a non-list", () => {
    expect(fallbackModelsProblem([...EIGHT, "acp:d"])).toMatch(/at most 8/i);
    expect(fallbackModelsProblem(["acp:a", "claude-opus-5", "acp:a"])).toMatch(/twice/i);
    expect(fallbackModelsProblem(["acp:a", "no-such-model"])).toMatch(/unknown/i);
    expect(fallbackModelsProblem("acp:a")).toMatch(/list/i);
    expect(fallbackModelsProblem(null)).toMatch(/list/i);
  });

  it("normalizes a stored list: keeps the order, drops unknown models and repeats, cuts at 8", () => {
    expect(normalizeFallbackModels(["acp:b", "acp:a"])).toEqual(["acp:b", "acp:a"]);
    expect(normalizeFallbackModels(["acp:a", "x", "acp:a", 4, "claude-opus-5"])).toEqual(["acp:a", "claude-opus-5"]);
    expect(normalizeFallbackModels([...EIGHT, "acp:d", "acp:e"])).toEqual([...EIGHT]);
    expect(normalizeFallbackModels("nope")).toEqual([]);
  });

  it("has a reserved scope for the general list and the new channels", () => {
    expect(GENERAL_FALLBACK_SCOPE).toBe("*");
    expect(IPC_CHANNELS.providersGetFallbackInfo).toBe("providers:get-fallback-info");
    expect(IPC_CHANNELS.providersResetFallbackModels).toBe("providers:reset-fallback-models");
  });

  it("checks the info an agent gets", () => {
    const info = {
      botId: "chief",
      own: null,
      general: ["acp:a"],
      effective: ["acp:a"],
      unavailable: [],
      providerScope: "provider:codex",
      provider: null,
      chain: [{ model: "acp:a", source: "general", available: true }],
    };
    expect(isFallbackModelsInfo(info)).toBe(true);
    expect(isFallbackModelsInfo({ ...info, own: ["claude-opus-5"] })).toBe(true);
    expect(isFallbackModelsInfo({ ...info, own: "x" })).toBe(false);
    expect(isFallbackModelsInfo({ ...info, general: ["no-such-model"] })).toBe(false);
    expect(isFallbackModelsInfo({ ...info, botId: 1 })).toBe(false);
    expect(isFallbackModelsInfo({ ...info, providerScope: "provider:nope" })).toBe(false);
    expect(isFallbackModelsInfo({ ...info, chain: [{ model: "acp:a", source: "elsewhere", available: true }] })).toBe(
      false,
    );
  });
});

describe("fallback lists per provider (W5-BE7)", () => {
  it("names the provider list of a model: Codex, Claude, each ACP agent and each endpoint", () => {
    expect(providerFallbackScope("gpt-5.6-luna")).toBe("provider:codex");
    expect(providerFallbackScope("claude-opus-5")).toBe("provider:claude");
    expect(providerFallbackScope("acp:gemini")).toBe("provider:acp:gemini");
    expect(providerFallbackScope("endpoint:local-llm/llama3:8b")).toBe("provider:endpoint:local-llm");
  });

  it("accepts an agent id, the general list and the four kinds of provider list, nothing else that looks like one", () => {
    for (const scope of [
      "chief",
      "*",
      "provider:codex",
      "provider:claude",
      "provider:acp:gemini",
      "provider:endpoint:local-llm",
    ])
      expect(fallbackScopeProblem(scope)).toBeNull();
    for (const scope of ["provider:", "provider:openai", "provider:acp:", "provider:acp:Bad", "provider:endpoint:", ""])
      expect(fallbackScopeProblem(scope)).not.toBeNull();
    expect(isProviderFallbackScope("provider:codex")).toBe(true);
    expect(isProviderFallbackScope("chief")).toBe(false);
  });

  it("chains the agent's list, then its provider's, then the general one: no repeats, no own model, source kept", () => {
    const chain = fallbackChain({
      ownModel: "gpt-5.6-luna",
      own: ["gpt-5.6-terra", "claude-opus-5"],
      provider: ["claude-opus-5", "gpt-5.6-luna", "acp:a"],
      general: ["acp:a", "acp:gone"],
      isAvailable: (model) => model !== "acp:gone",
    });
    expect(chain).toEqual([
      { model: "gpt-5.6-terra", source: "own", available: true },
      { model: "claude-opus-5", source: "own", available: true },
      { model: "acp:a", source: "provider", available: true },
      { model: "acp:gone", source: "general", available: false },
    ]);
  });

  it("skips a layer that has no list, and an empty list adds nothing", () => {
    const base = { ownModel: "gpt-5.6-luna" as const, isAvailable: () => true };
    expect(fallbackChain({ ...base, own: null, provider: null, general: [] })).toEqual([]);
    expect(fallbackChain({ ...base, own: [], provider: null, general: ["acp:a"] })).toEqual([
      { model: "acp:a", source: "general", available: true },
    ]);
    // 3 full layers stay 24 entries at most: each list is at most 8.
    const eight = [...EIGHT];
    expect(fallbackChain({ ...base, ownModel: null, own: eight, provider: eight, general: eight })).toHaveLength(8);
  });
});
