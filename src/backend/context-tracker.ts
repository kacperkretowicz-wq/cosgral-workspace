// COSGRAL W6-BE2: the context of a conversation per thread (spec-w6.md 1B, W11-W16; decisions Q6, Q7).
//
// What the provider's CLI reports (tokens used, size of the window) is remembered here per agent and thread, kept in the
// database (tables created here with CREATE TABLE IF NOT EXISTS, the shared schema stays untouched) so a restart does not
// empty the indicator. Nothing is made up: a thread without a report is "unavailable" with a plain reason (Q6). The
// program compacts by itself when the thread passes the threshold of the settings (Q7; default 90 %, can be off) and the
// person can always ask for it; whatever shrinks the context is counted and shown. The engine (AgentService) decides
// WHEN to compact; this class only knows the numbers, the settings and what the window may be told.

import {
  type AgentEvent,
  applyContextSettings,
  type ContextSettings,
  type ContextState,
  contextPercent,
  contextWarning,
  defaultContextSettings,
  isContextSettings,
  type UpdateContextSettingsInput,
  unavailableContextState,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projection_context_state (
    agent_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    used_tokens INTEGER,
    window_tokens INTEGER,
    reported_at TEXT,
    compactions INTEGER NOT NULL DEFAULT 0,
    last_compacted_at TEXT,
    last_compacted_from INTEGER,
    stale INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (agent_id, thread_id)
  );
  CREATE TABLE IF NOT EXISTS projection_context_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    settings_json TEXT NOT NULL CHECK(json_valid(settings_json))
  );
