// COSGRAL W6-BE3: the actions on a message for Storybook and the preview. Demo data only. The same rules as the program:
// retry ADDS a new answer marked as a regeneration (the old one stays), edit removes everything after the message and
// needs `confirm: true` when there is anything after it, delete needs `confirm: true`, pin survives and is limited, and
// retry, edit and delete are refused while the thread is busy. `seed` gives a thread its conversation; `setBusy` plays a
// running turn.

import {
  type AgentEvent,
  buildMessageMenu,
  type ConversationMessage,
  editNeedsConfirmation,
  MESSAGE_ACTION_LIMITS,
  type MessageActionsDesktopApi,
  type MessageMenu,
  type MessagePin,
  messageActionProblem,
  retrySourceIndex,
  threadBusyProblem,
} from "@openbot/contracts/ipc";

export interface MockMessageActions extends Required<MessageActionsDesktopApi> {
  seed: (botId: string, threadId: string, messages: ConversationMessage[]) => void;
  messages: (botId: string, threadId: string) => ConversationMessage[];
  /** A turn runs, or messages wait in the queue: history cannot be changed. */
  setBusy: (botId: string, threadId: string, busy: { turnRunning: boolean; busyMessages: number }) => void;
  /** COSGRAL W12 (BE-J): the menu of one message, built with the same rules as the program (`window.openbot.messageMenu.get`). */
  menu: (target: { botId: string; threadId?: string | null; messageId: string }) => Promise<MessageMenu>;
}

