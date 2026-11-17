// COSGRAL W12 (BE-D): the agent settings cards (contract: ipc-agent-cards.ts).
//   * The small per-agent choices (chat colour, what a message sent while the agent works does, quick acknowledgement, notification
//     level, new chats started by the agent, local scripts) live in one small JSON file next to the program's data.
//   * The overview asks the existing services for each card's count through the `counts` port; a card the port does not know is
//     still listed (available, no count), so the screen never has a hole.
//   * `steerSupported` is a fact of the agent's provider (the `steerSupported` port), never read from the file.
//   * `busyMode` is what the message queue asks when a message arrives while a turn runs.
//   * Resetting the provider session is the `resetSession` port (agent-service.ts owns the sessions); without it it is refused.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  AGENT_BUSY_MESSAGE_MODES,
  AGENT_CARD_IDS,
  AGENT_CARD_LIMITS,
  AGENT_CHAT_COLORS,
  AGENT_NOTIFICATION_LEVELS,
  type AgentBusyMessageMode,
  type AgentCardId,
  type AgentCardSummary,
  type AgentCardsBotInput,
  type AgentCardsOverview,
  type AgentEvent,
  type AgentPreferences,
  applyAgentPreferenceChanges,
  defaultAgentPreferences,
  effectiveBusyMessage,
  parseAgentCardsBotInput,
  parseUpdateAgentPreferencesInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isOneOf } from "@openbot/contracts/runtime-values";

export interface AgentCardCount {
  /** Left out = available. */
  available?: boolean;
  count?: number | null;
  /** Left out = the count as text, or "" without a count. */
  summary?: string;
}

export interface AgentCardsOptions {
  file: string;
  agentExists: (botId: string) => boolean;
  /** Whether the provider of the agent can take a message into a running turn. */
  steerSupported: (botId: string) => boolean;
  /** What the existing services know about the cards of an agent (memory count, folders, routines…). */
  counts?: (botId: string) => Partial<Record<AgentCardId, AgentCardCount>>;
  /** Forgets the provider session of the agent (the history stays); throws when it cannot be done now. */
  resetSession?: (botId: string) => Promise<void>;
  emit: (event: AgentEvent) => void;
}

type StoredPreferences = Omit<AgentPreferences, "botId" | "steerSupported">;

export class AgentCardsService {
  readonly #options: AgentCardsOptions;
  #stored: Record<string, StoredPreferences>;

  constructor(options: AgentCardsOptions) {
    this.#options = options;
    this.#stored = read(options.file);
  }

  overview(input: AgentCardsBotInput): AgentCardsOverview {
    const { botId } = this.#existing(input);
    const preferences = this.#preferences(botId);
    const known = this.#options.counts?.(botId) ?? {};
    const own: Partial<Record<AgentCardId, string>> = {
      "chat-color": preferences.chatColor,
      advanced: preferences.busyMessage,
      notifications: preferences.notificationLevel,
    };
    return {
      botId,
      cards: AGENT_CARD_IDS.map((id): AgentCardSummary => {
        const card = known[id];
        const count = card?.count ?? null;
        const summary = card?.summary ?? (count === null ? (own[id] ?? "") : String(count));
        return {
          id,
          available: card?.available ?? true,
          count,
          summary: summary.slice(0, AGENT_CARD_LIMITS.summary),
        };
      }),
    };
  }

  getPreferences(input: AgentCardsBotInput): AgentPreferences {
    return this.#preferences(this.#existing(input).botId);
  }

  updatePreferences(raw: unknown): AgentPreferences {
    const changes = parseUpdateAgentPreferencesInput(raw);
    this.#existing(changes);
    const before = this.#preferences(changes.botId);
    const after = applyAgentPreferenceChanges(before, changes);
    if (JSON.stringify(after) === JSON.stringify(before)) return before;
    const { botId: _botId, steerSupported: _steer, ...stored } = after;
    this.#stored[changes.botId] = stored;
    this.#save();
    this.#options.emit({ type: "agent-preferences-changed", preferences: after });
    return after;
  }

  async resetSession(input: AgentCardsBotInput): Promise<AgentCardsOverview> {
    const { botId } = this.#existing(input);
    if (!this.#options.resetSession) throw new Error("The session of this agent cannot be reset here.");
    await this.#options.resetSession(botId);
    return this.overview({ botId });
  }

  /** What a message sent while this agent works does: "steer" only when the agent chose it and its provider can steer. */
  busyMode(botId: string, appDefault: Exclude<AgentBusyMessageMode, "app-default">): "queue" | "steer" {
    if (!this.#options.agentExists(botId)) return "queue";
    return effectiveBusyMessage(this.#preferences(botId), appDefault);
  }

  /** Agents that are gone lose their choices (one write when any went). */
  prune(existing: readonly string[]): void {
    const gone = Object.keys(this.#stored).filter((botId) => !existing.includes(botId));
    if (gone.length === 0) return;
    for (const botId of gone) delete this.#stored[botId];
    this.#save();
  }

  /** The agent was deleted: its choices go with it. */
  forget(botId: string): void {
    if (!(botId in this.#stored)) return;
    delete this.#stored[botId];
    this.#save();
  }

  #existing<T extends { botId: string }>(input: T): T {
    const { botId } = parseAgentCardsBotInput(input);
    if (!this.#options.agentExists(botId)) throw new Error("This agent does not exist.");
    return input;
  }

  #preferences(botId: string): AgentPreferences {
    return {
      ...defaultAgentPreferences(botId),
      ...this.#stored[botId],
      botId,
      steerSupported: this.#options.steerSupported(botId),
    };
  }

  #save(): void {
    mkdirSync(dirname(this.#options.file), { recursive: true });
    const temporary = `${this.#options.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.#stored, null, 2));
    renameSync(temporary, this.#options.file);
  }
}

/** Reads the file; a damaged file or a value that is not valid falls back to the default of that field. */
function read(file: string): Record<string, StoredPreferences> {
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
  if (!isDynamicRecord(parsed)) return {};
  const base = defaultAgentPreferences("");
  const out: Record<string, StoredPreferences> = {};
  for (const [botId, value] of Object.entries(parsed)) {
    if (!isDynamicRecord(value)) continue;
    out[botId] = {
      chatColor: isOneOf(AGENT_CHAT_COLORS, value.chatColor) ? value.chatColor : base.chatColor,
      busyMessage: isOneOf(AGENT_BUSY_MESSAGE_MODES, value.busyMessage) ? value.busyMessage : base.busyMessage,
      quickAcknowledgement: isBoolean(value.quickAcknowledgement)
        ? value.quickAcknowledgement
        : base.quickAcknowledgement,
      notificationLevel: isOneOf(AGENT_NOTIFICATION_LEVELS, value.notificationLevel)
        ? value.notificationLevel
        : base.notificationLevel,
      agentStartsNewChats: isBoolean(value.agentStartsNewChats) ? value.agentStartsNewChats : base.agentStartsNewChats,
      localScripts: isBoolean(value.localScripts) ? value.localScripts : base.localScripts,
    };
  }
  return out;
}
