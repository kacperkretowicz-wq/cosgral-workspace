// COSGRAL W12 (BE-E): the provider catalog for Storybook and the preview. Demo data only; nothing is contacted. The same rules as the
// program: the key is checked by the contract, only a mask comes back, a provider without a key is refused, one event carries the
// whole list. `simulate` plays a program that is found on the computer and an agent that was added.

import {
  type AgentEvent,
  type CatalogProviderId,
  catalogEntry,
  maskProviderKey,
  PROVIDER_CATALOG,
  type ProviderCatalogDesktopApi,
  type ProviderCatalogItem,
  type ProviderCatalogState,
  parseProviderCatalogKeyInput,
  parseSetProviderCatalogKeyInput,
} from "@openbot/contracts/ipc";

export interface MockProviderCatalog extends Required<ProviderCatalogDesktopApi> {
  simulate: {
    detect: (id: CatalogProviderId, path: string | null) => void;
    added: (id: CatalogProviderId, added: boolean) => void;
  };
}

export function createMockProviderCatalog(emit: (event: AgentEvent) => void): MockProviderCatalog {
  const states = new Map<CatalogProviderId, ProviderCatalogState>();
  const stateOf = (id: CatalogProviderId): ProviderCatalogState =>
    states.get(id) ?? { commandDetected: null, keySaved: false, keyMask: null, added: false };
  const item = (id: CatalogProviderId): ProviderCatalogItem => ({
    ...catalogEntry(id),
    state: structuredClone(stateOf(id)),
  });
  const items = (): ProviderCatalogItem[] => PROVIDER_CATALOG.map((entry) => item(entry.id));
  const change = (id: CatalogProviderId, next: Partial<ProviderCatalogState>): ProviderCatalogItem => {
    states.set(id, { ...stateOf(id), ...next });
    emit({ type: "provider-catalog-changed", items: items() });
    return item(id);
  };
  return {
    list: async () => items(),
    setKey: async (raw) => {
      const input = parseSetProviderCatalogKeyInput(raw);
      return change(input.providerId, { keySaved: true, keyMask: maskProviderKey(input.key) });
    },
    clearKey: async (raw) => {
      const { providerId } = parseProviderCatalogKeyInput(raw);
      return change(providerId, { keySaved: false, keyMask: null });
    },
    simulate: {
      detect: (id, path) => void change(id, { commandDetected: path }),
      added: (id, added) => void change(id, { added }),
    },
  };
}
