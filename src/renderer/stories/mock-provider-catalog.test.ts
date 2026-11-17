// @vitest-environment node
import { type AgentEvent, isProviderCatalogItems } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockProviderCatalog } from "./mock-provider-catalog";

const setup = () => {
  const events: AgentEvent[] = [];
  return { mock: createMockProviderCatalog((event) => events.push(event)), events };
};

describe("mock provider catalog (W12 BE-I)", () => {
  it("lists the 18 providers and keeps a pool of keys with masks only", async () => {
    const { mock, events } = setup();
    expect(isProviderCatalogItems(await mock.list())).toBe(true);
    await mock.setKey({ providerId: "mistral", key: "mistral-key-aaaa" });
    const added = await mock.addKey({ providerId: "mistral", key: "mistral-key-bbbb", label: "Work" });
    expect(added.state.keys.map((key) => [key.label, key.mask])).toEqual([
      ["Key", "••••aaaa"],
      ["Work", "••••bbbb"],
    ]);
    expect(JSON.stringify(events)).not.toContain("mistral-key-aaaa");
    const second = added.state.keys[1]?.id ?? "";
    const off = await mock.setKeyEnabled({ providerId: "mistral", keyId: second, enabled: false });
    expect(off.state.keys[1]?.enabled).toBe(false);
    mock.simulate.limitKey("mistral", "default", "2026-11-17T13:00:00.000Z");
    expect((await mock.list()).find((item) => item.id === "mistral")?.state.keys[0]?.limitedUntil).toBe(
      "2026-11-17T13:00:00.000Z",
    );
    expect((await mock.removeKey({ providerId: "mistral", keyId: second })).state.keys).toHaveLength(1);
    expect((await mock.clearKey({ providerId: "mistral" })).state.keySaved).toBe(false);
  });

  it("refuses a pool for Codex and Claude and a key for a provider that takes none", async () => {
    const { mock } = setup();
    await expect(mock.addKey({ providerId: "codex", key: "a-valid-looking-key" })).rejects.toThrow("Codex and Claude");
    await expect(mock.setKey({ providerId: "kimi", key: "a-valid-looking-key" })).rejects.toThrow("does not take");
    await expect(mock.removeKey({ providerId: "grok", keyId: "gone" })).rejects.toThrow("no longer exists");
  });
});
