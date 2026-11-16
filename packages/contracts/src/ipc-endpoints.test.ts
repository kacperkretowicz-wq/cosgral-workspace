import { describe, expect, it } from "vitest";
import {
  checkEndpointUrl,
  ENDPOINT_PRESETS,
  endpointModelId,
  isAgentEvent,
  isAgentModel,
  isEndpointModel,
  isModelEndpoint,
  parseEndpointIdInput,
  parseEndpointModel,
  parseSaveEndpointInput,
} from "./ipc";

const endpoint = {
  id: "ollama",
  label: "Ollama",
  kind: "ollama",
  baseUrl: "http://127.0.0.1:11434/v1",
  hasKey: false,
  maskedKey: null,
  models: ["llama3:8b"],
  state: "ok",
  message: null,
  checkedAt: null,
  warning: null,
  chatOnly: true,
};

describe("own model endpoints contract (W5-K2)", () => {
  it("has the presets of Ollama and LM Studio on loopback", () => {
    expect(ENDPOINT_PRESETS.map((preset) => preset.baseUrl)).toEqual([
      "http://127.0.0.1:11434/v1",
      "http://127.0.0.1:1234/v1",
    ]);
    for (const preset of ENDPOINT_PRESETS)
      expect(checkEndpointUrl(preset.baseUrl)).toMatchObject({ ok: true, loopback: true, warning: null });
  });

  it("checks the address: only http(s), nothing hidden in it, plain http only near this computer", () => {
    expect(checkEndpointUrl("http://localhost:1234/v1/")).toMatchObject({
      ok: true,
      baseUrl: "http://localhost:1234/v1",
    });
    expect(checkEndpointUrl("http://[::1]:11434/v1")).toMatchObject({ ok: true, loopback: true });
    expect(checkEndpointUrl("http://127.1/v1")).toMatchObject({ ok: true, loopback: true });
    expect(checkEndpointUrl("http://10.0.0.5:8000/v1")).toMatchObject({ ok: true, loopback: false });
    expect(checkEndpointUrl("http://172.20.1.1/v1")).toMatchObject({ ok: true });
    expect(checkEndpointUrl("http://my-pc:8000/v1")).toMatchObject({ ok: true });
    expect(checkEndpointUrl("http://box.local/v1")).toMatchObject({ ok: true });
    expect(checkEndpointUrl("https://api.example.com/v1")).toMatchObject({ ok: true, loopback: false });
    for (const bad of [
      "ftp://127.0.0.1/",
      "file:///c:/x",
      "data:text/plain,hi",
      "ws://localhost/v1",
      "http://172.32.0.1/v1",
      "http://example.com/v1",
      "http://8.8.8.8/v1",
      "http://localhost.example.com/v1",
      "http://u:p@localhost/v1",
      "http://localhost/v1?a=b",
      "http://localhost/v1#x",
      "not a url",
      "",
      "   ",
      `http://localhost/${"a".repeat(400)}`,
    ])
      expect(checkEndpointUrl(bad), bad).toMatchObject({ ok: false });
    expect(checkEndpointUrl(5)).toMatchObject({ ok: false });
  });

  it("makes agent model ids that keep slashes and colons of the model name", () => {
    const id = endpointModelId("ollama", "hf.co/org/model:q4");
    expect(id).toBe("endpoint:ollama/hf.co/org/model:q4");
    expect(parseEndpointModel(id)).toEqual({ endpointId: "ollama", model: "hf.co/org/model:q4" });
    expect(isAgentModel(id)).toBe(true);
    expect(isEndpointModel("endpoint:Ollama/x")).toBe(false);
    expect(isEndpointModel("endpoint:ollama/")).toBe(false);
    expect(isEndpointModel("endpoint:/x")).toBe(false);
    expect(isEndpointModel("endpoint:ollama")).toBe(false);
    expect(isEndpointModel("endpoint:ollama/a\nb")).toBe(false);
    expect(isEndpointModel("endpoint:ollama/ x")).toBe(false);
    expect(isAgentModel("acp:stub")).toBe(true);
    expect(isAgentModel("gpt-5.6-luna")).toBe(true);
  });

  it("accepts the endpoint, the list event and refuses a wrong shape", () => {
    expect(isModelEndpoint(endpoint)).toBe(true);
    expect(isModelEndpoint({ ...endpoint, state: "fine" })).toBe(false);
    expect(isModelEndpoint({ ...endpoint, models: [1] })).toBe(false);
    expect(isModelEndpoint({ ...endpoint, id: "Bad Id" })).toBe(false);
    expect(isAgentEvent({ type: "endpoints-changed", endpoints: [endpoint] })).toBe(true);
    expect(isAgentEvent({ type: "endpoints-changed", endpoints: [{ ...endpoint, kind: "x" }] })).toBe(false);
  });

  it("parses what the window sends and never repeats a key in an error", () => {
    expect(parseEndpointIdInput({ id: "ollama" })).toEqual({ id: "ollama" });
    expect(() => parseEndpointIdInput({ id: "../x" })).toThrow();
    expect(parseSaveEndpointInput({ label: " Mine ", kind: "ollama", baseUrl: "http://localhost:11434/v1" })).toEqual({
      label: "Mine",
      kind: "ollama",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(
      parseSaveEndpointInput({
        id: "mine",
        label: "M",
        kind: "openai-compatible",
        baseUrl: "x",
        key: " sk-test-1234 ",
        clearKey: true,
      }),
    ).toMatchObject({ id: "mine", key: "sk-test-1234", clearKey: true });
    expect(() => parseSaveEndpointInput({ label: "", kind: "ollama", baseUrl: "x" })).toThrow();
    expect(() => parseSaveEndpointInput({ label: "x", kind: "gemini", baseUrl: "x" })).toThrow();
    let message = "";
    try {
      parseSaveEndpointInput({ label: "x", kind: "ollama", baseUrl: "x", key: "has space in it" });
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).not.toContain("has space");
    expect(message).toMatch(/one piece/);
  });
});
