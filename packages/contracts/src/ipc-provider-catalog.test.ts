import { describe, expect, it } from "vitest";
import { isAgentEvent } from "./ipc-conversation";
import {
  CATALOG_PROVIDER_IDS,
  catalogEntry,
  isProviderCatalogChanged,
  isProviderCatalogEntry,
  isProviderCatalogItems,
  maskProviderKey,
  PROVIDER_CATALOG,
  PROVIDER_KEY_POOL_LIMITS,
  parseAddProviderCatalogKeyInput,
  parseProviderCatalogKeyInput,
  parseProviderCatalogKeySlotInput,
  parseSetProviderCatalogKeyEnabledInput,
  parseSetProviderCatalogKeyInput,
} from "./ipc-provider-catalog";

const items = PROVIDER_CATALOG.map((entry) => ({
  ...entry,
  state: { commandDetected: null, keySaved: false, keyMask: null, keys: [], added: false },
}));

describe("provider catalog contract (W12 BE-E)", () => {
  it("has the 18 providers of 0.71 once each, in picker order", () => {
    expect(CATALOG_PROVIDER_IDS).toHaveLength(18);
    expect(PROVIDER_CATALOG.map((entry) => entry.id)).toEqual([...CATALOG_PROVIDER_IDS]);
    expect(PROVIDER_CATALOG.map((entry) => entry.pickerOrder)).toEqual(PROVIDER_CATALOG.map((_, index) => index));
    expect(PROVIDER_CATALOG.every(isProviderCatalogEntry)).toBe(true);
    expect(isProviderCatalogItems(items)).toBe(true);
    expect(isProviderCatalogItems(items.slice(1))).toBe(false);
  });

  it("marks every command that was not confirmed as unverified, and only the documented one as documented", () => {
    const launches = PROVIDER_CATALOG.flatMap((entry) => (entry.launch ? [[entry.id, entry.launch] as const] : []));
    const documented = launches.filter(([, launch]) => launch.verification === "documented").map(([id]) => id);
    expect(documented).toEqual(["antigravity"]);
    expect(launches.length).toBeGreaterThanOrEqual(6);
    for (const [, launch] of launches) expect(launch.command.length).toBeGreaterThan(0);
  });

  it("says plainly which providers COSGRAL runs itself and which need a runtime it does not have yet", () => {
    const bySupport = (level: string) =>
      PROVIDER_CATALOG.filter((entry) => entry.support === level).map((entry) => entry.id);
    expect(bySupport("built-in")).toEqual(["claude", "codex"]);
    expect(bySupport("custom")).toEqual(["acp"]);
    expect(bySupport("needs-runtime")).toEqual(
      expect.arrayContaining(["pi", "muse", "inception", "deepseek", "openrouter"]),
    );
    expect(PROVIDER_CATALOG.filter((entry) => entry.support === "acp-preset").every((entry) => entry.launch)).toBe(
      true,
    );
  });

  it("knows which providers take a key and the variable each reads it from", () => {
    expect(catalogEntry("claude").key).toEqual({ env: "ANTHROPIC_API_KEY" });
    expect(catalogEntry("codex").key).toEqual({ env: "OPENAI_API_KEY" });
    expect(catalogEntry("grok").key).toEqual({ env: "XAI_API_KEY" });
    expect(catalogEntry("deepseek").key).toEqual({ env: null });
    expect(catalogEntry("kimi").key).toBeNull();
    expect(() => catalogEntry(JSON.parse('"nope"'))).toThrow();
  });

  it("checks a key before it is kept", () => {
    expect(parseSetProviderCatalogKeyInput({ providerId: "grok", key: "  xai-123456789  " })).toEqual({
      providerId: "grok",
      key: "xai-123456789",
    });
    const bad: unknown[] = [
      null,
      {},
      { providerId: "grok" },
      { providerId: "grok", key: "short" },
      { providerId: "grok", key: "x".repeat(600) },
      { providerId: "kimi", key: "a-valid-looking-key" },
      { providerId: "unknown", key: "a-valid-looking-key" },
    ];
    for (const input of bad) expect(() => parseSetProviderCatalogKeyInput(input), JSON.stringify(input)).toThrow();
    expect(() => parseProviderCatalogKeyInput({ providerId: "codex" })).not.toThrow();
    expect(() => parseProviderCatalogKeyInput({ providerId: "x" })).toThrow();
  });

  it("masks a key and never shows a short one", () => {
    expect(maskProviderKey("xai-1234567890abcd")).toBe("••••abcd");
    expect(maskProviderKey("short-key")).toBe("••••");
  });

  it("knows the catalog event as an agent event", () => {
    const event = { type: "provider-catalog-changed", items };
    expect(isProviderCatalogChanged(event)).toBe(true);
    expect(isAgentEvent(event)).toBe(true);
    expect(isAgentEvent({ type: "provider-catalog-changed", items: [] })).toBe(false);
  });

  it("keeps a small pool of keys: add with a name, remove, switch off; Codex and Claude keep one", () => {
    expect(
      parseAddProviderCatalogKeyInput({ providerId: "mistral", key: "mistral-key-12345", label: " Work " }),
    ).toEqual({
      providerId: "mistral",
      key: "mistral-key-12345",
      label: "Work",
    });
    expect(parseAddProviderCatalogKeyInput({ providerId: "mistral", key: "mistral-key-12345" }).label).toBeUndefined();
    const bad: unknown[] = [
      { providerId: "codex", key: "a-valid-looking-key" },
      { providerId: "claude", key: "a-valid-looking-key" },
      { providerId: "kimi", key: "a-valid-looking-key" },
      { providerId: "mistral", key: "a-valid-looking-key", label: "  " },
      { providerId: "mistral", key: "a-valid-looking-key", label: "x".repeat(PROVIDER_KEY_POOL_LIMITS.label + 1) },
    ];
    for (const input of bad) expect(() => parseAddProviderCatalogKeyInput(input), JSON.stringify(input)).toThrow();
    expect(parseProviderCatalogKeySlotInput({ providerId: "grok", keyId: "key-2" })).toEqual({
      providerId: "grok",
      keyId: "key-2",
    });
    for (const input of [
      { providerId: "grok" },
      { providerId: "grok", keyId: "Bad Id" },
      { providerId: "grok", keyId: "" },
    ]) {
      expect(() => parseProviderCatalogKeySlotInput(input), JSON.stringify(input)).toThrow();
    }
    expect(
      parseSetProviderCatalogKeyEnabledInput({ providerId: "grok", keyId: "default", enabled: false }).enabled,
    ).toBe(false);
    expect(() =>
      parseSetProviderCatalogKeyEnabledInput({ providerId: "grok", keyId: "default", enabled: "no" }),
    ).toThrow();
  });

  it("accepts a state with keys and refuses a broken or too long pool", () => {
    const slot = { id: "default", label: "Key", mask: "••••1234", enabled: true, limitedUntil: null };
    const withKeys = items.map((item) => ({ ...item, state: { ...item.state, keys: [slot] } }));
    expect(isProviderCatalogItems(withKeys)).toBe(true);
    const broken = items.map((item) => ({ ...item, state: { ...item.state, keys: [{ ...slot, enabled: "yes" }] } }));
    expect(isProviderCatalogItems(broken)).toBe(false);
    const tooMany = items.map((item) => ({
      ...item,
      state: { ...item.state, keys: Array.from({ length: PROVIDER_KEY_POOL_LIMITS.maxKeys + 1 }, () => slot) },
    }));
    expect(isProviderCatalogItems(tooMany)).toBe(false);
  });
});
