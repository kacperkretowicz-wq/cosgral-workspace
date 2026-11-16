// COSGRAL W3: providers beyond Codex and Claude. Keeps the ACP agents and every agent's fallback models
// in the local database, and the live usage state of each provider: a usage limit until its reset time,
// an availability error for a short pause, and Codex's own usage windows. AgentService asks it which
// model a turn should use; a model is tried at most once per message, so a fallback never loops.
import {
  type AccountUsage,
  type AcpAgentConfig,
  type AcpAgentIdInput,
  type AgentActivityLimit,
  type AgentEvent,
  type AgentModelId,
  type AgentProviderId,
  type AgentProviderStatus,
  acpModelId,
  type FallbackModelsInfo,
  type FallbackModelsInput,
  fallbackChain,
  fallbackModelsProblem,
  GENERAL_FALLBACK_SCOPE,
  isAcpAgentConfig,
  isAcpAgentId,
  isAcpModel,
  isClaudeModel,
  isEndpointModel,
  normalizeFallbackModels,
  PROVIDER_LIMITS,
  type ProviderUsage,
  parseEndpointModel,
  type SaveAcpAgentInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

export type FailureKind = "usage-limit" | "unavailable" | null;

export interface ProviderFailure {
  kind: FailureKind;
  /** Unix seconds, when the provider said. */
  resetsAt: number | null;
  message: string;
}

export interface ProviderRegistryOptions {
  database: OpenBotDatabase;
  emit: (event: AgentEvent) => void;
  now?: () => number;
  /** false in tests: the caller drives tick(). */
  timers?: boolean;
}

interface Block {
  state: "limited" | "unavailable";
  resetsAt: number;
  reason: string;
}

export function providerOfModel(model: AgentModelId): AgentProviderId {
  if (isEndpointModel(model)) return "endpoint";
  return isAcpModel(model) ? "acp" : isClaudeModel(model) ? "claude" : "codex";
}

/** Limits apply to the whole Codex or Claude account, to each ACP agent on its own, and to each endpoint (all its models). */
function scopeOf(model: AgentModelId): string {
  const provider = providerOfModel(model);
  if (provider === "endpoint") return `endpoint:${parseEndpointModel(model)?.endpointId ?? model}`;
  return provider === "acp" ? model : provider;
}

export class ProviderRegistry {
  readonly #database: OpenBotDatabase;
  readonly #emit: (event: AgentEvent) => void;
  readonly #now: () => number;
  readonly #timers: boolean;
  readonly #blocks = new Map<string, Block>();
  #codexUsage: AccountUsage | null = null;
  /** COSGRAL W4-BE1: the engine's CLI states (the same ones onboarding shows); empty until the engine reports. */
  #cliStates = new Map<"codex" | "claude", AgentProviderStatus>();
  #timer: NodeJS.Timeout | null = null;
  /** W5-BE5: whether an own model endpoint still exists; null = not known here (endpoint models count as present). */
  #endpointExists: ((endpointId: string) => boolean) | null = null;

  constructor(options: ProviderRegistryOptions) {
    this.#database = options.database;
    this.#emit = options.emit;
    this.#now = options.now ?? Date.now;
    this.#timers = options.timers ?? true;
  }

  stop(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** W5-BE5: the endpoints the program knows, so a fallback model of a removed endpoint is shown but never tried. */
  useEndpointLookup(exists: (endpointId: string) => boolean): void {
    this.#endpointExists = exists;
  }

  listAcpAgents(): AcpAgentConfig[] {
    return rows(
      this.#database.connection.prepare("SELECT data_json FROM projection_acp_agents ORDER BY created_at, rowid").all(),
    )
      .map((row) => JSON.parse(text(row, "data_json")))
      .filter(isAcpAgentConfig);
  }

  saveAcpAgent(input: SaveAcpAgentInput): AcpAgentConfig {
    if (!isAcpAgentId(input.id)) {
      throw new Error(
        `The ACP agent id starts with a lowercase letter and has lowercase letters, digits and dashes (at most ${PROVIDER_LIMITS.acpId}).`,
      );
    }
    const name = input.name.trim();
    if (!name || name.length > PROVIDER_LIMITS.acpName)
      throw new Error(`The ACP agent name has 1–${PROVIDER_LIMITS.acpName} characters.`);
    const command = input.command.trim();
    if (!command || command.length > PROVIDER_LIMITS.command) throw new Error("An ACP agent needs a command to start.");
    const args = input.args ?? [];
    if (args.length > PROVIDER_LIMITS.args || args.some((arg) => arg.length > PROVIDER_LIMITS.arg)) {
      throw new Error(`At most ${PROVIDER_LIMITS.args} arguments of ${PROVIDER_LIMITS.arg} characters.`);
    }
    const current = this.listAcpAgents();
    const existing = current.find((agent) => agent.id === input.id);
    if (!existing && current.length >= PROVIDER_LIMITS.acpAgents)
      throw new Error(`At most ${PROVIDER_LIMITS.acpAgents} ACP agents.`);
    const at = new Date(this.#now()).toISOString();
    const config: AcpAgentConfig = {
      id: input.id,
      name,
      command,
      args: [...args],
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    this.#database.connection
      .prepare(
        `INSERT INTO projection_acp_agents (acp_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(acp_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
      )
      .run(config.id, JSON.stringify(config), config.createdAt, config.updatedAt);
    this.#emit({ type: "acp-agents-changed", agents: this.listAcpAgents() });
    return config;
  }

  removeAcpAgent(input: AcpAgentIdInput): void {
    this.#database.connection.prepare("DELETE FROM projection_acp_agents WHERE acp_id = ?").run(input.id);
    this.#emit({ type: "acp-agents-changed", agents: this.listAcpAgents() });
  }

  /** The agent's own saved list (for "*": the general list); empty when none is saved. Never more than 8, no repeats. */
  getFallbackModels(botId: string): AgentModelId[] {
    return this.#ownFallbackModels(botId) ?? [];
  }

  setFallbackModels(input: FallbackModelsInput): AgentModelId[] {
    const problem = fallbackModelsProblem(input.fallbackModels);
    if (problem) throw new Error(problem);
    const models = [...input.fallbackModels];
    this.#database.connection
      .prepare(
        `INSERT INTO projection_agent_fallback_models (agent_id, models_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET models_json = excluded.models_json, updated_at = excluded.updated_at`,
      )
      .run(input.botId, JSON.stringify(models), new Date(this.#now()).toISOString());
    return models;
  }

  /** W5-BE4: the agent forgets its own list and follows the general list again (for "*": the general list is emptied). */
  resetFallbackModels(botId: string): FallbackModelsInfo {
    this.#database.connection.prepare("DELETE FROM projection_agent_fallback_models WHERE agent_id = ?").run(botId);
    return this.getFallbackInfo(botId);
  }

  /** W5-BE4: where the list of an agent comes from and what is really tried after its own model. */
  getFallbackInfo(botId: string): FallbackModelsInfo {
    const own = this.#ownFallbackModels(botId);
    const general = this.#ownFallbackModels(GENERAL_FALLBACK_SCOPE) ?? [];
    const list = own ?? general;
    // An ACP model whose agent was removed stays in the list (adding the agent again revives it) but is never tried.
    // The same for a model of an own endpoint that was removed (W5-BE5).
    const present = new Set(this.listAcpAgents().map((agent) => acpModelId(agent.id)));
    const endpointExists = this.#endpointExists;
    const endpointGone = (model: AgentModelId) => {
      const endpointId = parseEndpointModel(model)?.endpointId;
      return endpointId !== undefined && endpointExists !== null && !endpointExists(endpointId);
    };
    const missing = {
      has: (model: AgentModelId) => (isAcpModel(model) && !present.has(model)) || endpointGone(model),
    };
    return {
      botId,
      own,
      general,
      effective: list.filter((model) => !missing.has(model)),
      unavailable: list.filter((model) => missing.has(model)),
      // W5-BE7 (step 1, contract only): the provider layer follows in the next commit.
      providerScope: null,
      provider: null,
      chain: fallbackChain({
        ownModel: null,
        own,
        provider: null,
        general: own === null ? general : [],
        isAvailable: (model) => !missing.has(model),
      }),
    };
  }

  #ownFallbackModels(botId: string): AgentModelId[] | null {
    const row = this.#database.connection
      .prepare("SELECT models_json FROM projection_agent_fallback_models WHERE agent_id = ?")
      .get(botId);
    if (!isDynamicRecord(row)) return null;
    try {
      return normalizeFallbackModels(JSON.parse(text(row, "models_json")));
    } catch {
      return [];
    }
  }

  /** A deleted agent's fallback list goes with it. */
  deleteAgent(botId: string): void {
    this.#database.connection.prepare("DELETE FROM projection_agent_fallback_models WHERE agent_id = ?").run(botId);
  }

  /** Record a failed turn. Only a usage limit or unavailability blocks the model; returns whether it did. */
  reportFailure(model: AgentModelId, failure: ProviderFailure): boolean {
    if (failure.kind === null) return false;
    const nowSeconds = Math.floor(this.#now() / 1000);
    const pause =
      failure.kind === "unavailable"
        ? PROVIDER_LIMITS.unavailableCooldownMinutes * 60
        : PROVIDER_LIMITS.limitWithoutResetMinutes * 60;
    const resetsAt = failure.resetsAt && failure.resetsAt > nowSeconds ? failure.resetsAt : nowSeconds + pause;
    this.#blocks.set(scopeOf(model), {
      state: failure.kind === "usage-limit" ? "limited" : "unavailable",
      resetsAt,
      reason: failure.message.split(/\r?\n/)[0]?.slice(0, 200) || failure.kind,
    });
    this.#changed();
    return true;
  }

  /** Codex reports its usage windows itself; a window at 100 % blocks Codex until it resets. */
  updateCodexUsage(usage: AccountUsage): void {
    this.#codexUsage = structuredClone(usage);
    this.#changed();
  }

  isUsable(model: AgentModelId): boolean {
    return this.#blockFor(model) === null;
  }

  /**
   * The first usable model of [own model, …fallbacks] not tried for this message yet; null when none is left.
   * W5-BE5: `accountFree` says the agent's account pool still has a free account of that provider: then a Codex or
   * Claude limit known here (the last account's limit, the usage window of this computer's account) does not hold,
   * because the accounts come before the fallback models.
   */
  chooseModel(
    botId: string,
    model: AgentModelId,
    tried: ReadonlySet<string>,
    accountFree?: (provider: AgentProviderId) => boolean,
  ): AgentModelId | null {
    for (const candidate of [model, ...this.getFallbackInfo(botId).effective]) {
      if (tried.has(candidate)) continue;
      if (this.isUsable(candidate) || accountFree?.(providerOfModel(candidate))) return candidate;
    }
    return null;
  }

  /** For the agent row: the limit of the provider (or ACP agent) the agent works with now. */
  limitFor(provider: AgentProviderId, model: AgentModelId): AgentActivityLimit | null {
    const block = this.#blockFor(model);
    if (block?.state !== "limited") return null;
    return { provider, limitId: scopeOf(model), resetsAt: block.resetsAt };
  }

  /**
   * COSGRAL W4-BE1: the agent engine tells the registry what it knows about each CLI (installed, signed in, started).
   * Usage and the Providers page then say the same as onboarding instead of assuming every provider is fine.
   */
  setProviderStatuses(statuses: readonly AgentProviderStatus[]): void {
    let changed = false;
    for (const status of statuses) {
      if (status.id !== "codex" && status.id !== "claude") continue;
      const before = this.#cliStates.get(status.id);
      if (before?.state === status.state && before.message === status.message) continue;
      this.#cliStates.set(status.id, { ...status });
      changed = true;
    }
    if (changed) this.#changed();
  }

  listUsage(): ProviderUsage[] {
    const nowSeconds = Math.floor(this.#now() / 1000);
    const usage: ProviderUsage[] = [];
    const codex = this.#codexWindow(nowSeconds);
    for (const provider of ["codex", "claude"] as const) {
      const cli = this.#cliStates.get(provider);
      if (cli && cli.state !== "available") {
        usage.push({
          provider,
          model: null,
          state: "unavailable",
          resetsAt: null,
          usedPercent: provider === "codex" ? codex.usedPercent : null,
          reason: cliReason(cli),
        });
        continue;
      }
      const block = this.#activeBlock(provider, nowSeconds);
      const limited = provider === "codex" && codex.limitedUntil !== null;
      usage.push({
        provider,
        model: null,
        state: block?.state ?? (limited ? "limited" : "ok"),
        resetsAt: block?.resetsAt ?? (limited ? codex.limitedUntil : null),
        usedPercent: provider === "codex" ? codex.usedPercent : null,
        reason: block?.reason ?? (limited ? "Codex usage limit" : null),
      });
    }
    const acpScopes = new Set([
      ...this.listAcpAgents().map((agent) => `acp:${agent.id}`),
      ...[...this.#blocks.keys()].filter(isAcpModel),
    ]);
    for (const scope of acpScopes) {
      if (!isAcpModel(scope)) continue;
      const block = this.#activeBlock(scope, nowSeconds);
      usage.push({
        provider: "acp",
        model: scope,
        state: block?.state ?? "ok",
        resetsAt: block?.resetsAt ?? null,
        usedPercent: null,
        reason: block?.reason ?? null,
      });
    }
    return usage;
  }

  /** Drop blocks that ended; tells listeners when something changed. Called by the timer or by tests. */
  tick(): void {
    const nowSeconds = Math.floor(this.#now() / 1000);
    let changed = false;
    for (const [scope, block] of this.#blocks) {
      if (block.resetsAt <= nowSeconds) {
        this.#blocks.delete(scope);
        changed = true;
      }
    }
    if (changed) this.#changed();
    else this.#arm();
  }

  #blockFor(model: AgentModelId): Block | null {
    const nowSeconds = Math.floor(this.#now() / 1000);
    const block = this.#activeBlock(scopeOf(model), nowSeconds);
    if (block) return block;
    if (providerOfModel(model) === "codex") {
      const codex = this.#codexWindow(nowSeconds);
      if (codex.limitedUntil !== null)
        return { state: "limited", resetsAt: codex.limitedUntil, reason: "Codex usage limit" };
    }
    return null;
  }

  #activeBlock(scope: string, nowSeconds: number): Block | null {
    const block = this.#blocks.get(scope);
    return block && block.resetsAt > nowSeconds ? block : null;
  }

  #codexWindow(nowSeconds: number): { usedPercent: number | null; limitedUntil: number | null } {
    let usedPercent: number | null = null;
    let limitedUntil: number | null = null;
    for (const limit of this.#codexUsage?.limits ?? []) {
      for (const window of [limit.primary, limit.secondary]) {
        if (!window) continue;
        usedPercent = Math.max(usedPercent ?? 0, window.usedPercent);
        if (window.usedPercent >= 100 && (window.resetsAt === null || window.resetsAt > nowSeconds)) {
          const until = window.resetsAt ?? nowSeconds + PROVIDER_LIMITS.limitWithoutResetMinutes * 60;
          limitedUntil = Math.max(limitedUntil ?? 0, until);
        }
      }
    }
    return { usedPercent, limitedUntil };
  }

  #changed(): void {
    this.#emit({ type: "provider-usage-changed", usage: this.listUsage() });
    this.#arm();
  }

  #arm(): void {
    if (!this.#timers) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    const nowMs = this.#now();
    const ends = [...this.#blocks.values()].map((block) => block.resetsAt * 1000 - nowMs);
    if (ends.length === 0) return;
    this.#timer = setTimeout(() => this.tick(), Math.min(Math.max(0, ...[Math.min(...ends)]) + 250, 2 ** 31 - 1));
    this.#timer.unref?.();
  }
}

function rows(value: unknown): DynamicRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid SQLite result set.");
  return value.filter(isDynamicRecord);
}

function text(row: DynamicRecord, key: string): string {
  const value = row[key];
  if (!isString(value)) throw new Error(`Invalid provider column ${key}.`);
  return value;
}

const CLI_STATE_LABELS: Record<AgentProviderStatus["state"], string> = {
  "not-started": "Checking",
  checking: "Checking",
  available: "Available",
  "sign-in-required": "Sign in required",
  "not-installed": "Not installed",
  outdated: "Update required",
  error: "Unavailable",
};

/** COSGRAL W4-BE1: the same words as the provider picker in onboarding (ProviderPicker), then the engine's reason. */
function cliReason(status: AgentProviderStatus): string {
  const label = CLI_STATE_LABELS[status.state];
  return status.message ? `${label}: ${status.message}`.slice(0, 300) : label;
}
