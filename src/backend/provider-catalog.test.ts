// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, isAgentEvent, isProviderCatalogItems } from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderCatalogService } from "./provider-catalog";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(options: { found?: string[]; added?: string[] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "provider-catalog-"));
  roots.push(root);
  const poolFile = join(root, "provider-key-pool.json");
  const saved = new Map<string, string>();
  const events: AgentEvent[] = [];
  const added = options.added ?? [];
  let now = new Date("2026-11-17T12:00:00.000Z");
  const slotKey = (id: string, slotId: string) => `${id}/${slotId}`;
  const make = () =>
    new ProviderCatalogService({
      poolFile,
      keys: {
        mask: (id, slotId) => {
          const key = saved.get(slotKey(id, slotId));
          return key ? `••••${key.slice(-4)}` : null;
        },
        save: (id, slotId, key) => void saved.set(slotKey(id, slotId), key),
        remove: (id, slotId) => void saved.delete(slotKey(id, slotId)),
        plain: (id, slotId) => saved.get(slotKey(id, slotId)) ?? null,
      },
      detect: (command) => (options.found?.includes(command) ? `C:/tools/${command}.cmd` : null),
      addedAgents: () => added,
      emit: (event) => events.push(event),
      now: () => now,
    });
  return {
    service: make(),
    make,
    saved,
    events,
    added,
    setNow: (at: string) => {
      now = new Date(at);
    },
  };
}

