// COSGRAL W6-KK3: the separate conversation windows (spec-w6.md 1F, W36-W38). This is the rule keeper: one window per
// (agent, thread), a limit, the `live` flag and the titles kept in step with the engine, and nothing else. The windows
// themselves (Electron) are made by a host (conversation-windows-electron.ts), so the rules are tested without a screen.
// A window shows data through the same preload and the same trust as the main window: nothing is read or sent here.
// Closing a window never touches a thread or a running turn (W38): this class has no way to reach the engine except
// to ASK for names and titles.

import {
  type AgentEvent,
  CONVERSATION_WINDOW_LIMITS,
  type ConversationWindowInfo,
  type ConversationWindowInput,
  conversationWindowHash,
  conversationWindowId,
  conversationWindowTitle,
  type OpenConversationInput,
  type OpenConversationResult,
  type ThreadList,
} from "@openbot/contracts/ipc";

/** One open Electron window, as the rule keeper sees it. */
export interface ConversationWindowHandle {
  focus(): void;
  close(): void;
  setTitle(title: string): void;
  /** Called when the person (or the program) closed the window. */
  onClosed(listener: () => void): void;
  onFocusChanged(listener: (focused: boolean) => void): void;
}

export interface ConversationWindowHost {
  create(hash: string, title: string): ConversationWindowHandle;
}

/** What the rule keeper may ask the engine: names and the threads of an agent. Nothing that changes anything. */
export interface ConversationWindowAgents {
  agentName(botId: string): string | null;
  threads(botId: string): Promise<ThreadList>;
}

export interface ConversationWindowsOptions {
  host: ConversationWindowHost;
  agents: ConversationWindowAgents;
  emit: (event: AgentEvent) => void;
}

interface OpenWindow {
  info: ConversationWindowInfo;
  handle: ConversationWindowHandle;
}

export class ConversationWindows {
  readonly #host: ConversationWindowHost;
  readonly #agents: ConversationWindowAgents;
  readonly #emit: (event: AgentEvent) => void;
  readonly #open = new Map<string, OpenWindow>();
  #destroyed = false;

  constructor(options: ConversationWindowsOptions) {
    this.#host = options.host;
    this.#agents = options.agents;
    this.#emit = options.emit;
  }

  list(): ConversationWindowInfo[] {
    return [...this.#open.values()].map((window) => ({ ...window.info }));
  }

  /** The window with this id, for the page that asks "which conversation am I?" */
  get(botId: string, threadId: string): ConversationWindowInfo | null {
    const window = this.#open.get(conversationWindowId(botId, threadId));
    return window ? { ...window.info } : null;
  }

  async open(input: OpenConversationInput): Promise<OpenConversationResult> {
    if (this.#destroyed) throw new Error("The program is closing.");
    const name = this.#agents.agentName(input.botId);
    if (name === null) throw new Error("This agent does not exist.");
    const threads = await this.#agents.threads(input.botId);
    const threadId = input.threadId ?? threads.activeThreadId;
    if (!threadId) throw new Error("This agent has no conversation yet.");
    const thread = threads.threads.find((candidate) => candidate.id === threadId);
    if (!thread) throw new Error("This thread does not exist.");
    const id = conversationWindowId(input.botId, threadId);
    const existing = this.#open.get(id);
    if (existing) {
      existing.handle.focus();
      return { window: { ...existing.info }, created: false };
    }
    if (this.#open.size >= CONVERSATION_WINDOW_LIMITS.maxOpen) {
      throw new Error("Close a conversation window first: too many are open.");
    }
    const title = conversationWindowTitle(name, thread.titled ? thread.title : null);
    const handle = this.#host.create(conversationWindowHash(input.botId, threadId), title);
    const info: ConversationWindowInfo = {
      id,
      botId: input.botId,
      threadId,
      title,
      live: threadId === threads.activeThreadId,
      focused: true,
    };
    const window: OpenWindow = { info, handle };
    for (const other of this.#open.values()) other.info.focused = false;
    this.#open.set(id, window);
    handle.onClosed(() => this.#closed(id, window));
    handle.onFocusChanged((focused) => this.#focusChanged(id, window, focused));
    this.#publish();
    return { window: { ...info }, created: true };
  }

  /** Closes the window of a thread; a window that is not open is not an error. */
  close(input: ConversationWindowInput): void {
    this.#open.get(conversationWindowId(input.botId, input.threadId))?.handle.close();
  }

  /** Every agent event of this computer: the threads and the agents decide the `live` flag, the titles and who stays open. */
  observe(event: AgentEvent): void {
    if (event.type === "threads-changed") this.#threadsChanged(event);
    else if (event.type === "bots-changed") this.#botsChanged(event.bots.map((bot) => bot.id));
  }

  /** Program shutdown: the windows go with it, without telling anyone and without touching a thread. */
  destroy(): void {
    this.#destroyed = true;
    const windows = [...this.#open.values()];
    this.#open.clear();
    for (const window of windows) window.handle.close();
  }

  #threadsChanged(list: ThreadList): void {
    let changed = false;
    for (const [id, window] of [...this.#open]) {
      if (window.info.botId !== list.botId) continue;
      const thread = list.threads.find((candidate) => candidate.id === window.info.threadId);
      if (!thread) {
        // The thread was deleted for good: its window has nothing left to show.
        this.#open.delete(id);
        window.handle.close();
        changed = true;
        continue;
      }
      const live = thread.id === list.activeThreadId;
      const name = this.#agents.agentName(window.info.botId);
      const title = conversationWindowTitle(name ?? window.info.title, thread.titled ? thread.title : null);
      if (live !== window.info.live || title !== window.info.title) {
        window.info.live = live;
        if (title !== window.info.title) {
          window.info.title = title;
          window.handle.setTitle(title);
        }
        changed = true;
      }
    }
    if (changed) this.#publish();
  }

  #botsChanged(botIds: string[]): void {
    let changed = false;
    for (const [id, window] of [...this.#open]) {
      if (botIds.includes(window.info.botId)) continue;
      this.#open.delete(id);
      window.handle.close();
      changed = true;
    }
    if (changed) this.#publish();
  }

  #closed(id: string, window: OpenWindow): void {
    if (this.#destroyed || this.#open.get(id) !== window) return;
    this.#open.delete(id);
    this.#publish();
  }

  #focusChanged(id: string, window: OpenWindow, focused: boolean): void {
    if (this.#open.get(id) !== window || window.info.focused === focused) return;
    window.info.focused = focused;
    this.#publish();
  }

  #publish(): void {
    if (this.#destroyed) return;
    this.#emit({ type: "conversation-windows-changed", windows: this.list() });
  }
}
