// @vitest-environment node
import { type AgentEvent, isAgentEvent, isProviderCatalogItems } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { ProviderCatalogService } from "./provider-catalog";

function setup(options: { found?: string[]; added?: string[] } = {}) {
  const saved = new Map<string, string>();
  const events: AgentEvent[] = [];
  const added = options.added ?? [];
  const service = new ProviderCatalogService({
    keys: {
      mask: (id) => (saved.has(id) ? `••••${(saved.get(id) ?? "").slice(-4)}` : null),
      save: (id, key) => void saved.set(id, key),
      remove: (id) => void saved.delete(id),
      plain: (id) => saved.get(id) ?? null,
    },
    detect: (command) => (options.found?.includes(command) ? `C:/tools/${command}.cmd` : null),
    addedAgents: () => added,
    emit: (event) => events.push(event),
  });
  return { service, saved, events, added };
}

describe("ProviderCatalogService (W12 BE-E)", () => {
  it("lists the 18 providers with what this computer has: the program found, a key saved, the agent added", async () => {
    const { service } = setup({ found: ["opencode", "agy"], added: ["antigravity"] });
    const items = service.list();
    expect(isProviderCatalogItems(items)).toBe(true);
    const byId = Object.fromEntries(items.map((item) => [item.id, item.state]));
    expect(byId.opencode?.commandDetected).toBe("C:/tools/opencode.cmd");
    expect(byId.antigravity).toMatchObject({ commandDetected: "C:/tools/agy.cmd", added: true });
    expect(byId.kimi).toMatchObject({ commandDetected: null, added: false, keySaved: false });
    expect(byId.codex?.commandDetected).toBeNull();
  });

  it("saves a key through the store, returns only the mask and sends one event with the whole list", async () => {
    const { service, saved, events } = setup();
    const item = service.setKey({ providerId: "grok", key: "xai-1234567890abcd" });
    expect(saved.get("grok")).toBe("xai-1234567890abcd");
    expect(item.state).toMatchObject({ keySaved: true, keyMask: "••••abcd" });
    expect(JSON.stringify(item)).not.toContain("xai-1234567890abcd");
    expect(events).toHaveLength(1);
    expect(isAgentEvent(events[0])).toBe(true);
    expect(JSON.stringify(events[0])).not.toContain("xai-1234567890abcd");
  });

  it("refuses a key for a provider that takes none, and a bad key, before anything is saved", async () => {
    const { service, saved, events } = setup();
    expect(() => service.setKey({ providerId: "kimi", key: "a-valid-looking-key" })).toThrow("does not take");
    expect(() => service.setKey({ providerId: "grok", key: "short" })).toThrow();
    expect(() => service.setKey({ providerId: "nope", key: "a-valid-looking-key" })).toThrow();
    expect(saved.size).toBe(0);
    expect(events).toEqual([]);
  });

  it("removes a key and says so once", async () => {
    const { service, events } = setup();
    service.setKey({ providerId: "mistral", key: "mistral-key-12345" });
    events.length = 0;
    expect(service.clearKey({ providerId: "mistral" }).state.keySaved).toBe(false);
    expect(events).toHaveLength(1);
    events.length = 0;
    service.clearKey({ providerId: "mistral" });
    expect(events).toEqual([]);
  });

  it("gives an ACP agent of a preset only its own key, under the variable of the provider", async () => {
    const { service } = setup();
    service.setKey({ providerId: "mistral", key: "mistral-key-12345" });
    service.setKey({ providerId: "cline", key: "cline-key-123456" });
    expect(service.agentEnv("mistral")).toEqual({ MISTRAL_API_KEY: "mistral-key-12345" });
    expect(service.agentEnv("cline")).toEqual({ CLINE_API_KEY: "cline-key-123456" });
    expect(service.agentEnv("kimi")).toEqual({});
    expect(service.agentEnv("some-other-agent")).toEqual({});
  });
});
