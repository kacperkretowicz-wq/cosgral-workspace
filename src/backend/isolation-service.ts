// COSGRAL W8-BE2: isolation of the processes of agents on Windows (spec-w8.md 1B, W8-09…11; Q1, Q2). See
// packages/contracts/src/ipc-isolation.ts for what each state means.
//
// - `probeIsolation` checks what this computer can do (builds the helper, asks it). It never assumes.
// - `IsolationService` keeps the person's switch per agent, answers what is in force, opens the card for turning it off, hands the
//   helper to the providers that start a program per agent, and tells the access rules when disk tools must be refused (Q2).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AccessLevel,
  type AgentEvent,
  type AgentIsolation,
  type DraftPreviewResolution,
  defaultAvailability,
  type IsolationAvailability,
  isolationFor,
  isolationOffCard,
  isolationRefusesDiskTools,
  type SetIsolationEnabledInput,
  type SetIsolationEnabledResult,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { ensureIsolationHost, findCsc, type HostProbe, runHostProbe } from "./isolation-host";

// --- the check of this computer ---

export interface IsolationCheck {
  availability: IsolationAvailability;
  /** The compiled helper, when it could be built and answered; null otherwise. */
  host: string | null;
}

export interface ProbeOptions {
  /** Where the helper is built (a folder of the program). */
  folder: string;
  platform?: NodeJS.Platform;
  findCsc?: () => string | null;
  ensureHost?: (folder: string) => Promise<string>;
  runProbe?: (host: string) => Promise<HostProbe>;
  now?: () => Date;
}

export async function probeIsolation(options: ProbeOptions): Promise<IsolationCheck> {
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const none = (reason: string): IsolationCheck => ({
    host: null,
    availability: {
      checkedAt,
      mechanism: "none",
      jobObject: { ok: false, reason },
      appContainer: { ok: false, reason },
      windows: null,
    },
  });
  if ((options.platform ?? process.platform) !== "win32") return none("Process isolation is only for Windows.");
  if (!(options.findCsc ?? findCsc)()) {
    return none(
      "The .NET Framework compiler (csc.exe) that builds the isolation helper was not found on this computer.",
    );
  }
  let host: string;
  try {
    host = await (options.ensureHost ?? ensureIsolationHost)(options.folder);
  } catch (error) {
    return none(error instanceof Error ? error.message : String(error));
  }
  let found: HostProbe;
  try {
    found = await (options.runProbe ?? runHostProbe)(host);
  } catch (error) {
    return none(error instanceof Error ? error.message : String(error));
  }
  const job = found.job === null;
  const appContainer = found.appContainer === null;
  return {
    host: job ? host : null,
    availability: {
      checkedAt,
      mechanism: job ? (appContainer ? "app-container-job" : "job-object") : "none",
      jobObject: { ok: job, reason: found.job },
      appContainer: { ok: appContainer, reason: found.appContainer },
      windows: found.windows,
    },
  };
}

// --- the person's switch per agent ---

const FILE_VERSION = 1;

export interface IsolationStoreOptions {
  filePath: string;
}

/** The agents whose isolation the person turned off, one small JSON file. An agent not in it has isolation on (the default). */
export class IsolationStore {
  readonly #filePath: string;
  readonly #off = new Set<string>();

