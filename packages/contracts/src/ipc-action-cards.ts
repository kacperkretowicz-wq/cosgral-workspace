// COSGRAL W1: chat cards that act in the user's name.
//
// Draft preview: before an agent sends something for the user (a message, an e-mail, a post),
// the chat shows the draft with Send / Edit / Keep draft. Nothing goes out without "send".
// Browser takeover: when a page needs a person (sign-in, CAPTCHA, passkey, payment), the agent
// asks the user to take over the tab; after "return" the agent continues in the same tab.
//
// The engine behind both cards follows the Tester's description W1-T1; field names are agreed here.
// Lead decision (W1): the draft preview and the confirm card are one card type with variants.

import { isDynamicRecord, isOneOf, isString } from "./runtime-values";

/** Field limits of the action cards, shared by the agent tools and the IPC parsers. */
export const ACTION_CARD_LIMITS = {
  title: 200,
  recipient: 300,
  channel: 60,
  preview: 20_000,
  feedback: 2_000,
  reason: 300,
  keptDrafts: 200,
} as const;

/**
 * "draft": something the agent sends in the user's name (a message, an e-mail); buttons Send / Edit / Keep draft.
 * "confirm": another outward action in the user's name (a post, a deletion, a payment); the same three decisions,
 * shown as Confirm / Edit / Cancel.
 */
export const DRAFT_PREVIEW_VARIANTS = ["draft", "confirm"] as const;
export type DraftPreviewVariant = (typeof DRAFT_PREVIEW_VARIANTS)[number];

export const DRAFT_PREVIEW_DECISIONS = ["send", "edit", "keep-draft"] as const;
/**
 * "send": approve exactly what the card shows, once, for these recipients. "edit": the agent revises it (see
 * `feedback` and `text`) and shows a new card. "keep-draft": nothing goes out; the draft is kept (see `KeptDraft`).
 */
export type DraftPreviewDecision = (typeof DRAFT_PREVIEW_DECISIONS)[number];

/** How a draft preview card ended; "expired": its turn ended or stopped first. */
export const DRAFT_PREVIEW_RESOLUTIONS = [...DRAFT_PREVIEW_DECISIONS, "expired"] as const;
export type DraftPreviewResolution = (typeof DRAFT_PREVIEW_RESOLUTIONS)[number];

export interface DraftPreviewCard {
  requestId: string;
  botId: string;
  threadId: string;
  turnId: string;
  variant: DraftPreviewVariant;
  /** The question on the card, e.g. "Send this e-mail to Anna?" */
  title: string;
  /** Who gets it (a name or an address), or null when the agent does not say. */
  recipient: string | null;
  /** Where it goes, e.g. "email", "slack", "channel"; null when the agent does not say. */
  channel: string | null;
  /** The draft text exactly as it would go out. */
  preview: string;
  /** Set when the agent reopens a kept draft (`KeptDraft.id`). */
  draftId: string | null;
  createdAt: string;
}

export interface RespondToDraftPreviewInput {
  requestId: string;
  decision: DraftPreviewDecision;
  /** With "edit": what to change, in the user's words. Optional. */
  feedback?: string;
  /** With "edit": the user's own new version of the text. The agent shows a new card before it goes out. */
  text?: string;
}

/** A draft the user kept unsent ("keep-draft"). It survives restarts until it is sent again or deleted. */
export interface KeptDraft {
  id: string;
  botId: string;
  threadId: string;
  variant: DraftPreviewVariant;
  title: string;
  recipient: string | null;
  channel: string | null;
  preview: string;
  keptAt: string;
}

export interface DeleteDraftInput {
  draftId: string;
}

/**
 * "requested": the card waits. "taken-over": the user controls the tab. "returned": the user gave
 * the tab back and the agent continues. "declined": the user said no. "expired": the turn ended first.
 */
export const BROWSER_TAKEOVER_PHASES = ["requested", "taken-over", "returned", "declined", "expired"] as const;
export type BrowserTakeoverPhase = (typeof BROWSER_TAKEOVER_PHASES)[number];

export interface BrowserTakeoverRequest {
  requestId: string;
  botId: string;
  threadId: string;
  turnId: string;
  /** Tab of the built-in browser (`BrowserTab.id`). */
  tabId: string;
  url: string;
  /** Why a person is needed, in one line, e.g. "Sign in to your bank". */
  reason: string;
  createdAt: string;
}

export const BROWSER_TAKEOVER_ACTIONS = ["take-over", "return", "decline"] as const;
/** "take-over": show the tab to the user. "return": give it back to the agent. "decline": the agent goes on without help. */
export type BrowserTakeoverAction = (typeof BROWSER_TAKEOVER_ACTIONS)[number];

export interface RespondToBrowserTakeoverInput {
  requestId: string;
  action: BrowserTakeoverAction;
}

export function isDraftPreviewResolution(value: unknown): value is DraftPreviewResolution {
  return isOneOf(DRAFT_PREVIEW_RESOLUTIONS, value);
}

export function isBrowserTakeoverPhase(value: unknown): value is BrowserTakeoverPhase {
  return isOneOf(BROWSER_TAKEOVER_PHASES, value);
}

export function isDraftPreviewCard(value: unknown): value is DraftPreviewCard {
  return (
    isDynamicRecord(value) &&
    isString(value.requestId) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isString(value.turnId) &&
    isOneOf(DRAFT_PREVIEW_VARIANTS, value.variant) &&
    isString(value.title) &&
    (value.recipient === null || isString(value.recipient)) &&
    (value.channel === null || isString(value.channel)) &&
    isString(value.preview) &&
    (value.draftId === null || isString(value.draftId)) &&
    isString(value.createdAt)
  );
}

export function isKeptDraft(value: unknown): value is KeptDraft {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isOneOf(DRAFT_PREVIEW_VARIANTS, value.variant) &&
    isString(value.title) &&
    (value.recipient === null || isString(value.recipient)) &&
    (value.channel === null || isString(value.channel)) &&
    isString(value.preview) &&
    isString(value.keptAt)
  );
}

export function isBrowserTakeoverRequest(value: unknown): value is BrowserTakeoverRequest {
  return (
    isDynamicRecord(value) &&
    isString(value.requestId) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isString(value.turnId) &&
    isString(value.tabId) &&
    isString(value.url) &&
    isString(value.reason) &&
    isString(value.createdAt)
  );
}
