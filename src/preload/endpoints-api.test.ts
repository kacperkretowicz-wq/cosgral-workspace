// @vitest-environment node
import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createEndpointsApi } from "./endpoints-api";

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

describe("endpoints preload API", () => {
  it("sends each call on its own channel and checks the answer", async () => {
    const calls: string[] = [];
    const api = createEndpointsApi(async (channel, _payload, decoder) => {
      calls.push(channel);
      if (channel === IPC_CHANNELS.endpointsRemove) return decoder(undefined);
      return decoder(
        channel === IPC_CHANNELS.endpointsList || channel === IPC_CHANNELS.endpointsDetectLocal ? [endpoint] : endpoint,
      );
    });
    await api.list();
    await api.save({ label: "Ollama", kind: "ollama", baseUrl: "http://127.0.0.1:11434/v1" });
    await api.check({ id: "ollama" });
    await api.detectLocal();
    await expect(api.remove({ id: "ollama" })).resolves.toBeUndefined();
    expect(calls).toEqual([
      IPC_CHANNELS.endpointsList,
      IPC_CHANNELS.endpointsSave,
      IPC_CHANNELS.endpointsCheck,
      IPC_CHANNELS.endpointsDetectLocal,
      IPC_CHANNELS.endpointsRemove,
    ]);
  });

  it("refuses an answer that is not an endpoint", async () => {
    const api = createEndpointsApi(async (_channel, _payload, decoder) => decoder({ id: "ollama" }));
    await expect(api.check({ id: "ollama" })).rejects.toThrow(/Invalid endpoint/);
    await expect(api.list()).rejects.toThrow(/Invalid endpoint/);
  });
});
