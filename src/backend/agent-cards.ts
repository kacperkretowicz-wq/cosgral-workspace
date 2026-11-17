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
  type AccessLevel,
  AGENT_BUSY_MESSAGE_MODES,
  AGENT_CARD_IDS,
  AGENT_CARD_LIMITS,
  AGENT_CHAT_COLORS,
  AGENT_DETAIL_LIMITS,
  AGENT_NOTIFICATION_LEVELS,
  type AgentBusyMessageMode,
  type AgentCardDetails,
  type AgentCardId,
  type AgentCardSummary,
  type AgentCardsBotInput,
  type AgentCardsOverview,
  type AgentEvent,
  type AgentFileItem,
  type AgentPreferences,
  type AgentPublishDetails,
  type AgentPublishedTemplate,
  applyAgentPreferenceChanges,
  type BudgetStatus,
  defaultAgentPreferences,
  effectiveBusyMessage,
  type NotificationMatrix,
  type PublishAgentTemplateInput,
  parseAgentCardDetailsInput,
  parseAgentCardsBotInput,
  parsePublishAgentTemplateInput,
  parseUnpublishAgentTemplateInput,
  parseUpdateAgentPreferencesInput,
} from "@openbot/contracts/ipc";
import { isBoolean, isDynamicRecord, isOneOf, isString } from "@openbot/contracts/runtime-values";

export interface AgentCardCount {
  /** Left out = available. */
  available?: boolean;
  count?: number | null;
  /** Left out = the count as text, or "" without a count. */
  summary?: string;
}

/** The services that own the data of the cards that open with a detail (the engine only asks, it never copies their data). */
export interface AgentCardDetailPorts {
  /** The files this agent saved in the library, newest first, at most `limit`, and how many there are in all. */
  files: (botId: string, limit: number) => { items: AgentFileItem[]; total: number };
  folders: (botId: string) => { workspace: string; level: AccessLevel; additional: string[]; excluded: string[] };
  usage: (botId: string) => BudgetStatus;
  advanced: (botId: string) => Promise<{ hasSession: boolean; messages: number }>;
  notifications: (botId: string) => { muted: boolean; matrix: NotificationMatrix };
  /** The templates of the agent creator; without it the Publish card is not available. */
  templates?: {
    find: (templateId: string) => AgentPublishedTemplate | null;
    count: () => number;
    max: number;
    save: (botId: string, input: Omit<PublishAgentTemplateInput, "botId">) => Promise<AgentPublishedTemplate>;
    remove: (templateId: string) => void;
  };
}

export interface AgentCardsOptions {
  file: string;
  /** Where "this agent was saved as that template" is kept; left out = not kept over a restart. */
  publishedFile?: string;
  details?: AgentCardDetailPorts;
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
  /** botId -> id of the template saved from that agent. */
  #published: Record<string, string>;

  constructor(options: AgentCardsOptions) {
    this.#options = options;
    this.#stored = read(options.file);
    this.#published = options.publishedFile ? readPublished(options.publishedFile) : {};
  }

  /** What a card shows when it is opened; each card asks the service that owns its data. */
  async details(raw: unknown): Promise<AgentCardDetails> {
    const { botId, card } = parseAgentCardDetailsInput(raw);
    this.#existing({ botId });
    const ports = this.#options.details;
    if (!ports) throw new Error("The detail of this card is not available here.");
    switch (card) {
      case "files": {
        const { items, total } = ports.files(botId, AGENT_DETAIL_LIMITS.files);
        const listed = items.slice(0, AGENT_DETAIL_LIMITS.files);
        return { card, items: listed, total, truncated: total > listed.length };
      }
      case "folders":
        return { card, ...ports.folders(botId) };
      case "usage":
        return { card, status: ports.usage(botId) };
      case "publish":
        return this.#publishState(botId);
      case "advanced":
        return { card, preferences: this.#preferences(botId), ...(await ports.advanced(botId)) };
      case "notifications":
        return { card, level: this.#preferences(botId).notificationLevel, ...ports.notifications(botId) };
    }
  }

  /** Saves this agent as a template of the agent creator; an older template made from the same agent is replaced. */
  async publishTemplate(raw: unknown): Promise<AgentPublishDetails> {
    const input = parsePublishAgentTemplateInput(raw);
    this.#existing({ botId: input.botId });
    const templates = this.#templatesPort();
    const { botId, ...fields } = input;
    const previous = this.#published[botId];
    const saved = await templates.save(botId, fields);
    if (previous && previous !== saved.id) templates.remove(previous);
    this.#published[botId] = saved.id;
    this.#savePublished();
    return this.#publishState(botId);
  }

  async unpublishTemplate(raw: unknown): Promise<AgentPublishDetails> {
    const { botId } = parseUnpublishAgentTemplateInput(raw);
    this.#existing({ botId });
    const templates = this.#templatesPort();
    const id = this.#published[botId];
    if (id) {
      templates.remove(id);
      delete this.#published[botId];
      this.#savePublished();
    }
    return this.#publishState(botId);
  }

  #templatesPort(): NonNullable<AgentCardDetailPorts["templates"]> {
    const templates = this.#options.details?.templates;
    if (!templates) throw new Error("Saving this agent as a template is not available here.");
    return templates;
  }

  /** The template saved from this agent, if it still exists; a template deleted elsewhere counts as "not published". */
  #publishState(botId: string): AgentPublishDetails {
    const templates = this.#templatesPort();
    const id = this.#published[botId];
    const template = id ? templates.find(id) : null;
    if (id && !template) {
      delete this.#published[botId];
      this.#savePublished();
    }
    return { card: "publish", template, savedTemplates: templates.count(), maxTemplates: templates.max };
  }

  #savePublished(): void {
    const file = this.#options.publishedFile;
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.#published, null, 2));
    renameSync(temporary, file);
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
    const templates = this.#options.details?.templates;
    const publishedId = this.#published[botId];
    const publishedTemplate = templates && publishedId ? templates.find(publishedId) : null;
    return {
      botId,
      cards: AGENT_CARD_IDS.map((id): AgentCardSummary => {
        if (id === "publish") {
          return {
            id,
            available: Boolean(templates),
            count: null,
            summary: !templates
              ? "Not available in this build"
              : publishedTemplate
                ? `Saved as a template: ${publishedTemplate.name}`.slice(0, AGENT_CARD_LIMITS.summary)
                : "Not saved as a template",
          };
        }
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

/** Reads the botId -> template id file; a damaged file or an entry that is not text is ignored. */
function readPublished(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
  if (!isDynamicRecord(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [botId, id] of Object.entries(parsed)) if (isString(id) && id.length > 0) out[botId] = id;
  return out;
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
