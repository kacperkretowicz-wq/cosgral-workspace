// COSGRAL W1-BE3: what a window may send for draft preview / confirm cards and browser takeovers.

import {
  ACTION_CARD_LIMITS,
  BROWSER_TAKEOVER_ACTIONS,
  type DeleteDraftInput,
  DRAFT_PREVIEW_DECISIONS,
  type RespondToBrowserTakeoverInput,
  type RespondToDraftPreviewInput,
} from "@openbot/contracts/ipc";
import { isOneOf, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseDraftPreviewResponse(value: unknown): RespondToDraftPreviewInput {
  if (!isObject(value)) throw new Error("Invalid draft card response.");
  const requestId = requireString(value.requestId, "requestId");
  if (!isOneOf(DRAFT_PREVIEW_DECISIONS, value.decision)) throw new Error("decision must be send, edit or keep-draft.");
  const input: RespondToDraftPreviewInput = { requestId, decision: value.decision };
  if (value.feedback !== undefined) {
    if (!isString(value.feedback)) throw new Error("feedback must be text.");
    if (value.feedback.length > ACTION_CARD_LIMITS.feedback) throw new Error("feedback is too long.");
    if (value.feedback.trim()) input.feedback = value.feedback;
  }
  if (value.text !== undefined) {
    if (value.decision !== "edit") throw new Error("Only edit can carry new text.");
    input.text = requireString(value.text, "text", ACTION_CARD_LIMITS.preview);
  }
  return input;
}

export function parseBrowserTakeoverResponse(value: unknown): RespondToBrowserTakeoverInput {
  if (!isObject(value)) throw new Error("Invalid takeover response.");
  const requestId = requireString(value.requestId, "requestId");
  if (!isOneOf(BROWSER_TAKEOVER_ACTIONS, value.action)) {
    throw new Error("action must be take-over, return or decline.");
  }
  return { requestId, action: value.action };
}

export function parseDeleteDraft(value: unknown): DeleteDraftInput {
  if (!isObject(value)) throw new Error("Invalid draft request.");
  return { draftId: requireString(value.draftId, "draftId") };
}
