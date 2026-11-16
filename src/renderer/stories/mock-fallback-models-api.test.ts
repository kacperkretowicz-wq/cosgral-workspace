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
    expect(await api.getFallbackInfo("chief")).toMatchObject({ own: [], effective: [] });
    expect(await api.resetFallbackModels("chief")).toMatchObject({ own: null });
    await expect(api.setFallbackModels({ botId: "chief", fallbackModels: ["acp:a", "acp:a"] })).rejects.toThrow(
      /twice/,
    );
    const nine = ["acp:a", "acp:b", "acp:c", "acp:d", "acp:e", "acp:f", "acp:g", "acp:h", "acp:i"] as const;
    await expect(api.setFallbackModels({ botId: "chief", fallbackModels: [...nine] })).rejects.toThrow(/8/);
  });
});
