import { describe, expect, it } from "vitest";
import { parseAcpAgentId, parseFallbackBotId, parseFallbackModels, parseSaveAcpAgent } from "./provider-inputs";

describe("provider IPC inputs", () => {
  it("parses an ACP agent", () => {
    expect(
      parseSaveAcpAgent({ id: "gemini", name: "Gemini CLI", command: "gemini", args: ["--experimental-acp"] }),
    ).toEqual({
      id: "gemini",
      name: "Gemini CLI",
      command: "gemini",
      args: ["--experimental-acp"],
    });
    expect(parseSaveAcpAgent({ id: "oc", name: "OpenCode", command: "opencode" }).args).toBeUndefined();
    expect(parseAcpAgentId({ id: "oc" })).toEqual({ id: "oc" });
  });

  it("rejects bad ACP agent input", () => {
    expect(() => parseSaveAcpAgent(null)).toThrow();
    expect(() => parseSaveAcpAgent({ id: "a", name: "A", command: "" })).toThrow();
    expect(() => parseSaveAcpAgent({ id: "a", name: "A", command: "x", args: [1] })).toThrow(/args/);
    expect(() => parseSaveAcpAgent({ id: "a", name: "A", command: "x", args: Array(65).fill("a") })).toThrow(/64/);
    expect(() => parseAcpAgentId({})).toThrow();
  });

  it("parses fallback models and rejects unknown ones", () => {
    expect(parseFallbackBotId("chief")).toBe("chief");
    expect(parseFallbackModels({ botId: "chief", fallbackModels: ["acp:backup"] })).toEqual({
      botId: "chief",
      fallbackModels: ["acp:backup"],
    });
    expect(() => parseFallbackModels({ botId: "chief", fallbackModels: ["no-such-model"] })).toThrow(/unknown model/);
    expect(() => parseFallbackModels({ botId: "chief", fallbackModels: "acp:x" })).toThrow();
  });
});
