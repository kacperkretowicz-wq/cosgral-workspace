// COSGRAL W12 (BE-E, BE-I): the provider catalog on this computer (contract: ipc-provider-catalog.ts). The table of the 18 providers is
// fixed in the contract; this service adds what only this computer knows: the program of a provider found in PATH, the keys saved
// (encrypted by the key store, only a mask comes out), the ACP agent already added. It never installs, starts or contacts anything.
//   * Keys: one provider can have a small POOL of keys (the owner's own keys only). Codex and Claude keep one key in their own place
//     (their pool is the accounts of Providers, W5). Each key is a slot; the secret is in the key store, and the order, the name, the
//     on/off switch and "limited until" are in a small file with no secret in it.
//   * `agentEnv(agentId)`: the variable of ONE ACP agent that was added from a preset: the next key that is on and not limited (the
//     keys take turns on each start), merged into the spawn of that agent only. With no usable key it gives nothing, and the agent
//     falls back to its own sign-in.
//   * `noteAgentLimited(agentId, until)`: the provider said the limit of the key that agent got is used up; that key is skipped until
//     then (default one hour).

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AgentEvent,
  CATALOG_PROVIDER_IDS,
  type CatalogProviderId,
  catalogEntry,
  PROVIDER_CATALOG,
  PROVIDER_KEY_POOL_LIMITS,
  type ProviderCatalogItem,
  type ProviderKeySlot,
  parseAddProviderCatalogKeyInput,
  parseProviderCatalogKeyInput,
  parseProviderCatalogKeySlotInput,
  parseSetProviderCatalogKeyEnabledInput,
  parseSetProviderCatalogKeyInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isOneOf, isString } from "@openbot/contracts/runtime-values";

export interface ProviderKeyPort {
  /** "••••1234" of the key in this slot, or null when there is none. */
  mask: (id: CatalogProviderId, slotId: string) => string | null;
  save: (id: CatalogProviderId, slotId: string, key: string) => void;
  remove: (id: CatalogProviderId, slotId: string) => void;
  /** The key in clear text, only for the spawn of the one process it belongs to. */
  plain: (id: CatalogProviderId, slotId: string) => string | null;
}

export interface ProviderCatalogOptions {
  keys: ProviderKeyPort;
  /** Where the order, names, switches and limits of the keys are kept (no secret); left out = not kept over a restart. */
  poolFile?: string;
  /** The absolute path of a command found in PATH, or null. */
  detect: (command: string) => string | null;
  /** The ids of the ACP agents that are in Providers now. */
  addedAgents: () => string[];
  emit: (event: AgentEvent) => void;
  now?: () => Date;
}

interface SlotMeta {
  id: string;
  label: string;
  enabled: boolean;
  limitedUntil: string | null;
}

const DEFAULT_SLOT = "default";
const DEFAULT_LIMIT_MS = 3_600_000;

export class ProviderCatalogService {
  readonly #options: ProviderCatalogOptions;
  #meta: Partial<Record<CatalogProviderId, SlotMeta[]>>;
  /** Which key each ACP agent got last (to mark it limited), and which turn is next per provider. */
  readonly #lastKey = new Map<string, { providerId: CatalogProviderId; keyId: string }>();
  readonly #turn = new Map<CatalogProviderId, number>();

  constructor(options: ProviderCatalogOptions) {
    this.#options = options;
    this.#meta = options.poolFile ? readPool(options.poolFile) : {};
  }

  list(): ProviderCatalogItem[] {
    const added = new Set(this.#options.addedAgents());
    return PROVIDER_CATALOG.map((entry) => {
      const keys = entry.key ? this.#slots(entry.id) : [];
      return {
        ...entry,
        state: {
          commandDetected: entry.launch ? this.#options.detect(entry.launch.command) : null,
          keySaved: keys.length > 0,
          keyMask: keys[0]?.mask ?? null,
          keys,
          added: entry.launch ? added.has(entry.launch.presetId) : false,
        },
      };
    });
  }

  /** Saves the "default" key of the provider (it replaces the old one; the other keys of the pool stay). */
  setKey(raw: unknown): ProviderCatalogItem {
    const input = parseSetProviderCatalogKeyInput(raw);
    this.#options.keys.save(input.providerId, DEFAULT_SLOT, input.key);
    const meta = this.#metaOf(input.providerId).filter((slot) => slot.id !== DEFAULT_SLOT);
    this.#meta[input.providerId] = [{ id: DEFAULT_SLOT, label: "Key", enabled: true, limitedUntil: null }, ...meta];
    this.#save();
    return this.#changed(input.providerId);
  }

  addKey(raw: unknown): ProviderCatalogItem {
    const input = parseAddProviderCatalogKeyInput(raw);
    const slots = this.#slots(input.providerId);
    if (slots.length >= PROVIDER_KEY_POOL_LIMITS.maxKeys) {
      throw new Error(`At most ${PROVIDER_KEY_POOL_LIMITS.maxKeys} keys for one provider.`);
    }
    const id = `key-${randomBytes(4).toString("hex")}`;
    this.#options.keys.save(input.providerId, id, input.key);
    this.#meta[input.providerId] = [
      ...this.#metaOf(input.providerId),
      { id, label: input.label ?? `Key ${slots.length + 1}`, enabled: true, limitedUntil: null },
    ];
    this.#save();
    return this.#changed(input.providerId);
  }

  removeKey(raw: unknown): ProviderCatalogItem {
    const input = parseProviderCatalogKeySlotInput(raw);
    this.#existing(input.providerId, input.keyId);
    this.#options.keys.remove(input.providerId, input.keyId);
    this.#meta[input.providerId] = this.#metaOf(input.providerId).filter((slot) => slot.id !== input.keyId);
    this.#save();
    return this.#changed(input.providerId);
  }

