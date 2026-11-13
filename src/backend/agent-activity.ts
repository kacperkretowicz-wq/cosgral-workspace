// COSGRAL W1: the state each agent row shows (waiting, working, limited, error, idle).
// AgentService feeds every event it emits into `observe`; the tracker derives the row
// state from open cards, running work, the Codex usage limit and the last failure,
// and reports a change once per change.

import {
  ACTIVITY_ERROR_MESSAGE_LIMIT,
  type AccountUsage,
  type AgentActivity,
  type AgentActivityError,
  type AgentActivityKind,
  type AgentActivityLimit,
  type AgentEvent,
  type BotSummary,
} from "@openbot/contracts/ipc";
import type { AgentProvider } from "./agent-client";

/** Error events that mean "the last work of this agent failed". Warnings and notices do not count. */
const WORK_ERROR_CODES = new Set(["agent_error", "delivery_start_failed", "context_compaction_failed"]);

/** Re-check a long limit at least daily; Node timers also cap at about 24.8 days. */
const MAX_LIMIT_CHECK_MS = 24 * 60 * 60 * 1_000;
const LIMIT_CHECK_MARGIN_MS = 250;

export interface AgentActivitySources {
  listBots(): BotSummary[];
  pendingRequests(botId: string): number;
  working(botId: string): boolean;
  provider(bot: BotSummary): AgentProvider;
  /** COSGRAL W3: the usage limit of other providers (and ACP agents); Codex keeps its own usage windows. */
  providerLimit?(bot: BotSummary): AgentActivityLimit | null;
  emit(activity: AgentActivity): void;
  /** A Codex limit has just reset: read fresh usage. */
  limitReset(): void;
  now?: () => number;
}

type ActivityState = Omit<AgentActivity, "updatedAt">;

export class AgentActivityTracker {
  readonly #sources: AgentActivitySources;
  readonly #emitted = new Map<string, AgentActivity>();
  readonly #errors = new Map<string, AgentActivityError>();
  readonly #turnStartedAt = new Map<string, string>();
  #codexUsage: AccountUsage | null = null;
  #limitTimer: NodeJS.Timeout | null = null;

  constructor(sources: AgentActivitySources) {
    this.#sources = sources;
  }

  /** The current state of every agent row. */
  list(): AgentActivity[] {
    return this.#sources.listBots().map((bot) => this.#current(bot).activity);
  }

