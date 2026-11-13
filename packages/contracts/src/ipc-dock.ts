// COSGRAL W3: the agent dock and the Dynamic Island (parity rows 37 and 38).
//
// Dock: a separate window at the edge of the screen with mini chats of favourite agents. The person pins and unpins
// agents, orders them, hides one without unpinning it, and picks the size of the dock. The dock keeps working when
// the main window is closed; "Open COSGRAL" brings the main window back.
//
// Island: a small overlay at the top of the screen that always shows the most urgent state of the agents: a browser
// takeover, an approval, a question, an error, a new message, or work in progress. A click opens the main window at
// the Needs you card of that agent (event `island-open-request`).

import { isPendingAgentRequestKind, type PendingAgentRequestKind } from "./ipc-attention";
import { isBoolean, isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const DOCK_SIZES = ["small", "medium", "large"] as const;
export type DockSize = (typeof DOCK_SIZES)[number];

/** Every limit of the dock in one place. */
export const DOCK_LIMITS = {
  /** Width of the dock window in pixels for each size. */
  widths: { small: 280, medium: 360, large: 440 } satisfies Record<DockSize, number>,
  /** Agents pinned at the same time. */
  pins: 8,
} as const;

/** A pinned agent. The order of `DockState.pins` is the order in the dock. */
export interface DockPin {
  botId: string;
  /** Hidden: still pinned and keeps its place, but the dock does not show it. */
  hidden: boolean;
  pinnedAt: string;
}

export interface DockState {
  /** The dock window is shown. */
  visible: boolean;
  size: DockSize;
  pins: DockPin[];
  /** The mini chat that is open in the dock; null when every chat is collapsed. */
  openBotId: string | null;
  /** The main window exists; when false the dock shows "Open COSGRAL". */
  mainWindowOpen: boolean;
}

export interface PinDockAgentInput {
  botId: string;
  /** Position in the dock, from 0; at the end when omitted. */
  index?: number;
}

export interface DockAgentInput {
  botId: string;
}

/** Every pinned agent once, in the new order. */
export interface ReorderDockInput {
  botIds: string[];
}

export interface SetDockPinHiddenInput {
  botId: string;
  hidden: boolean;
}

export interface SetDockSizeInput {
  size: DockSize;
}

export interface SetDockVisibleInput {
  visible: boolean;
}

/** Open one mini chat (the others collapse), or collapse all with null. */
export interface OpenDockChatInput {
  botId: string | null;
}

/** Bring the main window to the front, optionally at an agent and at one of its Needs you cards. */
export interface ShowMainWindowInput {
  botId?: string;
  request?: IslandRequestRef;
}

/** Most urgent first: the island shows the first kind that applies. */
export const ISLAND_STATUS_KINDS = ["takeover", "approval", "question", "error", "message", "working"] as const;
export type IslandStatusKind = (typeof ISLAND_STATUS_KINDS)[number];

/** One open Needs you card, as listed by `agent.listPendingRequests()`. */
export interface IslandRequestRef {
  kind: PendingAgentRequestKind;
  requestId: string | number;
}

export interface IslandStatus {
  kind: IslandStatusKind;
  botId: string;
  botName: string;
  /** One short line, at most `ISLAND_SUMMARY_LIMIT` characters. */
  summary: string;
  /** The card that a click opens; null for "error", "message" and "working". */
  request: IslandRequestRef | null;
  since: string;
}

export const ISLAND_SUMMARY_LIMIT = 120;

export interface IslandState {
  /** The island window is shown (setting of the person). */
  enabled: boolean;
  /** The most urgent state; null when nothing happens (the island stays small and empty). */
  status: IslandStatus | null;
  /** Open Needs you cards of every agent. */
  waiting: number;
  /** Agents with a running turn. */
  working: number;
}

export interface SetIslandEnabledInput {
  enabled: boolean;
}

export function defaultDockState(): DockState {
  return { visible: false, size: "medium", pins: [], openBotId: null, mainWindowOpen: true };
}

export function emptyIslandState(): IslandState {
  return { enabled: true, status: null, waiting: 0, working: 0 };
}

function isDockPin(value: unknown): value is DockPin {
  return isDynamicRecord(value) && isString(value.botId) && isBoolean(value.hidden) && isString(value.pinnedAt);
}

export function isDockState(value: unknown): value is DockState {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.visible) &&
    isOneOf(DOCK_SIZES, value.size) &&
    Array.isArray(value.pins) &&
    value.pins.every(isDockPin) &&
    (value.openBotId === null || isString(value.openBotId)) &&
    isBoolean(value.mainWindowOpen)
  );
}

export function isIslandRequestRef(value: unknown): value is IslandRequestRef {
  return (
    isDynamicRecord(value) &&
    isPendingAgentRequestKind(value.kind) &&
    (isString(value.requestId) || isNumber(value.requestId))
  );
}

function isIslandStatus(value: unknown): value is IslandStatus {
  return (
    isDynamicRecord(value) &&
    isOneOf(ISLAND_STATUS_KINDS, value.kind) &&
    isString(value.botId) &&
    isString(value.botName) &&
    isString(value.summary) &&
    (value.request === null || isIslandRequestRef(value.request)) &&
    isString(value.since)
  );
}

export function isIslandState(value: unknown): value is IslandState {
  return (
    isDynamicRecord(value) &&
    isBoolean(value.enabled) &&
    (value.status === null || isIslandStatus(value.status)) &&
    isNumber(value.waiting) &&
    isNumber(value.working)
  );
}
