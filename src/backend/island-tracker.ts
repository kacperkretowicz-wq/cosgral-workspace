// COSGRAL W3: the state of the Dynamic Island. It reads the open Needs you cards and the agent rows, follows new
// replies, and keeps the one most urgent state: takeover > approval > question > error > message > working.
// No Electron here; the host gives the window focus and receives every change.

import {
  type AgentActivity,
  type AgentApproval,
  type AgentEvent,
  ISLAND_STATUS_KINDS,
  ISLAND_SUMMARY_LIMIT,
  type IslandRequestRef,
  type IslandState,
  type IslandStatus,
  type IslandStatusKind,
  type PendingAgentRequest,
} from "@openbot/contracts/ipc";

export interface IslandTrackerOptions {
  listBots: () => ReadonlyArray<{ id: string; name: string }>;
  listPending: () => PendingAgentRequest[];
  listActivity: () => AgentActivity[];
  mainWindowFocused: () => boolean;
  enabled: () => boolean;
  emit: (state: IslandState) => void;
  now?: () => Date;
}

/** What a click on the island opens. */
export interface IslandTarget {
  botId: string;
  request: IslandRequestRef | null;
}

interface NewMessage {
  summary: string;
  since: string;
}

/** Events that can change what the island shows. */
const REFRESH_EVENTS = new Set<AgentEvent["type"]>([
  "activity-changed",
  "bots-changed",
  "approval",
  "approval-resolved",
  "prompt-resolved",
  "draft-preview",
  "draft-preview-resolved",
  "browser-takeover",
  "browser-takeover-changed",
  "vault-request",
  "vault-request-resolved",
  "turn-started",
]);

export class IslandTracker {
  readonly #options: IslandTrackerOptions;
  readonly #now: () => Date;
  /** Last completed message per agent; an agent without an entry has not been seen yet. */
  readonly #lastMessageIds = new Map<string, string | null>();
  readonly #messages = new Map<string, NewMessage>();
  /** Errors the person dismissed, by `AgentActivityError.at`. */
  readonly #dismissedErrors = new Map<string, string>();
  #state: IslandState;

  constructor(options: IslandTrackerOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
    this.#state = this.#compute();
  }

