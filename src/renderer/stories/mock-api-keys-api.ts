// COSGRAL W5-BE3: provider API keys for Storybook and the preview. Demo data only: nothing is saved or sent.
// Like the real program, the answer never carries the key: only a mask and a state. Rules for demo keys:
// a key that starts with "bad" is rejected by "Check connection"; any other key is accepted.

import type { ApiKeyEntry, ApiKeyProvider, ApiKeysDesktopApi } from "@openbot/contracts/ipc";

const EMPTY = (provider: ApiKeyProvider): ApiKeyEntry => ({
  provider,
  maskedKey: null,
  status: "unchecked",
  message: null,
  checkedAt: null,
  updatedAt: null,
});

export function createMockApiKeysApi(delayMs = 150): ApiKeysDesktopApi {
  const entries = new Map<ApiKeyProvider, ApiKeyEntry>([
    ["codex", EMPTY("codex")],
    ["claude", EMPTY("claude")],
  ]);
  // The demo keeps a flag, not the key itself.
  const rejected = new Set<ApiKeyProvider>();
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  const entry = (provider: ApiKeyProvider): ApiKeyEntry => ({ ...(entries.get(provider) ?? EMPTY(provider)) });
  return {
    list: async () => {
      await wait();
      return [entry("codex"), entry("claude")];
    },
    set: async ({ provider, key }) => {
      await wait();
      const clean = key.trim();
      if (clean.startsWith("bad")) rejected.add(provider);
      else rejected.delete(provider);
      entries.set(provider, {
        ...EMPTY(provider),
        maskedKey: clean.length >= 12 ? `••••${clean.slice(-4)}` : "••••",
        updatedAt: new Date().toISOString(),
      });
      return entry(provider);
    },
    remove: async ({ provider }) => {
      await wait();
      rejected.delete(provider);
      entries.set(provider, EMPTY(provider));
      return entry(provider);
    },
    check: async ({ provider }) => {
      await wait();
      const current = entries.get(provider);
      if (!current?.maskedKey) throw new Error("There is no API key to check.");
      const name = provider === "codex" ? "OpenAI" : "Anthropic";
      const bad = rejected.has(provider);
      entries.set(provider, {
        ...current,
        status: bad ? "rejected" : "ok",
        message: bad ? `${name} rejected this key. Check it or paste a new one.` : `${name} accepted this key.`,
        checkedAt: new Date().toISOString(),
      });
      return entry(provider);
    },
  };
}
