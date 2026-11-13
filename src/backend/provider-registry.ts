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
  type FallbackModelsInput,
  isAcpAgentConfig,
  isAcpAgentId,
  isAcpModel,
  isAgentModel,
  isClaudeModel,
  PROVIDER_LIMITS,
  type ProviderUsage,
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
  return isAcpModel(model) ? "acp" : isClaudeModel(model) ? "claude" : "codex";
}

/** Limits apply to the whole Codex or Claude account, but to each ACP agent on its own. */
function scopeOf(model: AgentModelId): string {
  const provider = providerOfModel(model);
  return provider === "acp" ? model : provider;
}

export class ProviderRegistry {
  readonly #database: OpenBotDatabase;
  readonly #emit: (event: AgentEvent) => void;
  readonly #now: () => number;
  readonly #timers: boolean;
  readonly #blocks = new Map<string, Block>();
  #codexUsage: AccountUsage | null = null;
  #timer: NodeJS.Timeout | null = null;

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

  getFallbackModels(botId: string): AgentModelId[] {
    const row = this.#database.connection
      .prepare("SELECT models_json FROM projection_agent_fallback_models WHERE agent_id = ?")
      .get(botId);
    if (!isDynamicRecord(row)) return [];
    const parsed = JSON.parse(text(row, "models_json"));
    return Array.isArray(parsed) ? parsed.filter(isAgentModel) : [];
  }

  setFallbackModels(input: FallbackModelsInput): AgentModelId[] {
    const models = input.fallbackModels;
    if (models.length > PROVIDER_LIMITS.fallbackModels)
      throw new Error(`At most ${PROVIDER_LIMITS.fallbackModels} fallback models.`);
    if (!models.every(isAgentModel)) throw new Error("Unknown model in the fallback list.");
    if (new Set(models).size !== models.length) throw new Error("A fallback model is listed twice.");
    this.#database.connection
      .prepare(
        `INSERT INTO projection_agent_fallback_models (agent_id, models_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET models_json = excluded.models_json, updated_at = excluded.updated_at`,
      )
      .run(input.botId, JSON.stringify(models), new Date(this.#now()).toISOString());
    return [...models];
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

  /** The first usable model of [own model, …fallbacks] not tried for this message yet; null when none is left. */
  chooseModel(botId: string, model: AgentModelId, tried: ReadonlySet<string>): AgentModelId | null {
    for (const candidate of [model, ...this.getFallbackModels(botId)]) {
      if (!tried.has(candidate) && this.isUsable(candidate)) return candidate;
    }
    return null;
  }

  /** For the agent row: the limit of the provider (or ACP agent) the agent works with now. */
  limitFor(provider: AgentProviderId, model: AgentModelId): AgentActivityLimit | null {
    const block = this.#blockFor(model);
    if (block?.state !== "limited") return null;
    return { provider, limitId: scopeOf(model), resetsAt: block.resetsAt };
  }

  listUsage(): ProviderUsage[] {
    const nowSeconds = Math.floor(this.#now() / 1000);
    const usage: ProviderUsage[] = [];
    const codex = this.#codexWindow(nowSeconds);
    for (const provider of ["codex", "claude"] as const) {
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
