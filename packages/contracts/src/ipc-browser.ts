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

/** The most text of one page that the person can show to an agent. */
export const BROWSER_PAGE_COPY_LIMIT = 20_000;

/** One page, read when the person asks to show it to an agent: only visible text, cut to `BROWSER_PAGE_COPY_LIMIT`. */
export interface BrowserPageCopy {
  tabId: string;
  title: string;
  url: string;
  text: string;
  /** The page had more text than fits. */
  truncated: boolean;
}

export interface BrowserVisibilityInput {
  visible: boolean;
  bounds?: BrowserBounds;
}
