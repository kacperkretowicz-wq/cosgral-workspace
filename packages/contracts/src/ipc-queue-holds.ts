// COSGRAL W12 (BE-N): why the queue of an agent waits before it starts a new turn, in one place for the program and the mock.
// `QueueSnapshot.heldReason` is the sentence for the person and `QueueSnapshot.heldKind` says which hold it is (the window can pick an
// icon and a button: "Raise the budget", "Try again", "Archive a thread"). Nothing is held when both are null.
//
// The holds: "budget" (a budget is used up), "agent-restart" (the agent CLI is starting or restarting), "server-busy" (the server runs as
// many turns at once as it may), "thread-limit" (the agent has the most threads it may hold, so no new thread can be made). When several
// apply, the one that the person can act on first wins: budget, restart, server, thread. An empty queue is never "held" by restart or
// thread limit (there is nothing waiting); budget and server hold only exist while something waits, so they are passed in as they are.
//
// This computer only. Older servers send neither field (treat as not held).

export const QUEUE_HOLD_KINDS = ["budget", "agent-restart", "server-busy", "thread-limit"] as const;
export type QueueHoldKind = (typeof QUEUE_HOLD_KINDS)[number];

export const QUEUE_HOLD_REASONS = {
  "agent-restart": "The agent is restarting. New messages wait until it is ready.",
  "server-busy": "The server is busy: too many agent turns run at once. New messages wait until one finishes.",
  "thread-limit":
    "This agent has the most threads it may hold, so no new thread can be made. Archive or delete one to make room.",
} as const satisfies Record<Exclude<QueueHoldKind, "budget">, string>;

export interface QueueHold {
  kind: QueueHoldKind;
  reason: string;
}

/** What the program knows about one agent's queue when it builds the snapshot. */
export interface QueueHoldFacts {
  /** The sentence of a used-up budget (it already is a sentence for the person), or null. */
  budget: string | null;
  /** The agent waits for a free place under the server limit of turns. */
  serverBusy: boolean;
  /** The agent CLI is starting or restarting. */
  restarting: boolean;
  /** The agent may not have one more thread. */
  threadFull: boolean;
  /** Messages that wait in the queue (not started). */
  queued: number;
}

/** The hold to show, or null. */
export function queueHoldOf(facts: QueueHoldFacts): QueueHold | null {
  if (facts.budget) return { kind: "budget", reason: facts.budget };
  if (facts.restarting && facts.queued > 0)
    return { kind: "agent-restart", reason: QUEUE_HOLD_REASONS["agent-restart"] };
  if (facts.serverBusy) return { kind: "server-busy", reason: QUEUE_HOLD_REASONS["server-busy"] };
  if (facts.threadFull && facts.queued > 0) return { kind: "thread-limit", reason: QUEUE_HOLD_REASONS["thread-limit"] };
  return null;
}
