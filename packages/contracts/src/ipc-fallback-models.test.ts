import { describe, expect, it } from "vitest";
import {
  fallbackModelsProblem,
  GENERAL_FALLBACK_SCOPE,
  IPC_CHANNELS,
  isFallbackModelsInfo,
  normalizeFallbackModels,
  PROVIDER_LIMITS,
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
    };
    expect(isFallbackModelsInfo(info)).toBe(true);
    expect(isFallbackModelsInfo({ ...info, own: ["claude-opus-5"] })).toBe(true);
    expect(isFallbackModelsInfo({ ...info, own: "x" })).toBe(false);
    expect(isFallbackModelsInfo({ ...info, general: ["no-such-model"] })).toBe(false);
    expect(isFallbackModelsInfo({ ...info, botId: 1 })).toBe(false);
  });
});
