// @vitest-environment node
import { isModelEndpoint } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockEndpointsApi } from "./mock-endpoints-api";

// Test data only: no real key.
describe("mock endpoints API", () => {
  it("saves without contacting, fetches the models on request, and never answers with the key", async () => {
    const api = createMockEndpointsApi(0);
    const saved = await api.save({
      label: "Local LLM",
      kind: "openai-compatible",
      baseUrl: "http://127.0.0.1:8080/v1",
      key: "test-key-0000-abcd",
    });
    expect(saved).toMatchObject({ state: "unchecked", models: [], maskedKey: "••••abcd", chatOnly: true });
    expect(isModelEndpoint(saved)).toBe(true);
    expect(JSON.stringify(await api.list())).not.toContain("test-key-0000");
    expect(await api.check({ id: saved.id })).toMatchObject({ state: "ok", models: ["llama3:8b", "qwen2.5-coder:7b"] });
  });

  it("refuses a bad address, rejects a bad demo key, reports an unreachable server and removes", async () => {
    const api = createMockEndpointsApi(0);
    await expect(api.save({ label: "x", kind: "ollama", baseUrl: "ftp://127.0.0.1" })).rejects.toThrow(/http/);
    const keyed = await api.save({
      label: "Keyed",
      kind: "openai-compatible",
      baseUrl: "http://localhost:1/v1",
      key: "bad-key-1234",
    });
    expect((await api.check({ id: keyed.id })).state).toBe("rejected");
    const down = await api.save({
      label: "Down",
      kind: "openai-compatible",
      baseUrl: "http://localhost:2/unreachable",
    });
    expect((await api.check({ id: down.id })).state).toBe("unreachable");
    await api.remove({ id: keyed.id });
    expect((await api.list()).map((item) => item.id)).toEqual([down.id]);
  });

  it("drops the key when the address moves to another host", async () => {
    const api = createMockEndpointsApi(0);
    const saved = await api.save({
      label: "Moving",
      kind: "openai-compatible",
      baseUrl: "http://localhost:1/v1",
      key: "test-key-0000-abcd",
    });
    const moved = await api.save({
      id: saved.id,
      label: "Moving",
      kind: "openai-compatible",
      baseUrl: "http://localhost:2/v1",
    });
    expect(moved).toMatchObject({ hasKey: false, maskedKey: null, state: "unchecked" });
  });

  it("detects the Ollama preset on loopback", async () => {
    const api = createMockEndpointsApi(0);
    const found = await api.detectLocal();
    expect(found[0]).toMatchObject({ id: "ollama", baseUrl: "http://127.0.0.1:11434/v1", state: "ok" });
    expect((await api.list()).length).toBe(1);
  });
});