  constructor(options: IsolationStoreOptions) {
    this.#filePath = options.filePath;
    if (!existsSync(this.#filePath)) return;
    try {
      const data = JSON.parse(readFileSync(this.#filePath, "utf8"));
      if (!isDynamicRecord(data) || data.version !== FILE_VERSION || !Array.isArray(data.off))
        throw new Error("Unknown format.");
      for (const id of data.off) if (isString(id)) this.#off.add(id);
    } catch {
      // A damaged file puts isolation back ON for everyone (the safe direction).
      this.#off.clear();
      try {
        renameSync(this.#filePath, `${this.#filePath}.damaged-${new Date().toISOString().replace(/[:.]/g, "-")}`);
      } catch {
        // The next change overwrites it.
      }
    }
  }

  enabled(botId: string): boolean {
    return !this.#off.has(botId);
  }

  set(botId: string, enabled: boolean): void {
    if (enabled) this.#off.delete(botId);
    else this.#off.add(botId);
    this.#save();
  }

  remove(botId: string): void {
    if (this.#off.delete(botId)) this.#save();
  }

  #save(): void {
    mkdirSync(dirname(this.#filePath), { recursive: true });
    const temporary = `${this.#filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: FILE_VERSION, off: [...this.#off] }, null, 2), "utf8");
    renameSync(temporary, this.#filePath);
  }
}

// --- the service ---

export interface IsolationServiceOptions {
  store: IsolationStore;
  /** Checks this computer (`probeIsolation` with the program's folder). */
  check: () => Promise<IsolationCheck>;
  botIds: () => string[];
  botName: (botId: string) => string | null;
  /** True for a provider that starts a program per conversation of the agent (Claude), false for a shared one (Codex). */
  ownProcesses: (botId: string) => boolean;
  confirm: (botId: string, input: { title: string; preview: string }) => Promise<DraftPreviewResolution>;
  emit: (event: AgentEvent) => void;
}

export interface HostWrap {
  host: string;
  maxProcesses: number;
}

export class IsolationService {
  readonly #options: IsolationServiceOptions;
  #checked: IsolationCheck = { availability: defaultAvailability(), host: null };
  #ready: Promise<void> = Promise.resolve();
  readonly #pending = new Map<string, number>();
  #sequence = 0;

  constructor(options: IsolationServiceOptions) {
    this.#options = options;
  }

  /** Checks this computer once (the first start). Never throws: a failed check is "unavailable" with its reason. */
  async initialize(): Promise<void> {
    this.#ready = this.recheck().then(() => undefined);
    await this.#ready;
  }

  /** Settles when the first check of this computer is done (a turn waits for it, so none starts before the answer is known). */
  ready(): Promise<void> {
    return this.#ready;
  }

  async recheck(): Promise<IsolationAvailability> {
    this.#checked = await this.#options.check().catch(
      (error): IsolationCheck => ({
        host: null,
        availability: {
          ...defaultAvailability(),
          checkedAt: new Date().toISOString(),
          jobObject: { ok: false, reason: error instanceof Error ? error.message : String(error) },
        },
      }),
    );
    this.#publish();
    return this.availability();
  }

  availability(): IsolationAvailability {
    return structuredClone(this.#checked.availability);
  }

  get(botId: string): AgentIsolation {
    return isolationFor({
      botId,
      enabled: this.#options.store.enabled(botId),
      availability: this.#checked.availability,
      ownProcesses: this.#options.ownProcesses(botId),
    });
  }

  list(): AgentIsolation[] {
    return this.#options.botIds().map((botId) => this.get(botId));
  }

  async setEnabled(input: SetIsolationEnabledInput): Promise<SetIsolationEnabledResult> {
    if (!this.#options.botIds().includes(input.botId)) throw new Error("This agent no longer exists.");
    const current = this.#options.store.enabled(input.botId);
    if (input.enabled === current) {
      this.#pending.delete(input.botId);
      return { isolation: this.get(input.botId), offRequested: false };
    }
    if (input.enabled) {
      this.#pending.delete(input.botId);
      this.#options.store.set(input.botId, true);
      this.#publish();
      return { isolation: this.get(input.botId), offRequested: false };
    }
    if (this.#pending.has(input.botId)) return { isolation: this.get(input.botId), offRequested: true };
    const ticket = ++this.#sequence;
    this.#pending.set(input.botId, ticket);
    const card = isolationOffCard({ agentName: this.#options.botName(input.botId) ?? "The agent" });
    void this.#options
      .confirm(input.botId, card)
      .then((answer) => {
        if (this.#pending.get(input.botId) !== ticket) return;
        this.#pending.delete(input.botId);
        if (answer !== "send" || !this.#options.botIds().includes(input.botId)) return;
        this.#options.store.set(input.botId, false);
        this.#publish();
      })
      .catch(() => {
        if (this.#pending.get(input.botId) === ticket) this.#pending.delete(input.botId);
      });
    return { isolation: this.get(input.botId), offRequested: true };
  }

  forgetBot(botId: string): void {
    this.#pending.delete(botId);
    this.#options.store.remove(botId);
  }

  /** The helper and the cap for an agent whose own processes run in a Job Object; null when they must start plainly. */
  wrapFor(botId: string): HostWrap | null {
    if (!this.#options.botIds().includes(botId)) return null;
    const isolation = this.get(botId);
    const host = this.#checked.host;
    if (isolation.state !== "active" || !host || isolation.maxProcesses === null) return null;
    return { host, maxProcesses: isolation.maxProcesses };
  }

  /** Q2: the sentence for refusing the file and shell tools of this agent (isolation on but impossible, level below Full); else null. */
  refusal(botId: string, level: AccessLevel): string | null {
    // Before the first check nothing is known: the turn that waits for `ready()` never gets here unchecked.
    if (this.#checked.availability.checkedAt === null) return null;
    const isolation = this.get(botId);
    return isolationRefusesDiskTools(isolation, level)
      ? (isolation.reason ?? "Isolation is not available on this computer.")
      : null;
  }

  #publish(): void {
    this.#options.emit({ type: "isolation-changed", availability: this.availability(), agents: this.list() });
  }
}
