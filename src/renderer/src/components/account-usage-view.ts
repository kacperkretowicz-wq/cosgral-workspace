import type {
  AccountLimitOutcome,
  AccountLimitReached,
  AccountSwitched,
  AccountUsageWindow,
  ProviderAccount,
  ProviderUsage,
} from "@openbot/contracts/ipc";

/**
 * W5-UI2a view models for account usage and limit cards.
 * Built on ProviderAccount + AccountUsageWindow / ProviderUsage from this branch.
 * The limit and switch cards are built from the W5-K1 events (account-limit-reached, account-switched).
 */

export type AccountLimitState = "ok" | "exhausted" | "unknown";

export type AccountUsageWindowId = "five-hour" | "weekly";

export interface AccountUsageWindowView {
  id: AccountUsageWindowId;
  label: string;
  usedPercent: number | null;
  resetsAt: number | null;
  state: AccountLimitState;
}

export interface AccountUsageView {
  accountId: string;
  accountLabel: string;
  provider: ProviderAccount["provider"];
  windows: AccountUsageWindowView[];
  state: AccountLimitState;
  reason: string | null;
  /** From ProviderAccount.limitedUntil (ISO); null when free or unknown. */
  limitedUntil: string | null;
}

/** W5-K1: what the conversation shows when an account hit its usage limit (built from `account-limit-reached`). */
export interface AccountLimitReachedView {
  reason: string;
  exhaustedAccountLabel: string;
  /** "switched": the next account takes the turn; "asks": it had changed something, a card asks first; "exhausted": no account is free. */
  outcome: AccountLimitOutcome;
  /** The account that takes over (or would, after the person's answer); null when none is free. */
  nextAccountLabel: string | null;
  /** Unix seconds; null when there is none. */
  resetsAt: number | null;
  /** True when the provider gave no reset time and the program assumed one. */
  resetsAtAssumed: boolean;
}

/** W5-K1: the notice that a turn now runs on another account (built from `account-switched`). */
export interface AccountSwitchedView {
  toAccountLabel: string;
  fromAccountLabel: string | null;
  reason: string | null;
}

/** A card in the open conversation of one agent; dismissed by the person. */
export type AccountNotice = { id: string; botId: string } & (
  | { kind: "limit"; view: AccountLimitReachedView }
  | { kind: "switched"; view: AccountSwitchedView }
);

const MAX_NOTICES_PER_AGENT = 3;

function limitReason(event: AccountLimitReached): string {
  if (event.outcome === "asks") {
    return `${event.accountLabel} reached its usage limit after this turn had already changed something. Nothing was repeated on its own.`;
  }
  if (event.outcome === "exhausted") {
    return `${event.accountLabel} reached its usage limit and no other account in the pool is free.`;
  }
  return `${event.accountLabel} reached its usage limit before this turn did anything.`;
}

export function limitReachedView(event: AccountLimitReached): AccountLimitReachedView {
  const resets = Date.parse(event.resetsAt);
  return {
    reason: limitReason(event),
    exhaustedAccountLabel: event.accountLabel,
    outcome: event.outcome,
    nextAccountLabel: event.nextAccountLabel,
    resetsAt: Number.isNaN(resets) ? null : Math.floor(resets / 1000),
    resetsAtAssumed: event.resetsAtAssumed,
  };
}

export function switchedView(event: AccountSwitched): AccountSwitchedView {
  return {
    toAccountLabel: event.toLabel,
    fromAccountLabel: event.fromLabel,
    reason:
      event.reason === "returned"
        ? "Back on the first account: its limit has passed."
        : "Switched because the previous account reached its usage limit.",
  };
}

/** Adds a notice of a K1 event; the newest first, a few per agent. */
export function addAccountNotice(
  notices: readonly AccountNotice[],
  event: ({ type: "account-limit-reached" } & AccountLimitReached) | ({ type: "account-switched" } & AccountSwitched),
  id: string,
): AccountNotice[] {
  const next: AccountNotice =
    event.type === "account-limit-reached"
      ? { id, botId: event.botId, kind: "limit", view: limitReachedView(event) }
      : { id, botId: event.botId, kind: "switched", view: switchedView(event) };
  const same = notices.filter((notice) => notice.botId === event.botId).slice(0, MAX_NOTICES_PER_AGENT - 1);
  return [next, ...same, ...notices.filter((notice) => notice.botId !== event.botId)];
}

