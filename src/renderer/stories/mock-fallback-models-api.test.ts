// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMockFallbackModelsApi } from "./mock-fallback-models-api";

describe("mock fallback models API", () => {
  it("follows the program's rules: 8 at most, no repeats, general list for agents without their own", async () => {
    const api = createMockFallbackModelsApi(["acp:gone"]);
    await api.setFallbackModels({ botId: "*", fallbackModels: ["acp:gone", "claude-opus-5"] });
    expect(await api.getFallbackInfo("chief")).toMatchObject({
      own: null,
      effective: ["claude-opus-5"],
      unavailable: ["acp:gone"],
    });
    await api.setFallbackModels({ botId: "chief", fallbackModels: [] });
    // W5-BE7: an empty own list adds nothing; the next layers still follow.
    expect(await api.getFallbackInfo("chief")).toMatchObject({ own: [], effective: ["claude-opus-5"] });
    expect(await api.resetFallbackModels("chief")).toMatchObject({ own: null });
    await expect(api.setFallbackModels({ botId: "chief", fallbackModels: ["acp:a", "acp:a"] })).rejects.toThrow(
      /twice/,
    );
    const nine = ["acp:a", "acp:b", "acp:c", "acp:d", "acp:e", "acp:f", "acp:g", "acp:h", "acp:i"] as const;
    await expect(api.setFallbackModels({ botId: "chief", fallbackModels: [...nine] })).rejects.toThrow(/8/);
  });

  it("W5-BE7: chains the agent's list, its provider's list and the general list, with the source of each model", async () => {
    const api = createMockFallbackModelsApi([], { agentModels: { chief: "gpt-5.6-luna", scout: "claude-opus-5" } });
    await api.setFallbackModels({ botId: "*", fallbackModels: ["acp:a"] });
    await api.setFallbackModels({ botId: "provider:codex", fallbackModels: ["claude-opus-5", "acp:a"] });
    await api.setFallbackModels({ botId: "chief", fallbackModels: ["gpt-5.6-terra"] });
    expect(await api.getFallbackInfo("chief")).toMatchObject({
      providerScope: "provider:codex",
      provider: ["claude-opus-5", "acp:a"],
      effective: ["gpt-5.6-terra", "claude-opus-5", "acp:a"],
      chain: [
        { model: "gpt-5.6-terra", source: "own", available: true },
        { model: "claude-opus-5", source: "provider", available: true },
        { model: "acp:a", source: "provider", available: true },
      ],
    });
    // Another provider's agent does not get the Codex list.
    expect(await api.getFallbackInfo("scout")).toMatchObject({ providerScope: "provider:claude", provider: null });
    expect((await api.getFallbackInfo("scout")).chain).toEqual([
      { model: "acp:a", source: "general", available: true },
    ]);
    // A provider list itself: its models, then the general list.
    expect((await api.getFallbackInfo("provider:codex")).chain.map((entry) => entry.source)).toEqual([
      "provider",
      "provider",
    ]);
    await expect(api.setFallbackModels({ botId: "provider:openai", fallbackModels: [] })).rejects.toThrow(/provider/i);
  });
});
