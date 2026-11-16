// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMockApiKeysApi } from "./mock-api-keys-api";

// Test data only: no real key.
describe("mock API keys API", () => {
  it("never answers with the key, only a mask and a state", async () => {
    const api = createMockApiKeysApi(0);
    const saved = await api.set({ provider: "codex", key: "test-key-0000-abcd" });
    expect(saved).toMatchObject({ maskedKey: "••••abcd", status: "unchecked" });
    expect(JSON.stringify(await api.list())).not.toContain("test-key-0000");
  });

  it("checks, rejects a bad demo key, and removes", async () => {
    const api = createMockApiKeysApi(0);
    await expect(api.check({ provider: "claude" })).rejects.toThrow();
    await api.set({ provider: "claude", key: "test-key-1111-wxyz" });
    expect((await api.check({ provider: "claude" })).status).toBe("ok");
    await api.set({ provider: "claude", key: "bad-key-1111-wxyz" });
    expect((await api.check({ provider: "claude" })).status).toBe("rejected");
    expect(await api.remove({ provider: "claude" })).toMatchObject({ maskedKey: null, status: "unchecked" });
  });
});