`;

/** A provider as the context sees it: only Codex reports its window, and only Codex can be asked to compact. */
export type ContextProvider = "codex" | "claude" | "acp" | "endpoint";

const PROVIDER_NAMES: Record<ContextProvider, string> = {
  codex: "Codex",
  claude: "Claude Code",
  acp: "This agent program",
  endpoint: "This model endpoint",
};

/** Why a thread has no numbers. Plain sentences, in English like the rest of the window text. */
export function unavailableReasonFor(provider: ContextProvider): string {
  if (provider === "codex") return "No usage has been reported for this thread yet.";
  if (provider === "claude") return "Claude Code does not report its context size, and it compacts by itself.";
  return `${PROVIDER_NAMES[provider]} does not report a context size.`;
}

export function canCompactProvider(provider: ContextProvider): boolean {
  return provider === "codex";
}

interface StoredContext {
  used: number | null;
  limit: number | null;
  reportedAt: string | null;
  compactions: number;
  lastCompactedAt: string | null;
  lastCompactedFrom: number | null;
  stale: boolean;
}

export class ContextStore {
  readonly #database: OpenBotDatabase;
  #ready = false;

  /** The database may not be open yet when the engine is built: the tables are made on first use. */
  constructor(database: OpenBotDatabase) {
    this.#database = database;
  }

  #connection() {
    const connection = this.#database.connection;
    if (!this.#ready) {
      connection.exec(SCHEMA);
      this.#ready = true;
    }
    return connection;
  }

  get(botId: string, threadId: string): StoredContext | null {
    const row = this.#connection()
      .prepare(
        `SELECT used_tokens, window_tokens, reported_at, compactions, last_compacted_at, last_compacted_from, stale
         FROM projection_context_state WHERE agent_id = ? AND thread_id = ?`,
      )
      .get(botId, threadId);
    if (row === undefined) return null;
    if (!isDynamicRecord(row) || !isNumber(row.compactions)) throw new Error("The stored context state is malformed.");
    const nullableNumber = (value: unknown) => (isNumber(value) ? value : null);
    const nullableString = (value: unknown) => (isString(value) ? value : null);
    return {
      used: nullableNumber(row.used_tokens),
      limit: nullableNumber(row.window_tokens),
      reportedAt: nullableString(row.reported_at),
      compactions: row.compactions,
      lastCompactedAt: nullableString(row.last_compacted_at),
      lastCompactedFrom: nullableNumber(row.last_compacted_from),
      stale: row.stale === 1,
    };
  }

  save(botId: string, threadId: string, value: StoredContext): void {
    this.#connection()
      .prepare(
        `INSERT INTO projection_context_state
           (agent_id, thread_id, used_tokens, window_tokens, reported_at, compactions, last_compacted_at, last_compacted_from, stale)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id, thread_id) DO UPDATE SET
           used_tokens = excluded.used_tokens, window_tokens = excluded.window_tokens, reported_at = excluded.reported_at,
           compactions = excluded.compactions, last_compacted_at = excluded.last_compacted_at,
           last_compacted_from = excluded.last_compacted_from, stale = excluded.stale`,
      )
      .run(
        botId,
        threadId,
        value.used,
        value.limit,
        value.reportedAt,
        value.compactions,
        value.lastCompactedAt,
        value.lastCompactedFrom,
        value.stale ? 1 : 0,
      );
  }

  delete(botId: string, threadId: string): void {
    this.#connection()
      .prepare("DELETE FROM projection_context_state WHERE agent_id = ? AND thread_id = ?")
      .run(botId, threadId);
  }

  settings(): ContextSettings {
    const row = this.#connection().prepare("SELECT settings_json FROM projection_context_settings WHERE id = 1").get();
    if (!isDynamicRecord(row) || !isString(row.settings_json)) return defaultContextSettings();
    try {
      const parsed = JSON.parse(row.settings_json);
      return isContextSettings(parsed) ? parsed : defaultContextSettings();
    } catch {
      return defaultContextSettings();
    }
  }

  saveSettings(settings: ContextSettings): void {
    this.#connection()
      .prepare(
        `INSERT INTO projection_context_settings (id, settings_json) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json`,
      )
      .run(JSON.stringify(settings));
  }
}

export interface ContextTrackerOptions {
  store: ContextStore;
  emit: (event: AgentEvent) => void;
  now?: () => Date;
  /** COSGRAL W6-BE3: whether a thread may be compacted at all (not an archived or a missing one). Left out: yes. */
  canCompactThread?: (botId: string, threadId: string) => boolean;
}

export class ContextTracker {
  readonly #store: ContextStore;
  readonly #emit: (event: AgentEvent) => void;
  readonly #now: () => Date;
  readonly #canCompactThread: (botId: string, threadId: string) => boolean;
  /** Threads with a compaction running or waiting for the running turn: not kept in the database (a restart ends it). */
  readonly #compacting = new Set<string>();
  /** What the window was last told per thread, so an unchanged report does not wake it again. */
  readonly #told = new Map<string, string>();

  constructor(options: ContextTrackerOptions) {
    this.#store = options.store;
    this.#emit = options.emit;
    this.#now = options.now ?? (() => new Date());
    this.#canCompactThread = options.canCompactThread ?? (() => true);
  }

  settings(): ContextSettings {
    return this.#store.settings();
  }

  updateSettings(input: UpdateContextSettingsInput): ContextSettings {
    const next = applyContextSettings(this.#store.settings(), input);
    this.#store.saveSettings(next);
    this.#emit({ type: "context-settings-changed", ...next });
    return next;
  }

  /** Whether a thread with these numbers is over the threshold and the program may compact it by itself. */
  shouldAutoCompact(used: number, limit: number): boolean {
    const settings = this.#store.settings();
    const percent = (used / limit) * 100;
    return settings.autoCompact && Number.isFinite(percent) && percent >= settings.thresholdPercent;
  }

  state(botId: string, threadId: string, provider: ContextProvider): ContextState {
    const stored = this.#store.get(botId, threadId);
    const compacting = this.#compacting.has(key(botId, threadId));
    const canCompact = canCompactProvider(provider) && this.#canCompactThread(botId, threadId);
    if (!stored || stored.used === null || stored.limit === null) {
      return {
        ...unavailableContextState(botId, threadId, unavailableReasonFor(provider), canCompact),
        compacting,
        compactions: stored?.compactions ?? 0,
        lastCompactedAt: stored?.lastCompactedAt ?? null,
        lastCompactedFromTokens: stored?.lastCompactedFrom ?? null,
      };
    }
    const percent = contextPercent(stored.used, stored.limit);
    if (percent === null) {
      return {
        ...unavailableContextState(
          botId,
          threadId,
          "The provider reported a context size that cannot be used.",
          canCompact,
        ),
        compacting,
      };
    }
    return {
      botId,
      threadId,
      source: "reported",
      used: stored.used,
      limit: stored.limit,
      percent,
      unavailableReason: null,
      warning: contextWarning(percent),
      compacting,
      canCompact,
      compactions: stored.compactions,
      lastCompactedAt: stored.lastCompactedAt,
      lastCompactedFromTokens: stored.lastCompactedFrom,
      stale: stored.stale,
      updatedAt: stored.reportedAt,
    };
  }

  /** The provider reported tokens used and the window size (both real numbers; anything else is ignored). */
  report(botId: string, threadId: string, provider: ContextProvider, used: number, limit: number): ContextState {
    if (!Number.isFinite(used) || !Number.isFinite(limit) || used < 0 || limit <= 0) {
      return this.state(botId, threadId, provider);
    }
    const before = this.#store.get(botId, threadId);
    this.#store.save(botId, threadId, {
      used: Math.round(used),
      limit: Math.round(limit),
      reportedAt: this.#now().toISOString(),
      compactions: before?.compactions ?? 0,
      lastCompactedAt: before?.lastCompactedAt ?? null,
      lastCompactedFrom: before?.lastCompactedFrom ?? null,
      stale: false,
    });
    return this.#announce(botId, threadId, provider);
  }

  setCompacting(botId: string, threadId: string, provider: ContextProvider, on: boolean): ContextState {
    const id = key(botId, threadId);
    if (on) this.#compacting.add(id);
    else this.#compacting.delete(id);
    return this.#announce(botId, threadId, provider);
  }

  /** A compaction finished: counted, remembered, and the numbers kept but marked stale until the next report. */
  compactionDone(botId: string, threadId: string, provider: ContextProvider): ContextState {
    const before = this.#store.get(botId, threadId);
    this.#store.save(botId, threadId, {
      used: before?.used ?? null,
      limit: before?.limit ?? null,
      reportedAt: before?.reportedAt ?? null,
      compactions: (before?.compactions ?? 0) + 1,
      lastCompactedAt: this.#now().toISOString(),
      lastCompactedFrom: before?.used ?? null,
      stale: before?.used !== null && before?.used !== undefined,
    });
    this.#compacting.delete(key(botId, threadId));
    return this.#announce(botId, threadId, provider);
  }

  /** The history of a thread was cleared: its numbers and counters go with it (the agent's memory is elsewhere). */
  forget(botId: string, threadId: string, provider: ContextProvider): ContextState {
    this.#store.delete(botId, threadId);
    this.#compacting.delete(key(botId, threadId));
    return this.#announce(botId, threadId, provider);
  }

  #announce(botId: string, threadId: string, provider: ContextProvider): ContextState {
    const state = this.state(botId, threadId, provider);
    const fingerprint = JSON.stringify({ ...state, updatedAt: null });
    const id = key(botId, threadId);
    if (this.#told.get(id) !== fingerprint) {
      this.#told.set(id, fingerprint);
      this.#emit({ type: "context-changed", ...state });
    }
    return state;
  }
}

function key(botId: string, threadId: string): string {
  return `${botId}\u0000${threadId}`;
}
