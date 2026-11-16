// COSGRAL W8-KK3: the browser profiles of the agents (spec-w8.md 1C; contract: ipc-browser-profiles.ts). No Electron here,
// so the rules are tested without a screen; the Electron session itself is configured by the browser host.
//
// WHAT A PROFILE IS. One per agent: its own Electron session partition, `persist:cosgral-<space>-<hash of the agent id>`.
// Electron keeps a persistent partition's cookies, storage, cache and history under the program's data folder
// (`<userData>\Partitions\...`), and that folder is already the space's own (ipc-spaces.ts), so a client space has its own
// jars and nothing crosses between clients; the space id in the name is a second wall. The name is a hash, not the agent
// id, so it is always a safe folder name and tells nothing.
//
// WHAT IT DOES NOT DO. The tabs a person opens (no agent behind them) use the program's shared profile as before, and the
// profiles are not filled from it: an agent starts signed out, and a sign-in the person does in an agent's tab (the
// takeover) belongs to that agent's profile only. The store keeps only what is NOT inside the partition: the list of
// profiles, their domain lists and when they were cleared. It never reads a cookie, a password or a login file.
//
//   <userData>\browser-profiles.json    { version, profiles: [{ botId, createdAt, clearedAt, domains }] }

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AgentEvent,
  BROWSER_PROFILE_PARTS,
  type BrowserProfile,
  type BrowserProfileDescription,
  type BrowserProfileList,
  type DomainPolicy,
  type DomainRequestKind,
  domainDecision,
  emptyDomainPolicy,
  isBrowserProfile,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";

/** The Electron partition of an agent's profile in a space: `persist:` (kept on disk), no characters that are not safe. */
export function profilePartition(spaceId: string, botId: string): string {
  const hash = createHash("sha256").update(`${spaceId}\u0000${botId}`).digest("hex").slice(0, 24);
  return `persist:cosgral-${spaceId.replace(/[^a-z0-9-]/g, "-")}-${hash}`;
}

export interface BrowserProfileStoreOptions {
  /** `<userData>\browser-profiles.json` of the space the program runs on. */
  filePath: string;
  /** The space the program runs on (part of every partition name). */
  spaceId: string;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
}

export class BrowserProfileStore {
  readonly #options: BrowserProfileStoreOptions;
  readonly #now: () => Date;
  readonly #profiles = new Map<string, BrowserProfile>();
  #problem: string | null = null;

  /** Reads the file (synchronously: the browser host needs it at start). A damaged file is kept aside, never overwritten. */
  constructor(options: BrowserProfileStoreOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
    this.#load();
  }

  /** A sentence when the list could not be read (the agents then start with fresh profiles); null otherwise. */
  get problem(): string | null {
    return this.#problem;
  }

  get spaceId(): string {
    return this.#options.spaceId;
  }

