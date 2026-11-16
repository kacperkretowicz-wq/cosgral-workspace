// COSGRAL W6-KK3: the separate conversation windows for Storybook and the preview. Demo data only. The same rules as
// the program: one window per (agent, thread), opening again brings the existing one to the front, a limit of windows,
// closing touches nothing else. `simulate` lets a story switch the agent's active thread or play "this window is now
// the one the person looks at".

import {
  type AgentEvent,
  CONVERSATION_WINDOW_LIMITS,
  type ConversationWindowInfo,
  conversationWindowId,
  conversationWindowTitle,
  type WindowsDesktopApi,
} from "@openbot/contracts/ipc";

export interface MockWindows extends Required<WindowsDesktopApi> {
  simulate: {
    /** The agent now shows this thread in the main window: the windows of its other threads stop being live. */
    setActiveThread: (botId: string, threadId: string) => void;
    /** The window the page itself is (what `current()` answers); null = the main window. */
    setCurrent: (botId: string | null, threadId?: string) => void;
  };
}

export function createMockWindows(
  emit: (event: AgentEvent) => void,
  activeThreadOf: (botId: string) => string = (botId) => `${botId}-thread-1`,
  nameOf: (botId: string) => string = (botId) => botId,
): MockWindows {
  const open = new Map<string, ConversationWindowInfo>();
  const active = new Map<string, string>();
  let current: string | null = null;
  const activeOf = (botId: string) => active.get(botId) ?? activeThreadOf(botId);
  const list = () => [...open.values()].map((window) => ({ ...window }));
  const publish = () => emit({ type: "conversation-windows-changed", windows: list() });
  const focusOnly = (id: string) => {
    for (const window of open.values()) window.focused = window.id === id;
  };

  return {
    openConversation: async (input) => {
      const threadId = input.threadId ?? activeOf(input.botId);
      const id = conversationWindowId(input.botId, threadId);
      const existing = open.get(id);
      if (existing) {
        focusOnly(id);
        publish();
        return { window: { ...existing }, created: false };
      }
      if (open.size >= CONVERSATION_WINDOW_LIMITS.maxOpen) {
        throw new Error("Close a conversation window first: too many are open.");
      }
      const window: ConversationWindowInfo = {
        id,
        botId: input.botId,
        threadId,
        title: conversationWindowTitle(nameOf(input.botId), null),
        live: threadId === activeOf(input.botId),
        focused: true,
      };
      open.set(id, window);
      focusOnly(id);
      publish();
      return { window: { ...window }, created: true };
    },
    listOpen: async () => list(),
    close: async (input) => {
      if (open.delete(conversationWindowId(input.botId, input.threadId))) publish();
    },
    current: async () => {
      const window = current ? open.get(current) : undefined;
      return window ? { ...window } : null;
    },
    simulate: {
      setActiveThread: (botId, threadId) => {
        active.set(botId, threadId);
        for (const window of open.values()) if (window.botId === botId) window.live = window.threadId === threadId;
        publish();
      },
      setCurrent: (botId, threadId) => {
        current = botId && threadId ? conversationWindowId(botId, threadId) : null;
      },
    },
  };
}
