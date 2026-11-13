// COSGRAL W1: what needs the user, and what each agent row shows.
//
// Open cards (questions, approvals, draft previews, browser takeovers) live in the backend
// until they are resolved. A window that reloads reads them again with
// `agent.listPendingRequests()`, and every window drops a card when its `*-resolved` event
// arrives: answered here, answered in another window, or expired with its turn.

import type { BrowserTakeoverPhase, BrowserTakeoverRequest, DraftPreviewCard } from "./ipc-action-cards";
import type { AgentApproval, AgentPromptQuestion, AgentProviderId } from "./ipc-conversation";
import { isVaultRequest, type VaultRequest } from "./ipc-vault";
import { isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

/** An open question card; the same fields as the `prompt` event. */
export interface PendingAgentPrompt {
  kind: "prompt";
  requestId: string | number;
  botId: string;
  threadId: string;
  turnId: string;
  questions: AgentPromptQuestion[];
  createdAt: string;
}

/** An open approval card; the same approval as the `approval` event. */
export interface PendingAgentApproval {
  kind: "approval";
  approval: AgentApproval;
  createdAt: string;
}

/** An open draft preview card (Send / Edit / Keep draft). */
export interface PendingDraftPreview {
  kind: "draft-preview";
  card: DraftPreviewCard;
}

/** An open browser takeover: asked for, or the user controls the tab right now. */
export interface PendingBrowserTakeover {
  kind: "browser-takeover";
  request: BrowserTakeoverRequest;
  phase: Extract<BrowserTakeoverPhase, "requested" | "taken-over">;
}

/** COSGRAL W2: an agent needs a Vault item: add a missing one, or choose between matches. */
export interface PendingVaultRequest {
  kind: "vault-request";
  request: VaultRequest;
}

/** Everything that waits for the user, oldest first. */
export type PendingAgentRequest =
  | PendingAgentPrompt
  | PendingAgentApproval
  | PendingDraftPreview
  | PendingBrowserTakeover
  | PendingVaultRequest;

export const PENDING_AGENT_REQUEST_KINDS = [
  "prompt",
  "approval",
  "draft-preview",
  "browser-takeover",
  "vault-request",
] as const;
export type PendingAgentRequestKind = (typeof PENDING_AGENT_REQUEST_KINDS)[number];

export function isPendingAgentRequestKind(value: unknown): value is PendingAgentRequestKind {
  return isOneOf(PENDING_AGENT_REQUEST_KINDS, value);
}

/** How a question card ended. "skipped": answered with no answers. "expired": its turn ended or stopped first. */
export const PROMPT_RESOLUTIONS = ["answered", "skipped", "expired"] as const;
export type PromptResolution = (typeof PROMPT_RESOLUTIONS)[number];

/** How an approval card ended. "expired": its turn ended or stopped first. */
export const APPROVAL_RESOLUTIONS = ["accepted", "declined", "expired"] as const;
export type ApprovalResolution = (typeof APPROVAL_RESOLUTIONS)[number];

/**
 * What an agent row shows, most urgent first:
 * waiting (an open card) > working (a turn runs) > limited (usage limit) > error (last work failed) > idle.
 */
export const AGENT_ACTIVITY_KINDS = ["waiting", "working", "limited", "error", "idle"] as const;
export type AgentActivityKind = (typeof AGENT_ACTIVITY_KINDS)[number];

/** The provider account of this agent is at its usage limit. */
export interface AgentActivityLimit {
  provider: AgentProviderId;
  /** Limit id from `AccountUsage.limits[].id`, e.g. "codex". */
  limitId: string;
  /** When the limit resets: Unix seconds, like `AccountUsageWindow.resetsAt`; null when unknown. */
  resetsAt: number | null;
}

/** The last work of this agent failed. Cleared after its next successful turn. */
export interface AgentActivityError {
  code: string;
  /** One short line for the row tooltip, at most `ACTIVITY_ERROR_MESSAGE_LIMIT` characters. */
  message: string;
  at: string;
}

export const ACTIVITY_ERROR_MESSAGE_LIMIT = 200;

export interface AgentActivity {
  botId: string;
  kind: AgentActivityKind;
  /** Open cards of this agent (all kinds of `PendingAgentRequest`). */
  pendingRequests: number;
  /** Set while the limit lasts, also when `kind` shows something more urgent. Codex only for now. */
  limit: AgentActivityLimit | null;
  /** Set until the next successful turn, also when `kind` shows something more urgent. */
  error: AgentActivityError | null;
  updatedAt: string;
}

export function isPromptResolution(value: unknown): value is PromptResolution {
  return isOneOf(PROMPT_RESOLUTIONS, value);
}

export function isApprovalResolution(value: unknown): value is ApprovalResolution {
  return isOneOf(APPROVAL_RESOLUTIONS, value);
}

export function isRequestId(value: unknown): value is string | number {
  return isString(value) || isNumber(value);
}

function isActivityLimit(value: unknown): value is AgentActivityLimit {
  return (
    isDynamicRecord(value) &&
    isOneOf(["codex", "claude"], value.provider) &&
    isString(value.limitId) &&
    (value.resetsAt === null || isNumber(value.resetsAt))
  );
}

function isActivityError(value: unknown): value is AgentActivityError {
  return isDynamicRecord(value) && isString(value.code) && isString(value.message) && isString(value.at);
}

export function isAgentActivity(value: unknown): value is AgentActivity {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isOneOf(AGENT_ACTIVITY_KINDS, value.kind) &&
    isNumber(value.pendingRequests) &&
    (value.limit === null || isActivityLimit(value.limit)) &&
    (value.error === null || isActivityError(value.error)) &&
    isString(value.updatedAt)
  );
}

export function isPendingAgentRequest(value: unknown): value is PendingAgentRequest {
  if (!isDynamicRecord(value)) return false;
  switch (value.kind) {
    case "prompt":
      return (
        isRequestId(value.requestId) &&
        isString(value.botId) &&
        isString(value.threadId) &&
        isString(value.turnId) &&
        Array.isArray(value.questions) &&
        isString(value.createdAt)
      );
    case "approval":
      return (
        isDynamicRecord(value.approval) &&
        isRequestId(value.approval.requestId) &&
        isString(value.approval.botId) &&
        isString(value.createdAt)
      );
    case "draft-preview":
      return isDynamicRecord(value.card) && isString(value.card.requestId) && isString(value.card.botId);
    case "browser-takeover":
      return (
        isDynamicRecord(value.request) &&
        isString(value.request.requestId) &&
        isString(value.request.botId) &&
        isOneOf(["requested", "taken-over"], value.phase)
      );
    case "vault-request":
      return isVaultRequest(value.request);
    default:
      return false;
  }
}
