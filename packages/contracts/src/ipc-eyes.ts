// COSGRAL: "agent eyes" contract. An agent may look at a window, a screen or the camera,
// only after the user approves it. Screen and window access is approved once per
// conversation; the camera is approved for every photo. The UI shows who is looking
// and offers a stop button.

/** What the agent looks at. */
export type AgentEyesSource = "screen" | "window" | "camera";

/** What an eyes approval card asks for (`AgentApproval.eyes`). */
export interface AgentEyesRequest {
  source: AgentEyesSource;
  /** Human-readable target, e.g. a window title, "Screen 1" or "Camera". */
  targetLabel: string;
  /** True for a short live preview (several frames). */
  live: boolean;
  /** Frames the agent asks for: 1 for a single capture. */
  frames: number;
  /** Seconds between live frames, or null for a single capture. */
  intervalSeconds: number | null;
}

/** One capture or live preview in progress: the agent is looking right now. */
export interface AgentEyesSession {
  id: string;
  botId: string;
  /** Public COSGRAL thread id of the conversation. */
  threadId: string;
  turnId: string;
  source: AgentEyesSource;
  targetLabel: string;
  phase: "capturing" | "watching";
  framesCaptured: number;
  framesPlanned: number;
  startedAt: string;
  /** For a live preview: when it ends at the latest. */
  endsAt: string | null;
}

/** A standing approval: this conversation may look at windows and screens without asking again. */
export interface AgentEyesGrant {
  botId: string;
  threadId: string;
  source: "screen";
  grantedAt: string;
}

export interface AgentEyesState {
  /** Non-empty while an agent is looking (show the indicator and the stop button). */
  sessions: AgentEyesSession[];
  grants: AgentEyesGrant[];
}

/**
 * Stop looking. With `sessionId` stops one capture; with `botId` stops that agent and
 * revokes its approvals; with neither stops every agent and revokes every approval.
 */
export interface StopAgentEyesInput {
  botId?: string;
  sessionId?: string;
}

export function emptyAgentEyesState(): AgentEyesState {
  return { sessions: [], grants: [] };
}
