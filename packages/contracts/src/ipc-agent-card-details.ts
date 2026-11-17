// COSGRAL W12 (BE-G): the detail of five agent cards that had no data of their own: Files, Folders, Usage, Publish and Advanced,
// and Notifications of one agent. The list of cards (`agentCards.overview`) stays ONE list with a count and a line per card; this file
// is what a card shows when it is opened: one read per card (`agentCards.details`), a union by `card`. Nothing here reaches a service
// outside this computer; "publish" is saving the agent as a TEMPLATE on this computer (the templates of the agent creator).

import type { AccessLevel } from "./ipc-access";
import { ACCESS_LEVELS } from "./ipc-access";
import type { AgentPreferences } from "./ipc-agent-cards";
import { isAgentPreferences } from "./ipc-agent-cards";
import {
  AGENT_TEMPLATE_LIMITS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  type NotificationMatrix,
} from "./ipc-agent-settings";
import type { BudgetStatus } from "./ipc-budgets";
import { LIBRARY_ORIGINS, type LibraryOrigin } from "./ipc-library";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const AGENT_DETAIL_CARD_IDS = ["files", "folders", "usage", "publish", "advanced", "notifications"] as const;
export type AgentDetailCardId = (typeof AGENT_DETAIL_CARD_IDS)[number];

export const AGENT_DETAIL_LIMITS = {
  /** Files listed in the Files card (newest first); `total` counts all of them. */
  files: 50,
} as const;

export interface AgentFileItem {
  id: string;
  name: string;
  size: number;
  origin: LibraryOrigin;
  createdAt: string;
}

export interface AgentFilesDetails {
  card: "files";
  items: AgentFileItem[];
  /** All files this agent saved in the library, also those not listed. */
  total: number;
  truncated: boolean;
}

export interface AgentFoldersDetails {
  card: "folders";
  /** The agent's own working folder. */
  workspace: string;
  level: AccessLevel;
  additional: string[];
  excluded: string[];
}

export interface AgentUsageDetails {
  card: "usage";
  /** The counter and the budget of this agent (a period of a day or a month); `budget` is null when none is set. */
  status: BudgetStatus;
}

export interface AgentPublishedTemplate {
  id: string;
  name: string;
  summary: string;
  createdAt: string | null;
}

export interface AgentPublishDetails {
  card: "publish";
  /** The template saved from this agent; null = not published. A template that was deleted elsewhere counts as not published. */
  template: AgentPublishedTemplate | null;
  /** How many saved templates there are and the most there may be, so the card can say "full". */
  savedTemplates: number;
  maxTemplates: number;
}

export interface AgentAdvancedDetails {
  card: "advanced";
  preferences: AgentPreferences;
  /** The agent has a provider session now (a reset would change something). */
  hasSession: boolean;
  /** Messages in the active thread. */
  messages: number;
}

export interface AgentNotificationsDetails {
  card: "notifications";
  level: AgentPreferences["notificationLevel"];
  /** The old per-agent switch (`notifications` of the profile): false = muted. */
  muted: boolean;
  /** What the app shows for each event (the app-wide matrix), so the card can explain what "all" means. */
  matrix: NotificationMatrix;
}

export type AgentCardDetails =
  | AgentFilesDetails
  | AgentFoldersDetails
  | AgentUsageDetails
  | AgentPublishDetails
  | AgentAdvancedDetails
  | AgentNotificationsDetails;

export interface AgentCardDetailsInput {
  botId: string;
  card: AgentDetailCardId;
}

export interface PublishAgentTemplateInput {
  botId: string;
  /** Default: the agent's name. */
  name?: string;
  summary?: string;
  includeMemories?: boolean;
}

export interface UnpublishAgentTemplateInput {
  botId: string;
}

// -- rules shared by the engine and the mock -------------------------------------------------------------------------------------

export function parseAgentCardDetailsInput(input: unknown): AgentCardDetailsInput {
  if (!isDynamicRecord(input) || !isString(input.botId) || input.botId.length === 0)
    throw new Error("Choose an agent.");
  if (!isOneOf(AGENT_DETAIL_CARD_IDS, input.card)) throw new Error("This card has no detail.");
  return { botId: input.botId, card: input.card };
}

