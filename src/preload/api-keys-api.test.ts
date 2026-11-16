// @vitest-environment node
import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createApiKeysApi } from "./api-keys-api";

// Test data only: no real key.
const entry = {
  provider: "codex",
  maskedKey: "••••abcd",
  status: "unchecked",
  message: null,
  checkedAt: null,
  updatedAt: "2026-11-16T10:00:00.000Z",
};

describe("api keys preload API", () => {
  it("sends each call on its own channel and checks the answer", async () => {
    const calls: Array<{ channel: string; payload: unknown }> = [];
    const api = createApiKeysApi(async (channel, payload, decoder) => {
      calls.push({ channel, payload });
      return decoder(channel === IPC_CHANNELS.apiKeysList ? [entry] : entry);
    });
    await api.list();
    await api.set({ provider: "codex", key: "test-key-0000-abcd" });
    await api.check({ provider: "codex" });
    await api.remove({ provider: "codex" });
    expect(calls.map((call) => call.channel)).toEqual([
      IPC_CHANNELS.apiKeysList,
      IPC_CHANNELS.apiKeysSet,
      IPC_CHANNELS.apiKeysCheck,
      IPC_CHANNELS.apiKeysRemove,
    ]);
  });

  it("refuses an answer that is not an API key entry", async () => {
    const api = createApiKeysApi(async (_channel, _payload, decoder) => decoder({ provider: "codex" }));
    await expect(api.check({ provider: "codex" })).rejects.toThrow(/Invalid API key/);
    await expect(api.list()).rejects.toThrow(/Invalid API key/);
  });
});
