// COSGRAL W11 (BE-B): what the cards of the agent settings still need. Most card data already has a home (memory, skills, routines,
// tables, budgets/usage, access, isolation, providers.getFallbackInfo, library). Added here is only what was missing:
//   * one overview read: the cards of one agent with a count or a short line each, so the screen opens without a dozen reads;
//   * the small per-agent choices of the "Chat", "Advanced" and "Notifications" cards: chat colour, what a message sent while
//     the agent works does (queue or steer), the quick acknowledgement, the notification level, new chats started by the agent,
//     the local scripts switch;
//   * a reset of the provider session (the history stays).
//
// This computer only. Nothing here reaches a service.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const AGENT_CARD_IDS = [
  "chat-color",
  "instructions",
  "memory",
  "skills",
  "files",
  "tables",
  "routines",
  "usage",
  "publish",
  "permissions",
  "advanced",
  "folders",
  "notifications",
  "backup-models",
] as const;
export type AgentCardId = (typeof AGENT_CARD_IDS)[number];

export const AGENT_CHAT_COLORS = ["default", "blue", "green", "amber", "red", "violet", "pink", "teal"] as const;
export type AgentChatColor = (typeof AGENT_CHAT_COLORS)[number];

/** What a message sent while the agent works does. "app-default" follows the app setting. */
export const AGENT_BUSY_MESSAGE_MODES = ["app-default", "queue", "steer"] as const;
export type AgentBusyMessageMode = (typeof AGENT_BUSY_MESSAGE_MODES)[number];

export const AGENT_NOTIFICATION_LEVELS = ["all", "mentions", "none"] as const;
export type AgentNotificationLevel = (typeof AGENT_NOTIFICATION_LEVELS)[number];

export const AGENT_CARD_LIMITS = {
  /** The short line under a card title. */
  summary: 120,
} as const;

export interface AgentCardSummary {
  id: AgentCardId;
  /** False when the card cannot work here (a reason is in `summary`). */
  available: boolean;
  /** How many things the card holds (memories, skills, folders, routines…); null when a count makes no sense (colour, advanced). */
  count: number | null;
  /** One short line (at most AGENT_CARD_LIMITS.summary characters): "3 folders", "Queue", "Off". */
  summary: string;
}

export interface AgentCardsOverview {
  botId: string;
  /** Every card of AGENT_CARD_IDS once, in that order. */
  cards: AgentCardSummary[];
}

/** The small per-agent choices; each has a default so an agent that never saved anything still reads fine. */
export interface AgentPreferences {
  botId: string;
  chatColor: AgentChatColor;
  busyMessage: AgentBusyMessageMode;
  /** False when the provider of the agent cannot steer a running turn: "steer" then waits in the queue (the screen says so). */
  steerSupported: boolean;
  /** A short "got it" line shown at once when a message arrives while the agent works. */
  quickAcknowledgement: boolean;
  notificationLevel: AgentNotificationLevel;
  /** The agent may start a new chat when its chat gets long (it saves notes first). */
  agentStartsNewChats: boolean;
  /** Scripts on this computer may message this agent, run its routines and answer its questions. */
  localScripts: boolean;
}

export type AgentPreferenceChanges = Partial<Omit<AgentPreferences, "botId" | "steerSupported">>;

export interface UpdateAgentPreferencesInput extends AgentPreferenceChanges {
  botId: string;
}

export interface AgentCardsBotInput {
  botId: string;
}

/** `window.openbot.agentCards` (this computer only). */
export interface AgentCardsDesktopApi {
  overview: (input: AgentCardsBotInput) => Promise<AgentCardsOverview>;
  getPreferences: (input: AgentCardsBotInput) => Promise<AgentPreferences>;
  /** Fields left out stay; sends `agent-preferences-changed`. */
  updatePreferences: (input: UpdateAgentPreferencesInput) => Promise<AgentPreferences>;
  /** Forgets the provider session of the agent: the next message starts a fresh context. The history stays. */
  resetSession: (input: AgentCardsBotInput) => Promise<AgentCardsOverview>;
}

/** Event `agent-preferences-changed`: the whole preferences of one agent. */
export interface AgentPreferencesChanged {
  preferences: AgentPreferences;
}

// -- rules shared by the engine and the mock -------------------------------------------------------------------------------------

