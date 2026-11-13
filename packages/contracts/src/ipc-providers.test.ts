import { describe, expect, it } from "vitest";
import {
  acpModelId,
  IPC_CHANNELS,
  isAcpAgentConfig,
  isAcpAgentId,
  isAcpModel,
  isAgentEvent,
  isAgentModel,
  isProviderUsage,
  PROVIDER_LIMITS,
  type ProviderUsage,
} from "./ipc";

const config = {
  id: "gemini",
  name: "Gemini CLI",
  command: "gemini",
  args: ["--experimental-acp"],
  createdAt: "2026-11-13T05:30:00.000Z",
  updatedAt: "2026-11-13T05:30:00.000Z",
};

const usage: ProviderUsage = {
  provider: "acp",
  model: "acp:gemini",
  state: "limited",
  resetsAt: 1_794_550_000,
  usedPercent: 100,
  reason: "Quota exceeded",
};

describe("providers IPC contract", () => {
  it("makes an ACP agent a model next to the built-in ones", () => {
    expect(acpModelId("gemini")).toBe("acp:gemini");
    expect(isAcpModel("acp:gemini")).toBe(true);
    expect(isAgentModel("acp:open-code2")).toBe(true);
    expect(isAgentModel("gpt-5.6-luna")).toBe(true);
    for (const bad of ["acp:", "acp:Gemini", "acp:1x", "gemini", `acp:${"a".repeat(41)}`]) {
      expect(isAgentModel(bad)).toBe(false);
    }
    expect(isAcpAgentId("open-code")).toBe(true);
    expect(isAcpAgentId("open code")).toBe(false);
  });

  it("validates ACP configs and provider usage", () => {
    expect(isAcpAgentConfig(config)).toBe(true);
    expect(isAcpAgentConfig({ ...config, args: "x" })).toBe(false);
    expect(isProviderUsage(usage)).toBe(true);
    expect(isProviderUsage({ ...usage, provider: "grok" })).toBe(false);
    expect(isProviderUsage({ ...usage, state: "busy" })).toBe(false);
    expect(PROVIDER_LIMITS.fallbackModels).toBe(4);
  });

  it("accepts the three new events and has IPC channels", () => {
    expect(isAgentEvent({ type: "provider-usage-changed", usage: [usage] })).toBe(true);
    expect(
      isAgentEvent({
        type: "model-fallback",
        botId: "chief",
        fromModel: "acp:gemini",
        toModel: "gpt-5.6-luna",
        reason: "Gemini CLI: usage limit",
      }),
    ).toBe(true);
    expect(isAgentEvent({ type: "model-fallback", botId: "chief", fromModel: "x", toModel: "y", reason: "" })).toBe(
      false,
    );
    expect(isAgentEvent({ type: "acp-agents-changed", agents: [config] })).toBe(true);
    expect(IPC_CHANNELS.providersSetFallbackModels).toBe("providers:set-fallback-models");
  });
});