describe("ProviderCatalogService (W12 BE-E)", () => {
  it("lists the 18 providers with what this computer has: the program found, a key saved, the agent added", async () => {
    const { service } = await setup({ found: ["opencode", "agy"], added: ["antigravity"] });
    const items = service.list();
    expect(isProviderCatalogItems(items)).toBe(true);
    const byId = Object.fromEntries(items.map((item) => [item.id, item.state]));
    expect(byId.opencode?.commandDetected).toBe("C:/tools/opencode.cmd");
    expect(byId.antigravity).toMatchObject({ commandDetected: "C:/tools/agy.cmd", added: true });
    expect(byId.kimi).toMatchObject({ commandDetected: null, added: false, keySaved: false, keys: [] });
    expect(byId.codex?.commandDetected).toBeNull();
  });

  it("saves a key through the store, returns only the mask and sends one event with the whole list", async () => {
    const { service, saved, events } = await setup();
    const item = service.setKey({ providerId: "grok", key: "xai-1234567890abcd" });
    expect(saved.get("grok/default")).toBe("xai-1234567890abcd");
    expect(item.state).toMatchObject({ keySaved: true, keyMask: "••••abcd" });
    expect(item.state.keys).toEqual([
      { id: "default", label: "Key", mask: "••••abcd", enabled: true, limitedUntil: null },
    ]);
    expect(JSON.stringify(item)).not.toContain("xai-1234567890abcd");
    expect(events).toHaveLength(1);
    expect(isAgentEvent(events[0])).toBe(true);
    expect(JSON.stringify(events[0])).not.toContain("xai-1234567890abcd");
  });

  it("refuses a key for a provider that takes none, and a bad key, before anything is saved", async () => {
    const { service, saved, events } = await setup();
    expect(() => service.setKey({ providerId: "kimi", key: "a-valid-looking-key" })).toThrow("does not take");
    expect(() => service.setKey({ providerId: "grok", key: "short" })).toThrow();
    expect(() => service.setKey({ providerId: "nope", key: "a-valid-looking-key" })).toThrow();
    expect(saved.size).toBe(0);
    expect(events).toEqual([]);
  });

  it("removes every key of a provider and says so once", async () => {
    const { service, events } = await setup();
    service.setKey({ providerId: "mistral", key: "mistral-key-12345" });
    service.addKey({ providerId: "mistral", key: "mistral-key-67890" });
    events.length = 0;
    expect(service.clearKey({ providerId: "mistral" }).state).toMatchObject({ keySaved: false, keys: [] });
    expect(events).toHaveLength(1);
    events.length = 0;
    service.clearKey({ providerId: "mistral" });
    expect(events).toEqual([]);
  });

  it("makes a pool of keys: add with a name, switch one off, remove one, keep the order", async () => {
    const { service, saved } = await setup();
    service.setKey({ providerId: "mistral", key: "mistral-key-aaaa" });
    const two = service.addKey({ providerId: "mistral", key: "mistral-key-bbbb", label: "Work" });
    const three = service.addKey({ providerId: "mistral", key: "mistral-key-cccc" });
    expect(two.state.keys.map((key) => [key.label, key.mask])).toEqual([
      ["Key", "••••aaaa"],
      ["Work", "••••bbbb"],
    ]);
    expect(three.state.keys.map((key) => key.label)).toEqual(["Key", "Work", "Key 3"]);
    const workId = three.state.keys[1]?.id ?? "";
    expect(service.setKeyEnabled({ providerId: "mistral", keyId: workId, enabled: false }).state.keys[1]?.enabled).toBe(
      false,
    );
    const after = service.removeKey({ providerId: "mistral", keyId: workId });
    expect(after.state.keys.map((key) => key.label)).toEqual(["Key", "Key 3"]);
    expect(saved.has(`mistral/${workId}`)).toBe(false);
    expect(() => service.removeKey({ providerId: "mistral", keyId: "gone" })).toThrow("no longer exists");
    expect(() => service.addKey({ providerId: "codex", key: "a-valid-looking-key" })).toThrow("Codex and Claude");
  });

  it("allows at most ten keys per provider", async () => {
    const { service } = await setup();
    for (let index = 0; index < 10; index += 1)
      service.addKey({ providerId: "cline", key: `cline-key-${index}-abcdef` });
    expect(() => service.addKey({ providerId: "cline", key: "cline-key-extra-abcdef" })).toThrow("At most 10");
  });

  it("keeps the pool over a restart and shows a key saved before the pool existed as the first key", async () => {
    const { service, make, saved } = await setup();
    saved.set("grok/default", "xai-legacy-0000");
    service.addKey({ providerId: "grok", key: "xai-second-1111", label: "Second" });
    const again = make()
      .list()
      .find((item) => item.id === "grok");
    expect(again?.state.keys.map((key) => [key.id === "default", key.label, key.mask])).toEqual([
      [true, "Key", "••••0000"],
      [false, "Second", "••••1111"],
    ]);
  });

  it("gives an ACP agent of a preset only its own provider's key, under the variable of that provider", async () => {
    const { service } = await setup();
    service.setKey({ providerId: "mistral", key: "mistral-key-12345" });
    service.setKey({ providerId: "cline", key: "cline-key-123456" });
    expect(service.agentEnv("mistral")).toEqual({ MISTRAL_API_KEY: "mistral-key-12345" });
    expect(service.agentEnv("cline")).toEqual({ CLINE_API_KEY: "cline-key-123456" });
    expect(service.agentEnv("kimi")).toEqual({});
    expect(service.agentEnv("some-other-agent")).toEqual({});
  });

  it("takes the next key on each start, skips a key that is off or limited, and returns to it when the limit ends", async () => {
    const { service, setNow } = await setup();
    service.setKey({ providerId: "mistral", key: "key-a-000000" });
    service.addKey({ providerId: "mistral", key: "key-b-000000" });
    service.addKey({ providerId: "mistral", key: "key-c-000000" });
    const used = () => service.agentEnv("mistral").MISTRAL_API_KEY;
    expect([used(), used(), used(), used()]).toEqual(["key-a-000000", "key-b-000000", "key-c-000000", "key-a-000000"]);
    const keys = service.list().find((item) => item.id === "mistral")?.state.keys ?? [];
    service.setKeyEnabled({ providerId: "mistral", keyId: keys[1]?.id ?? "", enabled: false });
    const seen = new Set([used(), used(), used(), used()]);
    expect([...seen].sort()).toEqual(["key-a-000000", "key-c-000000"]);
    // the provider said the limit of the key it just got is used up until 13:00
    const got = used();
    service.noteAgentLimited("mistral", new Date("2026-11-17T13:00:00.000Z"));
    expect(
      service
        .list()
        .find((item) => item.id === "mistral")
        ?.state.keys.filter((key) => key.limitedUntil),
    ).toHaveLength(1);
    const duringLimit = new Set([used(), used(), used()]);
    expect(duringLimit.size).toBe(1);
    expect(duringLimit.has(got)).toBe(false);
    setNow("2026-11-17T13:30:00.000Z");
    expect(
      service
        .list()
        .find((item) => item.id === "mistral")
        ?.state.keys.every((key) => key.limitedUntil === null),
    ).toBe(true);
    expect(new Set([used(), used(), used(), used()]).size).toBe(2);
  });

  it("gives nothing when every key is off or limited, so the agent falls back to its own sign-in", async () => {
    const { service } = await setup();
    service.setKey({ providerId: "opencode", key: "opencode-key-1234" });
    expect(service.agentEnv("opencode")).toEqual({ OPENCODE_API_KEY: "opencode-key-1234" });
    service.setKeyEnabled({ providerId: "opencode", keyId: "default", enabled: false });
    expect(service.agentEnv("opencode")).toEqual({});
  });

  it("ignores a limit of an agent that never got a key", async () => {
    const { service, events } = await setup();
    service.noteAgentLimited("mistral", null);
    service.noteAgentLimited("not-a-preset", null);
    expect(events).toEqual([]);
  });
});
