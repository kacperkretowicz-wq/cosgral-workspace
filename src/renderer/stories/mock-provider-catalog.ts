// COSGRAL W12 (BE-E, BE-I): the provider catalog for Storybook and the preview. Demo data only; nothing is contacted. The same rules as
// the program: the key is checked by the contract, only a mask comes back, a provider without a key is refused, Codex and Claude keep
// one key, the others keep a small pool (add, remove, switch off), one event carries the whole list. `simulate` plays a program that is
// found on the computer, an agent that was added and a key whose limit is used up.

import {
  type AgentEvent,
  type CatalogProviderId,
  catalogEntry,
  maskProviderKey,
  PROVIDER_CATALOG,
  PROVIDER_KEY_POOL_LIMITS,
  type ProviderCatalogDesktopApi,
  type ProviderCatalogItem,
  type ProviderKeySlot,
  parseAddProviderCatalogKeyInput,
  parseProviderCatalogKeyInput,
  parseProviderCatalogKeySlotInput,
  parseSetProviderCatalogKeyEnabledInput,
  parseSetProviderCatalogKeyInput,
} from "@openbot/contracts/ipc";

export interface MockProviderCatalog extends Required<ProviderCatalogDesktopApi> {
  simulate: {
    detect: (id: CatalogProviderId, path: string | null) => void;
    added: (id: CatalogProviderId, added: boolean) => void;
    limitKey: (id: CatalogProviderId, keyId: string, until: string | null) => void;
  };
}

interface Local {
  commandDetected: string | null;
  added: boolean;
  keys: ProviderKeySlot[];
}

export function createMockProviderCatalog(emit: (event: AgentEvent) => void): MockProviderCatalog {
  const states = new Map<CatalogProviderId, Local>();
  let counter = 0;
  const stateOf = (id: CatalogProviderId): Local => states.get(id) ?? { commandDetected: null, added: false, keys: [] };
  const item = (id: CatalogProviderId): ProviderCatalogItem => {
    const local = stateOf(id);
    return {
      ...catalogEntry(id),
      state: {
        commandDetected: local.commandDetected,
        added: local.added,
        keySaved: local.keys.length > 0,
        keyMask: local.keys[0]?.mask ?? null,
        keys: structuredClone(local.keys),
      },
    };
  };
  const items = (): ProviderCatalogItem[] => PROVIDER_CATALOG.map((entry) => item(entry.id));
  const change = (id: CatalogProviderId, next: Partial<Local>): ProviderCatalogItem => {
    states.set(id, { ...stateOf(id), ...next });
    emit({ type: "provider-catalog-changed", items: items() });
    return item(id);
  };
  const slot = (id: CatalogProviderId, keyId: string): ProviderKeySlot => {
    const found = stateOf(id).keys.find((candidate) => candidate.id === keyId);
    if (!found) throw new Error("This key no longer exists.");
    return found;
  };
  return {
    list: async () => items(),
    setKey: async (raw) => {
      const input = parseSetProviderCatalogKeyInput(raw);
      const others = stateOf(input.providerId).keys.filter((key) => key.id !== "default");
      const first: ProviderKeySlot = {
        id: "default",
        label: "Key",
        mask: maskProviderKey(input.key),
        enabled: true,
        limitedUntil: null,
      };
      return change(input.providerId, { keys: [first, ...others] });
    },
    clearKey: async (raw) => {
      const { providerId } = parseProviderCatalogKeyInput(raw);
      return change(providerId, { keys: [] });
    },
    addKey: async (raw) => {
      const input = parseAddProviderCatalogKeyInput(raw);
      const keys = stateOf(input.providerId).keys;
      if (keys.length >= PROVIDER_KEY_POOL_LIMITS.maxKeys) {
        throw new Error(`At most ${PROVIDER_KEY_POOL_LIMITS.maxKeys} keys for one provider.`);
      }
      counter += 1;
      const added: ProviderKeySlot = {
        id: `key-${counter}`,
        label: input.label ?? `Key ${keys.length + 1}`,
        mask: maskProviderKey(input.key),
        enabled: true,
        limitedUntil: null,
      };
      return change(input.providerId, { keys: [...keys, added] });
    },
    removeKey: async (raw) => {
      const input = parseProviderCatalogKeySlotInput(raw);
      slot(input.providerId, input.keyId);
      return change(input.providerId, { keys: stateOf(input.providerId).keys.filter((key) => key.id !== input.keyId) });
    },
    setKeyEnabled: async (raw) => {
      const input = parseSetProviderCatalogKeyEnabledInput(raw);
      slot(input.providerId, input.keyId);
      return change(input.providerId, {
        keys: stateOf(input.providerId).keys.map((key) =>
          key.id === input.keyId ? { ...key, enabled: input.enabled } : key,
        ),
      });
    },
    simulate: {
      detect: (id, path) => void change(id, { commandDetected: path }),
      added: (id, added) => void change(id, { added }),
      limitKey: (id, keyId, until) =>
        void change(id, {
          keys: stateOf(id).keys.map((key) => (key.id === keyId ? { ...key, limitedUntil: until } : key)),
        }),
    },
  };
}