export function clampPercent(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
}

export function windowState(usedPercent: number | null, resetsAt: number | null, nowMs: number): AccountLimitState {
  const percent = clampPercent(usedPercent);
  if (percent === null && resetsAt === null) return "unknown";
  if (percent !== null && percent >= 100) return "exhausted";
  if (resetsAt !== null && resetsAt * 1000 > nowMs && (percent === null || percent >= 95)) return "exhausted";
  if (percent === null) return "unknown";
  return "ok";
}

export function overallState(
  windows: readonly AccountUsageWindowView[],
  limitedUntil: string | null,
  nowMs: number,
): AccountLimitState {
  if (limitedUntil) {
    const until = Date.parse(limitedUntil);
    if (!Number.isNaN(until) && until > nowMs) return "exhausted";
  }
  if (windows.some((window) => window.state === "exhausted")) return "exhausted";
  if (windows.length === 0 || windows.every((window) => window.state === "unknown")) return "unknown";
  return "ok";
}

/** Guessed mapping: primary ≈ 5 h, secondary ≈ weekly (spec-w5 U01). */
export function labelForWindow(window: AccountUsageWindow | null, fallback: AccountUsageWindowId): string {
  if (!window?.windowDurationMins) return fallback === "five-hour" ? "5-hour window" : "Weekly window";
  if (window.windowDurationMins <= 360) return "5-hour window";
  if (window.windowDurationMins >= 7 * 24 * 60 - 60) return "Weekly window";
  return `${window.windowDurationMins}-minute window`;
}

export function toWindowView(
  id: AccountUsageWindowId,
  window: AccountUsageWindow | null,
  nowMs: number,
): AccountUsageWindowView {
  const usedPercent = clampPercent(window?.usedPercent ?? null);
  const resetsAt = window?.resetsAt ?? null;
  return {
    id,
    label: labelForWindow(window, id),
    usedPercent,
    resetsAt,
    state: windowState(usedPercent, resetsAt, nowMs),
  };
}

export function accountUsageFromSources(input: {
  account: Pick<ProviderAccount, "id" | "label" | "provider" | "limitedUntil">;
  primary?: AccountUsageWindow | null;
  secondary?: AccountUsageWindow | null;
  /** Optional provider-level row when per-account windows are missing (guessed bridge). */
  providerUsage?: Pick<ProviderUsage, "state" | "usedPercent" | "resetsAt" | "reason"> | null;
  nowMs: number;
  reason?: string | null;
}): AccountUsageView {
  const windows: AccountUsageWindowView[] = [];
  if (input.primary || input.secondary) {
    windows.push(toWindowView("five-hour", input.primary ?? null, input.nowMs));
    windows.push(toWindowView("weekly", input.secondary ?? null, input.nowMs));
  } else if (input.providerUsage) {
    const usedPercent = clampPercent(input.providerUsage.usedPercent);
    const resetsAt = input.providerUsage.resetsAt;
    const state: AccountLimitState =
      input.providerUsage.state === "limited"
        ? "exhausted"
        : input.providerUsage.state === "unavailable"
          ? "unknown"
          : windowState(usedPercent, resetsAt, input.nowMs);
    windows.push({
      id: "five-hour",
      label: "Usage window",
      usedPercent,
      resetsAt,
      state,
    });
  }

  const limitedUntil = input.account.limitedUntil;
  const state = overallState(windows, limitedUntil, input.nowMs);
  const reason =
    input.reason ??
    input.providerUsage?.reason ??
    (state === "exhausted" ? "This account reached a provider limit." : null);

  return {
    accountId: input.account.id,
    accountLabel: input.account.label,
    provider: input.account.provider,
    windows,
    state,
    reason,
    limitedUntil,
  };
}

export function stateLabel(state: AccountLimitState): "Exhausted" | "Unknown" | "OK" {
  if (state === "exhausted") return "Exhausted";
  if (state === "unknown") return "Unknown";
  return "OK";
}

export function stateTone(state: AccountLimitState): "success" | "danger" | "neutral" {
  if (state === "exhausted") return "danger";
  if (state === "unknown") return "neutral";
  return "success";
}
