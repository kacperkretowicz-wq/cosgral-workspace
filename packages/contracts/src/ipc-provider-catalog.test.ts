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
  parseProviderCatalogKeyInput,
  parseSetProviderCatalogKeyInput,
} from "./ipc-provider-catalog";

const items = PROVIDER_CATALOG.map((entry) => ({
  ...entry,
  state: { commandDetected: null, keySaved: false, keyMask: null, added: false },
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
    expect(() => catalogEntry(JSON.parse("\"nope\""))).toThrow();
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
});
