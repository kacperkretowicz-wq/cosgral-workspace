export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  ownerThreadId: string | null;
  ownerBotId: string | null;
  /** Whether the tab has a page to go back / forward to (left out by a host that does not report it). */
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export type BrowserControlPhase = "acting" | "waiting";

export type BrowserControlAction =
  | "open"
  | "list-tabs"
  | "snapshot"
  | "click"
  | "type"
  | "key"
  | "scroll"
  | "back"
  | "forward"
  | "reload"
  | "screenshot"
  | "close-tab";

export interface BrowserControlSession {
  id: string;
  threadId: string;
  turnId: string;
  callId: string;
  tabId: string | null;
  action: BrowserControlAction;
  phase: BrowserControlPhase;
  startedAt: string;
}

export interface BrowserControlState {
  sessions: BrowserControlSession[];
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserOpenInput {
  url: string;
  ownerThreadId?: string | null;
  ownerBotId?: string | null;
}

export type BrowserHistoryDirection = "back" | "forward";

/** A person's Back / Forward in the browser panel. */
export interface BrowserNavigateInput {
  tabId: string;
  direction: BrowserHistoryDirection;
}

export interface BrowserVisibilityInput {
  visible: boolean;
  bounds?: BrowserBounds;
}