export function defaultAgentPreferences(botId: string): AgentPreferences {
  return {
    botId,
    chatColor: "default",
    busyMessage: "app-default",
    steerSupported: true,
    quickAcknowledgement: false,
    notificationLevel: "all",
    agentStartsNewChats: false,
    localScripts: false,
  };
}

export function parseAgentCardsBotInput(input: unknown): AgentCardsBotInput {
  if (!isDynamicRecord(input) || !isString(input.botId) || input.botId.length === 0)
    throw new Error("Choose an agent.");
  return { botId: input.botId };
}

export function parseUpdateAgentPreferencesInput(input: unknown): UpdateAgentPreferencesInput {
  const { botId } = parseAgentCardsBotInput(input);
  if (!isDynamicRecord(input)) throw new Error("Choose an agent.");
  const out: UpdateAgentPreferencesInput = { botId };
  if (input.chatColor !== undefined) {
    if (!isOneOf(AGENT_CHAT_COLORS, input.chatColor)) throw new Error("This chat colour is not known.");
    out.chatColor = input.chatColor;
  }
  if (input.busyMessage !== undefined) {
    if (!isOneOf(AGENT_BUSY_MESSAGE_MODES, input.busyMessage))
      throw new Error("Choose queue, steer or the app default.");
    out.busyMessage = input.busyMessage;
  }
  if (input.notificationLevel !== undefined) {
    if (!isOneOf(AGENT_NOTIFICATION_LEVELS, input.notificationLevel)) throw new Error("Choose all, mentions or none.");
    out.notificationLevel = input.notificationLevel;
  }
  for (const key of ["quickAcknowledgement", "agentStartsNewChats", "localScripts"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (!isBoolean(value)) throw new Error(`"${key}" is on or off.`);
    out[key] = value;
  }
  if (Object.keys(out).length === 1) throw new Error("Nothing to change.");
  return out;
}

/** Applies the changes; `steerSupported` is a fact of the provider and is never taken from the person. */
export function applyAgentPreferenceChanges(
  current: AgentPreferences,
  changes: UpdateAgentPreferencesInput,
): AgentPreferences {
  const { botId: _botId, ...fields } = changes;
  return { ...current, ...fields };
}

/** The mode a message sent while the agent works really gets: steer needs a provider that can steer; the app default is given. */
export function effectiveBusyMessage(
  preferences: Pick<AgentPreferences, "busyMessage" | "steerSupported">,
  appDefault: Exclude<AgentBusyMessageMode, "app-default">,
): Exclude<AgentBusyMessageMode, "app-default"> {
  const wanted = preferences.busyMessage === "app-default" ? appDefault : preferences.busyMessage;
  return wanted === "steer" && !preferences.steerSupported ? "queue" : wanted;
}

export function isAgentCardSummary(value: unknown): value is AgentCardSummary {
  return (
    isDynamicRecord(value) &&
    isOneOf(AGENT_CARD_IDS, value.id) &&
    isBoolean(value.available) &&
    (value.count === null || (isNumber(value.count) && Number.isInteger(value.count) && value.count >= 0)) &&
    isString(value.summary) &&
    value.summary.length <= AGENT_CARD_LIMITS.summary
  );
}

export function isAgentCardsOverview(value: unknown): value is AgentCardsOverview {
  if (!isDynamicRecord(value) || !isString(value.botId) || !Array.isArray(value.cards)) return false;
  if (!value.cards.every(isAgentCardSummary)) return false;
  return value.cards.map((card) => card.id).join() === AGENT_CARD_IDS.join();
}

export function isAgentPreferences(value: unknown): value is AgentPreferences {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isOneOf(AGENT_CHAT_COLORS, value.chatColor) &&
    isOneOf(AGENT_BUSY_MESSAGE_MODES, value.busyMessage) &&
    isBoolean(value.steerSupported) &&
    isBoolean(value.quickAcknowledgement) &&
    isOneOf(AGENT_NOTIFICATION_LEVELS, value.notificationLevel) &&
    isBoolean(value.agentStartsNewChats) &&
    isBoolean(value.localScripts)
  );
}

export function isAgentPreferencesChanged(
  value: unknown,
): value is AgentPreferencesChanged & { type: "agent-preferences-changed" } {
  return isDynamicRecord(value) && value.type === "agent-preferences-changed" && isAgentPreferences(value.preferences);
}