  setKeyEnabled(raw: unknown): ProviderCatalogItem {
    const input = parseSetProviderCatalogKeyEnabledInput(raw);
    this.#existing(input.providerId, input.keyId);
    this.#meta[input.providerId] = this.#metaOf(input.providerId).map((slot) =>
      slot.id === input.keyId ? { ...slot, enabled: input.enabled } : slot,
    );
    this.#save();
    return this.#changed(input.providerId);
  }

  /** Removes every key of the provider; says nothing when there was none. */
  clearKey(raw: unknown): ProviderCatalogItem {
    const { providerId } = parseProviderCatalogKeyInput(raw);
    const slots = this.#slots(providerId);
    if (slots.length === 0) return this.#item(providerId);
    for (const slot of slots) this.#options.keys.remove(providerId, slot.id);
    delete this.#meta[providerId];
    this.#save();
    return this.#changed(providerId);
  }

  /**
   * The variable of the key this ACP agent should start with: the next key that is on and not limited, the keys taking turns.
   * `{}` for any other agent, a provider without a key or variable, or when no key can be used now.
   */
  agentEnv(agentId: string): NodeJS.ProcessEnv {
    const entry = PROVIDER_CATALOG.find((candidate) => candidate.launch?.presetId === agentId);
    const env = entry?.key?.env;
    if (!entry || !env) return {};
    const usable = this.#slots(entry.id).filter((slot) => slot.enabled && slot.limitedUntil === null);
    if (usable.length === 0) return {};
    const turn = this.#turn.get(entry.id) ?? 0;
    const slot = usable[turn % usable.length];
    this.#turn.set(entry.id, turn + 1);
    const key = slot ? this.#options.keys.plain(entry.id, slot.id) : null;
    if (!slot || !key) return {};
    this.#lastKey.set(agentId, { providerId: entry.id, keyId: slot.id });
    return { [env]: key };
  }

  /** The provider said the limit of the key this agent started with is used up (until `until`, default in an hour). */
  noteAgentLimited(agentId: string, until: Date | null): void {
    const last = this.#lastKey.get(agentId);
    if (!last) return;
    const limit = (until ?? new Date(this.#now().getTime() + DEFAULT_LIMIT_MS)).toISOString();
    const before = this.#metaOf(last.providerId);
    if (before.some((slot) => slot.id === last.keyId && slot.limitedUntil === limit)) return;
    this.#meta[last.providerId] = before.map((slot) =>
      slot.id === last.keyId ? { ...slot, limitedUntil: limit } : slot,
    );
    this.#save();
    this.agentsChanged();
  }

  /** The agents of Providers changed (one was added or removed): the list goes out again. */
  agentsChanged(): void {
    this.#options.emit({ type: "provider-catalog-changed", items: this.list() });
  }

  #now(): Date {
    return this.#options.now?.() ?? new Date();
  }

  /** The metadata of a provider; a key saved before the pool existed (the "default" secret) shows up as the first key. */
  #metaOf(id: CatalogProviderId): SlotMeta[] {
    const meta = this.#meta[id] ?? [];
    if (meta.some((slot) => slot.id === DEFAULT_SLOT) || this.#options.keys.mask(id, DEFAULT_SLOT) === null)
      return meta;
    return [{ id: DEFAULT_SLOT, label: "Key", enabled: true, limitedUntil: null }, ...meta];
  }

  /** The keys that really exist (the secret is there), with a limit that is over shown as none. */
  #slots(id: CatalogProviderId): ProviderKeySlot[] {
    const now = this.#now().getTime();
    return this.#metaOf(id).flatMap((slot) => {
      const mask = this.#options.keys.mask(id, slot.id);
      if (mask === null) return [];
      const limited = slot.limitedUntil !== null && Date.parse(slot.limitedUntil) > now;
      return [
        {
          id: slot.id,
          label: slot.label,
          mask,
          enabled: slot.enabled,
          limitedUntil: limited ? slot.limitedUntil : null,
        },
      ];
    });
  }

  #existing(id: CatalogProviderId, keyId: string): void {
    if (!this.#slots(id).some((slot) => slot.id === keyId)) throw new Error("This key no longer exists.");
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

  #save(): void {
    const file = this.#options.poolFile;
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.#meta, null, 2));
    renameSync(temporary, file);
  }
}

/** Reads the pool file; a damaged file or an entry that is not valid is ignored (the secrets stay in the key store). */
function readPool(file: string): Partial<Record<CatalogProviderId, SlotMeta[]>> {
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
  if (!isDynamicRecord(parsed)) return {};
  const out: Partial<Record<CatalogProviderId, SlotMeta[]>> = {};
  for (const [id, list] of Object.entries(parsed)) {
    if (!isOneOf(CATALOG_PROVIDER_IDS, id) || !Array.isArray(list)) continue;
    out[id] = list.flatMap((slot) =>
      isDynamicRecord(slot) &&
      isString(slot.id) &&
      /^[a-z0-9-]{1,40}$/.test(slot.id) &&
      isString(slot.label) &&
      isBoolean(slot.enabled)
        ? [
            {
              id: slot.id,
              label: slot.label.slice(0, PROVIDER_KEY_POOL_LIMITS.label),
              enabled: slot.enabled,
              limitedUntil: isString(slot.limitedUntil) ? slot.limitedUntil : null,
            },
          ]
        : [],
    );
  }
  return out;
}