  state(): IslandState {
    return structuredClone(this.#state);
  }

  observe(event: AgentEvent): void {
    if (event.type === "conversation") {
      this.#observeConversation(event.snapshot.botId, event.snapshot.messages);
      this.refresh();
      return;
    }
    if (REFRESH_EVENTS.has(event.type) || event.type.endsWith("-resolved")) this.refresh();
  }

  /** Reads cards and agent rows again; emits when the state changed. */
  refresh(): void {
    const next = this.#compute();
    if (JSON.stringify(next) === JSON.stringify(this.#state)) return;
    this.#state = next;
    this.#options.emit(this.state());
  }

  /** The main window got focus: the person sees new replies there. */
  mainWindowFocused(): void {
    if (this.#messages.size === 0) return;
    this.#messages.clear();
    this.refresh();
  }

  /** Hides the shown "message" or "error" until something new happens. */
  dismiss(): void {
    const status = this.#state.status;
    if (status?.kind === "message") this.#messages.delete(status.botId);
    if (status?.kind === "error") this.#dismissedErrors.set(status.botId, status.since);
    this.refresh();
  }

  /** The click: what to open. A shown message counts as read. */
  activate(): IslandTarget | null {
    const status = this.#state.status;
    if (!status) return null;
    if (status.kind === "message") {
      this.#messages.delete(status.botId);
      this.refresh();
    }
    return { botId: status.botId, request: status.request };
  }

  #observeConversation(
    botId: string,
    messages: ReadonlyArray<{ id: string; author: string; text: string; status: string }>,
  ): void {
    const last = [...messages].reverse().find((message) => message.status === "completed");
    const lastId = last?.id ?? null;
    const seen = this.#lastMessageIds.has(botId);
    const previous = this.#lastMessageIds.get(botId) ?? null;
    this.#lastMessageIds.set(botId, lastId);
    if (!seen || !last || lastId === previous || last.author === "user") return;
    if (this.#options.mainWindowFocused()) return;
    this.#messages.set(botId, { summary: firstLine(last.text), since: this.#now().toISOString() });
  }

  #compute(): IslandState {
    const names = new Map(this.#options.listBots().map((bot) => [bot.id, bot.name]));
    const pending = this.#options.listPending().filter((request) => names.has(requestBotId(request)));
    const activities = this.#options.listActivity().filter((activity) => names.has(activity.botId));
    const candidates: IslandStatus[] = [];
    for (const request of pending) candidates.push(cardStatus(request, names));
    for (const activity of activities) {
      const error = activity.error;
      if (error && this.#dismissedErrors.get(activity.botId) !== error.at) {
        candidates.push(status("error", activity.botId, names, error.message, null, error.at));
      }
    }
    for (const [botId, message] of this.#messages) {
      if (names.has(botId)) candidates.push(status("message", botId, names, message.summary, null, message.since));
    }
    for (const activity of activities) {
      if (activity.kind === "working") {
        candidates.push(status("working", activity.botId, names, "Working", null, activity.updatedAt));
      }
    }
    return {
      enabled: this.#options.enabled(),
      status: mostUrgent(candidates),
      waiting: pending.length,
      working: activities.filter((activity) => activity.kind === "working").length,
    };
  }
}

/** Candidates keep their order (cards oldest first), so the oldest of the most urgent kind wins. */
function mostUrgent(candidates: IslandStatus[]): IslandStatus | null {
  for (const kind of ISLAND_STATUS_KINDS) {
    const found = candidates.find((candidate) => candidate.kind === kind);
    if (found) return found;
  }
  return null;
}

function cardStatus(request: PendingAgentRequest, names: Map<string, string>): IslandStatus {
  switch (request.kind) {
    case "browser-takeover":
      return status(
        "takeover",
        request.request.botId,
        names,
        request.request.reason,
        { kind: request.kind, requestId: request.request.requestId },
        request.request.createdAt,
      );
    case "approval":
      return status(
        "approval",
        request.approval.botId,
        names,
        approvalSummary(request.approval),
        { kind: request.kind, requestId: request.approval.requestId },
        request.createdAt,
      );
    case "draft-preview":
      return status(
        "approval",
        request.card.botId,
        names,
        request.card.title,
        { kind: request.kind, requestId: request.card.requestId },
        request.card.createdAt,
      );
    case "vault-request":
      return status(
        "approval",
        request.request.botId,
        names,
        request.request.reason,
        { kind: request.kind, requestId: request.request.requestId },
        request.request.createdAt,
      );
    case "prompt":
      return status(
        "question",
        request.botId,
        names,
        request.questions[0]?.question ?? "Question",
        { kind: request.kind, requestId: request.requestId },
        request.createdAt,
      );
  }
}

function requestBotId(request: PendingAgentRequest): string {
  switch (request.kind) {
    case "browser-takeover":
    case "vault-request":
      return request.request.botId;
    case "approval":
      return request.approval.botId;
    case "draft-preview":
      return request.card.botId;
    case "prompt":
      return request.botId;
  }
}

function approvalSummary(approval: AgentApproval): string {
  return approval.reason ?? approval.command ?? `Allow ${approval.kind}?`;
}

function status(
  kind: IslandStatusKind,
  botId: string,
  names: Map<string, string>,
  summary: string,
  request: IslandRequestRef | null,
  since: string,
): IslandStatus {
  return { kind, botId, botName: names.get(botId) ?? botId, summary: shorten(firstLine(summary)), request, since };
}

function firstLine(text: string): string {
  return (text.split(/\r?\n/).find((line) => line.trim()) ?? "").trim();
}

function shorten(text: string): string {
  return text.length <= ISLAND_SUMMARY_LIMIT ? text : `${text.slice(0, ISLAND_SUMMARY_LIMIT - 1)}…`;
}
