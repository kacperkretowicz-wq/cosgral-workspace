// COSGRAL W12 (BE-K): delete a thread with undo (contract: ipc-thread-undo.ts). The thread store hides the thread and keeps the time; this
// service tells the window (the list changed, the list of threads that can be brought back changed) and removes a hidden thread for good
// when its time is out: with a timer per thread, and once at the start for threads whose time ran out while the program was closed.
// The removal is the ordinary "delete" of the program (`purge`), so every cache of the thread is cleaned like for any other delete.

import {
  type AgentEvent,
  type DeleteThreadUndoResult,
  type PendingThreadDelete,
  parseDeleteThreadInput,
  parseListThreadsInput,
  parseThreadInput,
  type ThreadList,
} from "@openbot/contracts/ipc";
import type { ThreadStore } from "./thread-store";

export interface ThreadUndoOptions {
  threads: Pick<ThreadStore, "hide" | "unhide" | "listPending" | "expiredPending">;
  /** Removes the thread for good like `threads.delete`, with the caches of the program; fails while a turn runs in the thread. */
  purge: (botId: string, threadId: string) => Promise<unknown>;
  /** The list of an agent changed: tell the window (the program's usual `threads-changed` and what follows it); returns the list. */
  changed: (botId: string, list: ThreadList) => ThreadList;
  emit: (event: AgentEvent) => void;
  /** Runs `run` after `ms`; the answer stops it. Default: a timer that does not keep the program open. */
  after?: (ms: number, run: () => void) => () => void;
  now?: () => Date;
}

/** A removal that failed (a turn still runs in the thread) is tried again after this long. */
const RETRY_MS = 60_000;

function defaultAfter(ms: number, run: () => void): () => void {
  const timer = setTimeout(run, ms);
  timer.unref();
  return () => clearTimeout(timer);
}

export class ThreadUndoService {
  readonly #options: ThreadUndoOptions;
  readonly #timers = new Set<() => void>();

  constructor(options: ThreadUndoOptions) {
    this.#options = options;
  }

  /** Hides the thread for the undo window (same refusals as `threads.delete`). */
  async delete(raw: unknown): Promise<DeleteThreadUndoResult> {
    const input = parseDeleteThreadInput(raw);
    const result = await this.#options.threads.hide(input);
    this.#schedule(result.pending.expiresAt);
    const list = this.#options.changed(input.botId, result.list);
    this.#announce(input.botId);
    return { list, pending: result.pending };
  }

  /** Brings a hidden thread back with everything it had. */
  async undo(raw: unknown): Promise<ThreadList> {
    const input = parseThreadInput(raw);
    const list = this.#options.changed(input.botId, await this.#options.threads.unhide(input));
    this.#announce(input.botId);
    return list;
  }

  list(raw: unknown): PendingThreadDelete[] {
    return this.#options.threads.listPending(parseListThreadsInput(raw).botId);
  }

  /** At the start of the program: removes what ran out of time while it was closed, and sets a timer for the rest. */
  async start(): Promise<void> {
    await this.sweep();
    for (const pending of this.#options.threads.listPending()) this.#schedule(pending.expiresAt);
  }

  /** Removes for good every hidden thread whose time is out. A thread that cannot be removed now is tried again later. */
  async sweep(): Promise<void> {
    const touched = new Set<string>();
    let retry = false;
    for (const pending of this.#options.threads.expiredPending()) {
      try {
        await this.#options.purge(pending.botId, pending.threadId);
        touched.add(pending.botId);
      } catch {
        // A turn still runs in it (or the agent is busy): the thread stays hidden and the next sweep tries again.
        retry = true;
      }
    }
    for (const botId of touched) this.#announce(botId);
    if (retry) this.#after(RETRY_MS);
  }

  dispose(): void {
    for (const stop of this.#timers) stop();
    this.#timers.clear();
  }

  #announce(botId: string): void {
    this.#options.emit({
      type: "thread-deletes-changed",
      botId,
      pending: this.#options.threads.listPending(botId),
    });
  }

  #schedule(expiresAt: string): void {
    const now = (this.#options.now?.() ?? new Date()).getTime();
    // A little after the end, so the thread is really out of time when the sweep looks.
    this.#after(Math.max(0, Date.parse(expiresAt) - now) + 50);
  }

  #after(ms: number): void {
    const after = this.#options.after ?? defaultAfter;
    const stop = after(ms, () => {
      this.#timers.delete(stop);
      void this.sweep();
    });
    this.#timers.add(stop);
  }
}
