// COSGRAL W12 (BE-E): the provider catalog on this computer (contract: ipc-provider-catalog.ts). The table of the 18 providers is fixed in
// the contract; this service adds what only this computer knows: the program of a provider found in PATH, a key saved (encrypted by
// the key store, only a mask comes out), the ACP agent already added. It never installs, starts or contacts anything.
//   * `setKey` / `clearKey`: the key store is a port (Codex and Claude keep theirs where they always did, the others in a slot).
//   * `agentEnv(agentId)`: the environment variable of ONE ACP agent that was added from a preset (the key of its own provider, under
//     the variable the provider reads), merged into the spawn of that agent only.

import {
  type AgentEvent,
  type CatalogProviderId,
  catalogEntry,
  PROVIDER_CATALOG,
  type ProviderCatalogItem,
  type ProviderCatalogKeyInput,
  parseProviderCatalogKeyInput,
  parseSetProviderCatalogKeyInput,
} from "@openbot/contracts/ipc";

export interface ProviderKeyPort {
  /** "••••1234" or null. */
  mask: (id: CatalogProviderId) => string | null;
  save: (id: CatalogProviderId, key: string) => void;
  remove: (id: CatalogProviderId) => void;
  /** The key in clear text, only for the spawn of the one process it belongs to. */
  plain: (id: CatalogProviderId) => string | null;
}

export interface ProviderCatalogOptions {
  keys: ProviderKeyPort;
  /** The absolute path of a command found in PATH, or null. */
  detect: (command: string) => string | null;
  /** The ids of the ACP agents that are in Providers now. */
  addedAgents: () => string[];
  emit: (event: AgentEvent) => void;
}

export class ProviderCatalogService {
  readonly #options: ProviderCatalogOptions;

  constructor(options: ProviderCatalogOptions) {
    this.#options = options;
  }

  list(): ProviderCatalogItem[] {
    const added = new Set(this.#options.addedAgents());
    return PROVIDER_CATALOG.map((entry) => {
      const mask = entry.key ? this.#options.keys.mask(entry.id) : null;
      return {
        ...entry,
        state: {
          commandDetected: entry.launch ? this.#options.detect(entry.launch.command) : null,
          keySaved: mask !== null,
          keyMask: mask,
          added: entry.launch ? added.has(entry.launch.presetId) : false,
        },
      };
    });
  }

  setKey(raw: unknown): ProviderCatalogItem {
    const input = parseSetProviderCatalogKeyInput(raw);
    this.#options.keys.save(input.providerId, input.key);
    return this.#changed(input.providerId);
  }

  clearKey(raw: unknown): ProviderCatalogItem {
    const { providerId }: ProviderCatalogKeyInput = parseProviderCatalogKeyInput(raw);
    if (this.#options.keys.mask(providerId) === null) return this.#item(providerId);
    this.#options.keys.remove(providerId);
    return this.#changed(providerId);
  }

  /** The key of the provider that this ACP agent came from; `{}` for any other agent or a provider without a key or variable. */
  agentEnv(agentId: string): NodeJS.ProcessEnv {
    const entry = PROVIDER_CATALOG.find((candidate) => candidate.launch?.presetId === agentId);
    const env = entry?.key?.env;
    if (!entry || !env) return {};
    const key = this.#options.keys.plain(entry.id);
    return key ? { [env]: key } : {};
  }

  /** The agents of Providers changed (one was added or removed): the list goes out again. */
  agentsChanged(): void {
    this.#options.emit({ type: "provider-catalog-changed", items: this.list() });
  }

  #item(id: CatalogProviderId): ProviderCatalogItem {
    catalogEntry(id);
    const found = this.list().find((item) => item.id === id);
    if (!found) throw new Error("This provider is not in the catalog.");
    return found;
  }

  #changed(id: CatalogProviderId): ProviderCatalogItem {
    this.agentsChanged();
    return this.#item(id);
  }
}