  /** Follow one emitted agent event. */
  observe(event: AgentEvent): void {
    switch (event.type) {
      case "turn-started":
        this.#turnStartedAt.set(event.botId, this.#isoNow());
        this.#refresh(event.botId);
        return;
      case "turn-completed":
        this.#completeTurn(event.botId, event.status);
        this.#refresh(event.botId);
        return;
      case "error":
        if (!event.botId || !WORK_ERROR_CODES.has(event.code)) return;
        this.#errors.set(event.botId, {
          code: event.code,
          message: activityErrorMessage(event.message),
          at: this.#isoNow(),
        });
        this.#refresh(event.botId);
        return;
      case "prompt":
      case "prompt-resolved":
      case "approval-resolved":
      case "draft-preview-resolved":
      case "browser-takeover-changed":
      case "vault-request-resolved":
        this.#refresh(event.botId);
        return;
      // COSGRAL W2: an agent waits for a Vault item from the person.
      case "vault-request":
        this.#refresh(event.request.botId);
        return;
      case "approval":
        this.#refresh(event.approval.botId);
        return;
      // COSGRAL W1-BE3: draft previews and browser takeovers wait for the user too.
      case "draft-preview":
        this.#refresh(event.card.botId);
        return;
      case "browser-takeover":
        this.#refresh(event.request.botId);
        return;
      case "queue-changed":
      case "conversation":
        this.#refresh(event.snapshot.botId);
        return;
      case "provider-usage-changed":
        this.#refreshAll();
        return;
      case "usage-changed":
        this.#codexUsage = structuredClone(event.usage);
        this.#scheduleLimitCheck();
        this.#refreshAll();
        return;
      case "bots-changed":
        this.#refreshAll();
        return;
      default:
        return;
    }
  }

  stop(): void {
    if (this.#limitTimer) clearTimeout(this.#limitTimer);
    this.#limitTimer = null;
  }

  #completeTurn(botId: string, status: string): void {
    const startedAt = this.#turnStartedAt.get(botId);
    this.#turnStartedAt.delete(botId);
    if (status === "completed") {
      this.#errors.delete(botId);
      return;
    }
    if (status !== "failed") return;
    const recorded = this.#errors.get(botId);
    if (recorded && (!startedAt || recorded.at >= startedAt)) return;
    this.#errors.set(botId, { code: "turn_failed", message: "The last turn failed.", at: this.#isoNow() });
  }

  #refreshAll(): void {
    const bots = this.#sources.listBots();
    const known = new Set(bots.map((bot) => bot.id));
    for (const botId of [...this.#emitted.keys()]) {
      if (known.has(botId)) continue;
      this.#emitted.delete(botId);
      this.#errors.delete(botId);
      this.#turnStartedAt.delete(botId);
    }
    for (const bot of bots) this.#publish(bot);
  }

  #refresh(botId: string): void {
    const bot = this.#sources.listBots().find((candidate) => candidate.id === botId);
    if (bot) this.#publish(bot);
  }

  #publish(bot: BotSummary): void {
    const { activity, changed } = this.#current(bot);
    if (!changed) return;
    this.#emitted.set(bot.id, activity);
    this.#sources.emit(structuredClone(activity));
  }

  #current(bot: BotSummary): { activity: AgentActivity; changed: boolean } {
    const state = this.#state(bot);
    const previous = this.#emitted.get(bot.id);
    if (previous && sameActivityState(previous, state)) return { activity: previous, changed: false };
    return { activity: { ...state, updatedAt: this.#isoNow() }, changed: true };
  }

  #state(bot: BotSummary): ActivityState {
    const pendingRequests = this.#sources.pendingRequests(bot.id);
    const working = this.#sources.working(bot.id);
    const limit =
      this.#sources.provider(bot) === "codex"
        ? exhaustedCodexLimit(this.#codexUsage, this.#now())
        : (this.#sources.providerLimit?.(bot) ?? null);
    const error = this.#errors.get(bot.id) ?? null;
    return {
      botId: bot.id,
      kind: activityKind(pendingRequests, working, limit, error),
      pendingRequests,
      limit,
      error,
    };
  }

  #scheduleLimitCheck(): void {
    this.stop();
    const resetsAt = exhaustedCodexLimit(this.#codexUsage, this.#now())?.resetsAt;
    if (resetsAt === null || resetsAt === undefined) return;
    const delay = Math.min(Math.max(resetsAt * 1_000 - this.#now() + LIMIT_CHECK_MARGIN_MS, 0), MAX_LIMIT_CHECK_MS);
    this.#limitTimer = setTimeout(() => {
      this.#limitTimer = null;
      this.#scheduleLimitCheck();
      this.#refreshAll();
      this.#sources.limitReset();
    }, delay);
    this.#limitTimer.unref?.();
  }

  #now(): number {
    return this.#sources.now?.() ?? Date.now();
  }

  #isoNow(): string {
    return new Date(this.#now()).toISOString();
  }
}

/** Most urgent first: an open card, running work, the usage limit, the last failure. */
export function activityKind(
  pendingRequests: number,
  working: boolean,
  limit: AgentActivityLimit | null,
  error: AgentActivityError | null,
): AgentActivityKind {
  if (pendingRequests > 0) return "waiting";
  if (working) return "working";
  if (limit) return "limited";
  if (error) return "error";
  return "idle";
}

/**
 * The Codex limit that blocks work now: a window at 100 % that has not reset yet.
 * With several, the one that resets last (the agent waits for all of them).
 */
export function exhaustedCodexLimit(usage: AccountUsage | null, nowMs: number): AgentActivityLimit | null {
  let found: AgentActivityLimit | null = null;
  for (const limit of usage?.limits ?? []) {
    for (const window of [limit.primary, limit.secondary]) {
      if (!window || window.usedPercent < 100) continue;
      if (window.resetsAt !== null && window.resetsAt * 1_000 <= nowMs) continue;
      const later =
        !found || (found.resetsAt !== null && (window.resetsAt === null || window.resetsAt > found.resetsAt));
      if (later) found = { provider: "codex", limitId: limit.id, resetsAt: window.resetsAt };
    }
  }
  return found;
}

/** The first non-empty line, at most `ACTIVITY_ERROR_MESSAGE_LIMIT` characters. */
export function activityErrorMessage(message: string): string {
  const line =
    message
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find(Boolean) ?? "The last turn failed.";
  return line.length > ACTIVITY_ERROR_MESSAGE_LIMIT ? `${line.slice(0, ACTIVITY_ERROR_MESSAGE_LIMIT - 1)}…` : line;
}

function sameActivityState(previous: AgentActivity, next: ActivityState): boolean {
  return (
    previous.kind === next.kind &&
    previous.pendingRequests === next.pendingRequests &&
    JSON.stringify(previous.limit) === JSON.stringify(next.limit) &&
    JSON.stringify(previous.error) === JSON.stringify(next.error)
  );
}