  list(): BrowserProfileList {
    return {
      spaceId: this.#options.spaceId,
      profiles: [...this.#profiles.values()]
        .sort((a, b) => a.botId.localeCompare(b.botId))
        .map((profile) => structuredClone(profile)),
    };
  }

  has(botId: string): boolean {
    return this.#profiles.has(botId);
  }

  /** The profile of an agent, made if it does not exist (the first page an agent opens makes it). Tells the window when made. */
  ensure(botId: string): BrowserProfile {
    const existing = this.#profiles.get(botId);
    if (existing) return existing;
    const made: BrowserProfile = {
      botId,
      createdAt: this.#now().toISOString(),
      clearedAt: null,
      domains: emptyDomainPolicy(),
    };
    this.#profiles.set(botId, made);
    this.#save();
    this.#publish();
    return made;
  }

  create(botId: string): BrowserProfileList {
    this.ensure(botId);
    return this.list();
  }

  setDomains(botId: string, domains: DomainPolicy): BrowserProfileList {
    const profile = this.ensure(botId);
    profile.domains = { allow: [...domains.allow], block: [...domains.block] };
    this.#save();
    this.#publish();
    return this.list();
  }

  /** The sessions of this agent's profile were cleared (by the caller): remember when. The domain policy stays. */
  markCleared(botId: string): BrowserProfileList {
    const profile = this.#profiles.get(botId);
    if (!profile) throw new Error("This agent has no browser profile yet, so there is nothing to clear.");
    profile.clearedAt = this.#now().toISOString();
    this.#save();
    this.#publish();
    return this.list();
  }

  partitionOf(botId: string): string {
    return profilePartition(this.#options.spaceId, botId);
  }

  describe(botId: string, openTabs: number): BrowserProfileDescription {
    const profile = this.#profiles.get(botId);
    return {
      botId,
      exists: profile !== undefined,
      isolated: [...BROWSER_PROFILE_PARTS],
      sharedWithOthers: false,
      domains: profile ? structuredClone(profile.domains) : emptyDomainPolicy(),
      createdAt: profile?.createdAt ?? null,
      clearedAt: profile?.clearedAt ?? null,
      openTabs,
    };
  }

  /** May this agent's profile load this address? `reason` is a plain sentence when not. An agent without a profile has no lists. */
  decide(botId: string, address: string, kind: DomainRequestKind): { allowed: boolean; reason: string | null } {
    const profile = this.#profiles.get(botId);
    return profile ? domainDecision(profile.domains, address, kind) : { allowed: true, reason: null };
  }

  // --- internals ---

  #load(): void {
    const file = this.#options.filePath;
    if (!existsSync(file)) return;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (!isDynamicRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.profiles))
        throw new Error("malformed");
      for (const entry of parsed.profiles) {
        if (!isBrowserProfile(entry)) throw new Error("malformed");
        if (this.#profiles.has(entry.botId)) throw new Error("twice");
        this.#profiles.set(entry.botId, entry);
      }
    } catch {
      this.#profiles.clear();
      this.#problem =
        "The list of browser profiles could not be read, so every agent starts with a fresh profile. The old list was kept aside.";
      try {
        renameSync(file, `${file}.damaged-${this.#now().getTime()}`);
      } catch {
        // the file stays where it is; the next save replaces it
      }
    }
  }

  #save(): void {
    const file = this.#options.filePath;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, profiles: this.list().profiles }, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(temporary, file);
    if (this.#problem) this.#problem = null;
  }

  #publish(): void {
    this.#options.emit({ type: "browser-profiles-changed", ...this.list() });
  }
}

/**
 * What the browser host asks. A tab is judged by the agent behind it: `ownerBotId`, or, for a page the agent's CLI opened
 * (it names only its CLI thread), the agent that owns that thread. A tab with no agent behind it (a person's) is not
 * judged here and uses the program's shared profile.
 */
export interface BrowserProfilePort {
  /** The agent behind a CLI thread; null when no agent of this space owns it. */
  botForThread(threadId: string): string | null;
  /** The partition for an agent's tabs; null = the shared profile of the program (a person's tabs). Makes the profile. */
  partitionFor(ownerBotId: string | null): string | null;
  /** A plain sentence when this agent's profile refuses to OPEN this address as a page; null when it may. */
  checkNavigation(ownerBotId: string | null, address: string): string | null;
  /** A plain sentence when a request of this agent's profile must be refused (blocked host, or a page outside the allow list). */
  checkRequest(ownerBotId: string | null, address: string, resourceType: string): string | null;
}

export interface BrowserProfileOwners {
  /** Every agent of this space. */
  agentIds: () => string[];
  /** The CLI sessions (thread ids of the CLI) of one agent, over all its threads. */
  cliThreadsOf: (botId: string) => string[];
}

export function createBrowserProfilePort(store: BrowserProfileStore, owners: BrowserProfileOwners): BrowserProfilePort {
  return {
    botForThread: (threadId) => {
      for (const botId of owners.agentIds()) if (owners.cliThreadsOf(botId).includes(threadId)) return botId;
      return null;
    },
    partitionFor: (ownerBotId) => {
      if (ownerBotId === null) return null;
      store.ensure(ownerBotId);
      return store.partitionOf(ownerBotId);
    },
    checkNavigation: (ownerBotId, address) =>
      ownerBotId === null ? null : store.decide(ownerBotId, address, "navigation").reason,
    checkRequest: (ownerBotId, address, resourceType) =>
      ownerBotId === null
        ? null
        : store.decide(ownerBotId, address, resourceType === "mainFrame" ? "navigation" : "resource").reason,
  };
}