export function parsePublishAgentTemplateInput(input: unknown): PublishAgentTemplateInput {
  if (!isDynamicRecord(input) || !isString(input.botId) || input.botId.length === 0)
    throw new Error("Choose an agent.");
  const out: PublishAgentTemplateInput = { botId: input.botId };
  if (input.name !== undefined) {
    const name = isString(input.name) ? input.name.trim() : "";
    if (name.length === 0 || name.length > AGENT_TEMPLATE_LIMITS.name) {
      throw new Error(`The template name has 1 to ${AGENT_TEMPLATE_LIMITS.name} characters.`);
    }
    out.name = name;
  }
  if (input.summary !== undefined) {
    if (!isString(input.summary) || input.summary.length > AGENT_TEMPLATE_LIMITS.summary) {
      throw new Error(`The summary has at most ${AGENT_TEMPLATE_LIMITS.summary} characters.`);
    }
    out.summary = input.summary.trim();
  }
  if (input.includeMemories !== undefined) {
    if (!isBoolean(input.includeMemories)) throw new Error("Keeping the memories is on or off.");
    out.includeMemories = input.includeMemories;
  }
  return out;
}

export function parseUnpublishAgentTemplateInput(input: unknown): UnpublishAgentTemplateInput {
  if (!isDynamicRecord(input) || !isString(input.botId) || input.botId.length === 0)
    throw new Error("Choose an agent.");
  return { botId: input.botId };
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isNotificationMatrix(value: unknown): value is NotificationMatrix {
  if (!isDynamicRecord(value)) return false;
  return NOTIFICATION_EVENTS.every((event) => {
    const row = value[event];
    return isDynamicRecord(row) && NOTIFICATION_CHANNELS.every((channel) => isBoolean(row[channel]));
  });
}

function isTemplate(value: unknown): value is AgentPublishedTemplate {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.summary) &&
    (value.createdAt === null || isString(value.createdAt))
  );
}

function isBudgetStatusLike(value: unknown): value is BudgetStatus {
  return (
    isDynamicRecord(value) &&
    isDynamicRecord(value.scope) &&
    isDynamicRecord(value.usage) &&
    isString(value.state) &&
    isBoolean(value.blocked) &&
    isBoolean(value.enforceable)
  );
}

export function isAgentCardDetails(value: unknown): value is AgentCardDetails {
  if (!isDynamicRecord(value) || !isOneOf(AGENT_DETAIL_CARD_IDS, value.card)) return false;
  switch (value.card) {
    case "files":
      return (
        Array.isArray(value.items) &&
        value.items.length <= AGENT_DETAIL_LIMITS.files &&
        value.items.every(
          (item) =>
            isDynamicRecord(item) &&
            isString(item.id) &&
            isString(item.name) &&
            isNonNegativeInteger(item.size) &&
            isOneOf(LIBRARY_ORIGINS, item.origin) &&
            isString(item.createdAt),
        ) &&
        isNonNegativeInteger(value.total) &&
        isBoolean(value.truncated)
      );
    case "folders":
      return (
        isString(value.workspace) &&
        isOneOf(ACCESS_LEVELS, value.level) &&
        isStringList(value.additional) &&
        isStringList(value.excluded)
      );
    case "usage":
      return isBudgetStatusLike(value.status);
    case "publish":
      return (
        (value.template === null || isTemplate(value.template)) &&
        isNonNegativeInteger(value.savedTemplates) &&
        isNonNegativeInteger(value.maxTemplates)
      );
    case "advanced":
      return (
        isAgentPreferences(value.preferences) && isBoolean(value.hasSession) && isNonNegativeInteger(value.messages)
      );
    case "notifications":
      return (
        isOneOf(["all", "mentions", "none"] as const, value.level) &&
        isBoolean(value.muted) &&
        isNotificationMatrix(value.matrix)
      );
    default:
      return false;
  }
}
