// COSGRAL W11 (U6): the tabs of the threads of each agent (contract: ipc-thread-tabs.ts). A tab is only whether the window shows a
// thread in the strip above the chat: closing one never archives or deletes the thread, and a thread that is archived or deleted
// loses its tab. The order of the tabs is the person's own and survives a restart (one small JSON file next to the program's data).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AgentEvent,
  type CloseThreadTabsInput,
  closeTabs,
  isTabPermutation,
  openTab,
  type ReorderThreadTabsInput,
  THREAD_TAB_LIMITS,
  type ThreadList,
  type ThreadTabInput,
  type ThreadTabs,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";

export interface ThreadTabsOptions {
  file: string;
  /** The public ids of the threads of an agent that may be tabs (the active ones); null when the agent does not exist. Used until `learn` told. */
  openThreads?: (botId: string) => string[] | null;
  emit: (event: AgentEvent) => void;
}

export class ThreadTabsService {
  readonly #options: ThreadTabsOptions;
  #stored: Record<string, string[]>;
  readonly #known = new Map<string, string[]>();

  constructor(options: ThreadTabsOptions) {
    this.#options = options;
    this.#stored = read(options.file);
  }

  /** The thread list of an agent (from the thread store or `threads-changed`): its active threads may be tabs; others lose theirs. */
  learn(list: ThreadList): void {
    this.#known.set(
      list.botId,
      list.threads.filter((thread) => thread.state !== "archived").map((thread) => thread.id),
    );
    this.prune(list.botId);
  }

  /** The open tabs of an agent, left to right; tabs whose thread is gone are not listed. */
  get(botId: string): ThreadTabs {
    const allowed = this.#allowed(botId);
    if (!allowed) return { botId, open: [] };
    return { botId, open: (this.#stored[botId] ?? []).filter((id) => allowed.includes(id)) };
  }

  open(input: ThreadTabInput): ThreadTabs {
    const allowed = this.#threads(input.botId);
    if (!allowed.includes(input.threadId)) throw new Error("This is not an active thread of this agent.");
    const before = this.get(input.botId).open;
    return this.#set(input.botId, before, openTab(before, input.threadId));
  }

  close(input: CloseThreadTabsInput): ThreadTabs {
    this.#threads(input.botId);
    const before = this.get(input.botId).open;
    return this.#set(input.botId, before, closeTabs(before, input.threadId, input.mode));
  }

  reorder(input: ReorderThreadTabsInput): ThreadTabs {
    this.#threads(input.botId);
    const before = this.get(input.botId).open;
    if (!isTabPermutation(before, input.threadIds)) {
      throw new Error("The new order must hold the same open tabs, each once.");
    }
    return this.#set(input.botId, before, input.threadIds);
  }

  /** The thread list of an agent changed: tabs of threads that are no longer active are dropped (one event when anything went). */
  prune(botId: string): void {
    const stored = this.#stored[botId];
    if (!stored) return;
    this.#set(botId, stored, this.get(botId).open);
  }

  #allowed(botId: string): string[] | null {
    return this.#known.get(botId) ?? this.#options.openThreads?.(botId) ?? null;
  }

  #threads(botId: string): string[] {
    const allowed = this.#allowed(botId);
    if (!allowed) throw new Error("This agent no longer exists.");
    return allowed;
  }

  #set(botId: string, before: readonly string[], after: string[]): ThreadTabs {
    if (before.length === after.length && before.every((id, index) => id === after[index]))
      return { botId, open: after };
    if (after.length === 0) delete this.#stored[botId];
    else this.#stored[botId] = after.slice(0, THREAD_TAB_LIMITS.maxOpen);
    this.#save();
    const tabs: ThreadTabs = { botId, open: [...after] };
    this.#options.emit({ type: "thread-tabs-changed", ...tabs });
    return tabs;
  }

  #save(): void {
    mkdirSync(dirname(this.#options.file), { recursive: true });
    const temporary = `${this.#options.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.#stored, null, 2));
    renameSync(temporary, this.#options.file);
  }
}

function read(file: string): Record<string, string[]> {
  if (!existsSync(file)) return {};
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    const result: Record<string, string[]> = {};
    if (!isDynamicRecord(value)) return result;
    for (const [botId, ids] of Object.entries(value)) {
      if (Array.isArray(ids)) result[botId] = ids.filter(isString).slice(0, THREAD_TAB_LIMITS.maxOpen);
    }
    return result;
  } catch {
    return {};
  }
}
