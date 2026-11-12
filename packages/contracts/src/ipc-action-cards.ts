// COSGRAL W1: chat cards that act in the user's name.
//
// Draft preview: before an agent sends something for the user (a message, an e-mail, a post),
// the chat shows the draft with Send / Edit / Keep draft. Nothing goes out without "send".
// Browser takeover: when a page needs a person (sign-in, CAPTCHA, passkey, payment), the agent
// asks the user to take over the tab; after "return" the agent continues in the same tab.
//
// The engine behind both cards follows the Tester's description W1-T1; field names are agreed here.

import { isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const DRAFT_PREVIEW_DECISIONS = ["send", "edit", "keep-draft"] as const;
/** "send": send as shown. "edit": the agent revises it (see `feedback`). "keep-draft": keep it unsent. */
export type DraftPreviewDecision = (typeof DRAFT_PREVIEW_DECISIONS)[number];

/** How a draft preview card ended; "expired": its turn ended or stopped first. */
export const DRAFT_PREVIEW_RESOLUTIONS = [...DRAFT_PREVIEW_DECISIONS, "expired"] as const;
export type DraftPreviewResolution = (typeof DRAFT_PREVIEW_RESOLUTIONS)[number];

export interface DraftPreviewCard {
  requestId: string;
  botId: string;
  threadId: string;
  turnId: string;
  /** The question on the card, e.g. "Send this e-mail to Anna?" */
  title: string;
  /** Who gets it (a name or an address), or null when the agent does not say. */
  recipient: string | null;
  /** Where it goes, e.g. "email", "slack", "channel"; null when the agent does not say. */
  channel: string | null;
  /** The draft text exactly as it would go out. */
  preview: string;
  createdAt: string;
}

export interface RespondToDraftPreviewInput {
  requestId: string;
  decision: DraftPreviewDecision;
  /** With "edit": what to change, in the user's words. Optional. */
  feedback?: string;
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
    isString(value.title) &&
    (value.recipient === null || isString(value.recipient)) &&
    (value.channel === null || isString(value.channel)) &&
    isString(value.preview) &&
    isString(value.createdAt)
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
