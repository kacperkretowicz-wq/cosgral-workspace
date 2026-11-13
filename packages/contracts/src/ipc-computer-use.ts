// COSGRAL W3: Computer Use on Windows (parity row 32). An agent sees the desktop and controls it with the mouse and
// the keyboard: click, double click, scroll, type text, press a key combination, list the windows and switch to one.
// The person allows it once per conversation with a confirm card (it counts in Needs you). While an agent controls
// the computer, the agent's row shows it with a Stop button: Stop ends the session at once, interrupts the action in
// progress and takes the permission back, so the next action asks again. Nothing is controlled while the screen is
// locked or Windows asks for administrator approval (UAC), in windows that run as administrator, or in COSGRAL
// Workspace itself.

import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const COMPUTER_USE_ACTIONS = [
  "screenshot",
  "click",
  "double_click",
  "scroll",
  "type_text",
  "press_keys",
  "list_windows",
  "switch_window",
] as const;
export type ComputerUseAction = (typeof COMPUTER_USE_ACTIONS)[number];

/** Every limit of Computer Use in one place. */
export const COMPUTER_USE_LIMITS = {
  /** Screenshots for the agent have at most this many pixels on the long side; coordinates use the same scale. */
  screenshotMaxDimension: 1600,
  typeTextLength: 2000,
  /** Characters typed in one step; Stop takes effect between steps. */
  typeChunk: 16,
  keysPerCombination: 4,
  scrollSteps: 20,
  /** A session without actions ends after this time (the permission stays until Stop). */
  idleMs: 60_000,
  /** One step of the driver; a longer one is stopped and reported. */
  stepTimeoutMs: 20_000,
} as const;

/** An agent that controls the computer right now: show it in the agent's row with a Stop button. */
export interface ComputerUseSession {
  id: string;
  botId: string;
  /** Public COSGRAL thread id of the conversation, or the channel thread. */
  threadId: string;
  /** "acting" while an action runs, "idle" between actions. */
  phase: "acting" | "idle";
  lastAction: ComputerUseAction | null;
  actions: number;
  startedAt: string;
  lastActionAt: string | null;
}

/** The person allowed this conversation to control the computer, until Stop or a restart of the program. */
export interface ComputerUseGrant {
  botId: string;
  threadId: string;
  grantedAt: string;
}

export interface ComputerUseState {
  /** False when this computer cannot be controlled (not Windows, or no driver). */
  available: boolean;
  /** Why it is unavailable, for settings; null when available. */
  unavailableReason: string | null;
  sessions: ComputerUseSession[];
  grants: ComputerUseGrant[];
}

/** With `botId`: end that agent's session and take back its permissions. Without it: every agent's. */
export interface StopComputerUseInput {
  botId?: string;
}

export function emptyComputerUseState(): ComputerUseState {
  return { available: false, unavailableReason: null, sessions: [], grants: [] };
}

function isComputerUseSession(value: unknown): value is ComputerUseSession {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isOneOf(["acting", "idle"], value.phase) &&
    (value.lastAction === null || isOneOf(COMPUTER_USE_ACTIONS, value.lastAction)) &&
    isNumber(value.actions) &&
    isString(value.startedAt) &&
    (value.lastActionAt === null || isString(value.lastActionAt))
  );
}

function isComputerUseGrant(value: unknown): value is ComputerUseGrant {
  return isDynamicRecord(value) && isString(value.botId) && isString(value.threadId) && isString(value.grantedAt);
}

export function isComputerUseState(value: unknown): value is ComputerUseState {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.available) &&
    (value.unavailableReason === null || isString(value.unavailableReason)) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isComputerUseSession) &&
    Array.isArray(value.grants) &&
    value.grants.every(isComputerUseGrant)
  );
}
