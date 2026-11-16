// COSGRAL W6-BE2: how full the context of a conversation is, and shrinking it (spec-w6.md 1B, W11-W16; decisions Q6, Q7).
//
// The context state belongs to ONE THREAD of an agent (`threadId` = the public thread id the conversation snapshot, the
// queue and the cards carry). Nothing here invents a number (Q6): the figures come from what the provider's CLI reports
// (`source: "reported"`). When the provider reports nothing, the state is "unavailable" with a plain reason, and
// `used`, `limit` and `percent` are null: the window must show "unavailable", never 0 % and never 100 %.
// `source: "estimated"` is part of the contract for a provider that reports raw counts without a window size; no engine
// path produces it yet.
//
// Shrinking (compaction): the person can always ask for it (`compact`), and the program does it by itself in the
// background when the thread passes the threshold of the settings (Q7; default 90 %, can be switched off). Whatever
// shrinks the context is visible: `compacting` while it runs, then `compactions`, `lastCompactedAt` and
// `lastCompactedFromTokens`. After a compaction the old numbers are kept but marked `stale` until the provider reports the
// new ones (the indicator must not fall back to empty while the data is on disk, W15).
//
// Everything here is about THIS computer only (a phone or a remote server may not call it).

import { type DynamicRecord, isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const CONTEXT_SOURCES = ["reported", "estimated", "unavailable"] as const;
export type ContextSource = (typeof CONTEXT_SOURCES)[number];

/** Defaults and bounds of the settings. */
export const CONTEXT_SETTINGS_LIMITS = {
  defaultThresholdPercent: 90,
  minThresholdPercent: 50,
  maxThresholdPercent: 95,
  /** The indicator warns from this share on (whatever the threshold is), so the person sees it coming. */
  warnPercent: 80,
} as const;

export interface ContextState {
  botId: string;
  /** The public thread id this state is about. */
  threadId: string;
  source: ContextSource;
  /** Tokens in the context now; null while unavailable. */
  used: number | null;
  /** Tokens the window of the model holds; null while unavailable. */
  limit: number | null;
  /** 0-100, whole number, capped at 100; null while unavailable. */
  percent: number | null;
  /** A plain sentence for "unavailable" (why there is no number); null otherwise. */
  unavailableReason: string | null;
  /** true from `warnPercent` on: the indicator shows a warning. */
  warning: boolean;
  /** A compaction is running (or waits for the running turn to end). */
  compacting: boolean;
  /** Whether this provider can be asked to compact (Codex yes; Claude Code manages its own context). */
  canCompact: boolean;
  /** How many compactions this thread went through (kept after a restart). */
  compactions: number;
  lastCompactedAt: string | null;
  /** Tokens right before the last compaction; null when never or not known. */
  lastCompactedFromTokens: number | null;
  /** The numbers are from before the last compaction and the new ones are not reported yet. */
  stale: boolean;
  /** When the numbers were reported; null while unavailable. */
  updatedAt: string | null;
}

export interface ContextSettings {
  /** The program compacts by itself in the background when the thread passes the threshold. */
  autoCompact: boolean;
  /** 50-95 (whole percent of the window). */
  thresholdPercent: number;
}

export interface ContextThreadInput {
  botId: string;
  /** Left out or null: the thread the window shows for this agent. */
  threadId?: string | null;
}

export interface UpdateContextSettingsInput {
  autoCompact?: boolean;
  thresholdPercent?: number;
}

export interface ContextDesktopApi {
  /** The state of one thread (never throws for a missing report: that is "unavailable"). */
  getState: (input: ContextThreadInput) => Promise<ContextState>;
  /** Asks for a compaction now (or right after the running turn). Throws when the provider cannot be asked. */
  compact: (input: ContextThreadInput) => Promise<ContextState>;
  getSettings: () => Promise<ContextSettings>;
  updateSettings: (input: UpdateContextSettingsInput) => Promise<ContextSettings>;
}

/** Event `context-changed`: the state of one thread changed (a report, a compaction started or ended, history cleared). */
export type ContextChanged = ContextState;

/** Event `context-settings-changed`. */
export type ContextSettingsChanged = ContextSettings;

// --- rules shared by the engine and the mock ---

/** Whole percent, 0-100, for two real numbers; null when there is no usable pair. */
export function contextPercent(used: number | null, limit: number | null): number | null {
  if (used === null || limit === null || !Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0 || used < 0)
    return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function contextWarning(percent: number | null): boolean {
  return percent !== null && percent >= CONTEXT_SETTINGS_LIMITS.warnPercent;
}

export function defaultContextSettings(): ContextSettings {
  return { autoCompact: true, thresholdPercent: CONTEXT_SETTINGS_LIMITS.defaultThresholdPercent };
}

/** A settings change applied to the current settings; a bad value is refused (not clamped), so the window learns. */
export function applyContextSettings(current: ContextSettings, input: UpdateContextSettingsInput): ContextSettings {
  const next = { ...current };
  if (input.autoCompact !== undefined) {
    if (!isBoolean(input.autoCompact)) throw new Error("autoCompact must be true or false.");
    next.autoCompact = input.autoCompact;
  }
  if (input.thresholdPercent !== undefined) {
    const value = input.thresholdPercent;
    if (
      !isNumber(value) ||
      !Number.isInteger(value) ||
      value < CONTEXT_SETTINGS_LIMITS.minThresholdPercent ||
      value > CONTEXT_SETTINGS_LIMITS.maxThresholdPercent
    ) {
      throw new Error(
        `The threshold must be a whole number from ${CONTEXT_SETTINGS_LIMITS.minThresholdPercent} to ${CONTEXT_SETTINGS_LIMITS.maxThresholdPercent} percent.`,
      );
    }
    next.thresholdPercent = value;
  }
  return next;
}

/** The state of a thread nothing was reported for. `reason` says why in one plain sentence. */
export function unavailableContextState(
  botId: string,
  threadId: string,
  reason: string,
  canCompact: boolean,
): ContextState {
  return {
    botId,
    threadId,
    source: "unavailable",
    used: null,
    limit: null,
    percent: null,
    unavailableReason: reason,
    warning: false,
    compacting: false,
    canCompact,
    compactions: 0,
    lastCompactedAt: null,
    lastCompactedFromTokens: null,
    stale: false,
    updatedAt: null,
  };
}

// --- guards ---

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (isNumber(value) && Number.isFinite(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function isContextState(value: unknown): value is ContextState {
  if (!isDynamicRecord(value)) return false;
  const record: DynamicRecord = value;
  if (
    !(
      isString(record.botId) &&
      isString(record.threadId) &&
      isOneOf(CONTEXT_SOURCES, record.source) &&
      isNullableNumber(record.used) &&
      isNullableNumber(record.limit) &&
      isNullableNumber(record.percent) &&
      isNullableString(record.unavailableReason) &&
      isBoolean(record.warning) &&
      isBoolean(record.compacting) &&
      isBoolean(record.canCompact) &&
      isNumber(record.compactions) &&
      isNullableString(record.lastCompactedAt) &&
      isNullableNumber(record.lastCompactedFromTokens) &&
      isBoolean(record.stale) &&
      isNullableString(record.updatedAt)
    )
  )
    return false;
  // No invented numbers: "unavailable" has none and says why; every other source has a used/limit pair and a percent.
  if (record.source === "unavailable")
    return (
      record.used === null &&
      record.limit === null &&
      record.percent === null &&
      isString(record.unavailableReason) &&
      record.unavailableReason.length > 0
    );
  return record.used !== null && record.limit !== null && record.percent !== null;
}

export function isContextSettings(value: unknown): value is ContextSettings {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.autoCompact) &&
    isNumber(value.thresholdPercent) &&
    Number.isInteger(value.thresholdPercent) &&
    value.thresholdPercent >= CONTEXT_SETTINGS_LIMITS.minThresholdPercent &&
    value.thresholdPercent <= CONTEXT_SETTINGS_LIMITS.maxThresholdPercent
  );
}

export function isContextThreadInput(value: unknown): value is ContextThreadInput {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    value.botId.length > 0 &&
    (value.threadId === undefined || value.threadId === null || (isString(value.threadId) && value.threadId.length > 0))
  );
}

export function isUpdateContextSettingsInput(value: unknown): value is UpdateContextSettingsInput {
  return (
    isDynamicRecord(value) &&
    (value.autoCompact === undefined || isBoolean(value.autoCompact)) &&
    (value.thresholdPercent === undefined || isNumber(value.thresholdPercent))
  );
}