export function createMockMessageActions(
  emit: (event: AgentEvent) => void,
  options: { activeThread?: (botId: string) => string } = {},
): MockMessageActions {
  const conversations = new Map<string, ConversationMessage[]>();
  const busy = new Map<string, { turnRunning: boolean; busyMessages: number }>();
  const pins = new Map<string, MessagePin[]>();
  let counter = 0;
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const key = (botId: string, threadId: string) => `${botId}\u0000${threadId}`;
  const threadOf = (botId: string, threadId?: string | null) => threadId ?? options.activeThread?.(botId) ?? botId;
  const list = (botId: string, threadId: string): ConversationMessage[] => {
    const existing = conversations.get(key(botId, threadId));
    if (existing) return existing;
    const created: ConversationMessage[] = [];
    conversations.set(key(botId, threadId), created);
    return created;
  };
  const message = (target: { botId: string; threadId?: string | null; messageId: string }) => {
    const threadId = threadOf(target.botId, target.threadId);
    const messages = list(target.botId, threadId);
    const index = messages.findIndex((item) => item.id === target.messageId);
    const found = messages[index];
    if (!found) throw new Error("That message is not in this thread.");
    return { threadId, messages, index, found };
  };
  const guardHistory = (botId: string, threadId: string) => {
    const problem = threadBusyProblem(busy.get(key(botId, threadId)) ?? { turnRunning: false, busyMessages: 0 });
    if (problem) throw new Error(problem);
  };
  let revision = 0;
  const changed = (botId: string, threadId: string) =>
    emit({
      type: "conversation",
      snapshot: {
        botId,
        threadId,
        revision: ++revision,
        activeTurnId: null,
        messages: structuredClone(list(botId, threadId)),
      },
    });
  const pinsOf = (botId: string, threadId: string) =>
    [...(pins.get(key(botId, threadId)) ?? [])].sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
  const newId = () => {
    counter += 1;
    return `mock-message-${counter}`;
  };

  return {
    seed: (botId, threadId, messages) => {
      conversations.set(key(botId, threadId), structuredClone(messages));
    },
    messages: (botId, threadId) => structuredClone(list(botId, threadId)),
    setBusy: (botId, threadId, state) => {
      busy.set(key(botId, threadId), state);
    },
    menu: async (target) => {
      const { threadId, messages, index, found } = message(target);
      const pinned = (pins.get(key(target.botId, threadId)) ?? []).some((pin) => pin.messageId === found.id);
      return buildMessageMenu(
        { botId: target.botId, threadId, messageId: found.id },
        {
          message: found,
          pinned,
          pinCount: (pins.get(key(target.botId, threadId)) ?? []).length,
          threadShown: options.activeThread ? threadId === options.activeThread(target.botId) : true,
          historyProblem: threadBusyProblem(
            busy.get(key(target.botId, threadId)) ?? { turnRunning: false, busyMessages: 0 },
          ),
          laterMessages: messages.length - index - 1,
          branchRoom: true,
        },
      );
    },
    retry: async (input) => {
      const { threadId, messages, index, found } = message(input);
      const problem = messageActionProblem("retry", found);
      if (problem) throw new Error(problem);
      guardHistory(input.botId, threadId);
      const sourceIndex = retrySourceIndex(messages, found.id);
      const source = messages[sourceIndex];
      if (!source) throw new Error("There is no message of yours before this answer to ask again.");
      const ofMessageId = found.author === "user" ? (messages[index + 1]?.id ?? found.id) : found.id;
      const request: ConversationMessage = {
        id: newId(),
        author: "user",
        source: "user",
        text: source.text,
        createdAt: now(),
        status: "completed",
        regeneration: { ofMessageId },
      };
      messages.push(request, {
        id: newId(),
        author: "assistant",
        text: "A new answer to the same message.",
        createdAt: now(),
        status: "completed",
        regeneration: { ofMessageId },
      });
      changed(input.botId, threadId);
      return { removedMessageIds: [], receipt: { messageId: request.id, deliveries: [] } };
    },
    edit: async (input) => {
      const { threadId, messages, index, found } = message(input);
      const problem = messageActionProblem("edit", found);
      if (problem) throw new Error(problem);
      guardHistory(input.botId, threadId);
      const later = messages.length - index - 1;
      if (editNeedsConfirmation(later) && input.confirm !== true) {
        throw new Error(`This removes ${later} later message${later === 1 ? "" : "s"}. Confirm to continue.`);
      }
      const removedMessageIds = messages.splice(index).map((item) => item.id);
      const replacement: ConversationMessage = {
        id: newId(),
        author: "user",
        source: "user",
        text: input.text.trim(),
        createdAt: now(),
        status: "completed",
        edited: true,
      };
      messages.push(replacement);
      changed(input.botId, threadId);
      return { removedMessageIds, receipt: { messageId: replacement.id, deliveries: [] } };
    },
    delete: async (input) => {
      const { threadId, messages, index, found } = message(input);
      if (input.confirm !== true) throw new Error("Deleting a message needs confirmation.");
      const problem = messageActionProblem("delete", found);
      if (problem) throw new Error(problem);
      guardHistory(input.botId, threadId);
      messages.splice(index, 1);
      const rest = (pins.get(key(input.botId, threadId)) ?? []).filter((pin) => pin.messageId !== found.id);
      pins.set(key(input.botId, threadId), rest);
      changed(input.botId, threadId);
      return { removedMessageIds: [found.id], receipt: null };
    },
    pin: async (input) => {
      const { threadId, found } = message(input);
      const problem = messageActionProblem("pin", found);
      if (problem) throw new Error(problem);
      const current = (pins.get(key(input.botId, threadId)) ?? []).filter((pin) => pin.messageId !== found.id);
      if (input.pinned) {
        if (current.length >= MESSAGE_ACTION_LIMITS.pinsPerThread) {
          throw new Error(`At most ${MESSAGE_ACTION_LIMITS.pinsPerThread} messages can be pinned in a thread.`);
        }
        current.push({ messageId: found.id, pinnedAt: now() });
      }
      pins.set(key(input.botId, threadId), current);
      found.pinned = input.pinned;
      const result = pinsOf(input.botId, threadId);
      emit({ type: "message-pins-changed", botId: input.botId, threadId, pins: structuredClone(result) });
      return result;
    },
    listPins: async ({ botId, threadId }) => structuredClone(pinsOf(botId, threadOf(botId, threadId))),
  };
}
