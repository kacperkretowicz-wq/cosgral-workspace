// COSGRAL W12 (BE-J): the menu of one message in a chat (copy, react, pin, branch, retry, edit, delete) in ONE read: which actions the
// message offers now and, for each one that does not, why, so the window draws the menu without asking six questions and without
// guessing. The actions themselves already exist: copy is the window's alone, react is `setMessageReaction`, pin/retry/edit/delete are
// `messageActions`, branch is `threads.branch`. The rules here (`buildMessageMenu`) are the same for the program and the mock, and they
// use the rules of the actions themselves (`messageActionProblem`, `threadBusyProblem`, `editNeedsConfirmation`), so the menu never
// offers what the action would refuse.
//
// This computer only. Reading the menu changes nothing.

import {
  ALL_MESSAGE_REACTIONS,
  MESSAGE_REACTIONS,
  type MessageReaction,
  MORE_MESSAGE_REACTIONS,
} from "./ipc-conversation";
import {
  editNeedsConfirmation,
  MESSAGE_ACTION_LIMITS,
  type MessageActionSubject,
  type MessageActionTarget,
  messageActionProblem,
} from "./ipc-message-actions";
import { THREAD_LIMITS } from "./ipc-threads";
import { isBoolean, isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const MESSAGE_MENU_ACTION_IDS = ["copy", "react", "pin", "branch", "retry", "edit", "delete"] as const;
export type MessageMenuActionId = (typeof MESSAGE_MENU_ACTION_IDS)[number];

export interface MessageMenuAction {
  id: MessageMenuActionId;
  enabled: boolean;
  /** Why it is not offered now, in plain words; null when it is. */
  reason: string | null;
  /** The window asks the person first (delete always; edit when messages follow; the call must say `confirm: true`). */
  needsConfirmation: boolean;
  /** Pin: the message is pinned now (the label is "Unpin"). Other actions: false. */
  active: boolean;
}

export interface MessageMenuReactions {
  /** The first row of the picker. */
  quick: MessageReaction[];
  /** The rest, behind "more". */
  more: MessageReaction[];
  /** The reaction on this message now; null = none. */
  current: MessageReaction | null;
}

export interface MessageMenu {
  botId: string;
  threadId: string;
  messageId: string;
  pinned: boolean;
  /** Every action of MESSAGE_MENU_ACTION_IDS once, in that order. */
  actions: MessageMenuAction[];
  reactions: MessageMenuReactions;
}

/** What the program reads to build a menu (the engine fills it from the conversation, the queue and the threads). */
export interface MessageMenuFacts {
  message: MessageActionSubject & { reaction?: MessageReaction | null };
  /** The message is pinned. */
  pinned: boolean;
  /** Pins in the thread now. */
  pinCount: number;
  /** The thread is the one the window shows (history changes only there). */
  threadShown: boolean;
  /** `threadBusyProblem` of the thread now, or null. */
  historyProblem: string | null;
  /** Messages that follow this one in the thread (an edit removes them). */
  laterMessages: number;
  /** The agent may have one more thread (a branch makes one). */
  branchRoom: boolean;
}

/** `window.openbot.messageMenu` (this computer only). */
export interface MessageMenuDesktopApi {
  get: (input: MessageActionTarget) => Promise<MessageMenu>;
}

// -- rules shared by the engine and the mock -------------------------------------------------------------------------------------

export const MESSAGE_MENU_HISTORY_THREAD_PROBLEM =
  "Select that thread first: history changes only in the thread that is shown.";

export function buildMessageMenu(
  target: { botId: string; threadId: string; messageId: string },
  facts: MessageMenuFacts,
): MessageMenu {
  const { message } = facts;
  // A row that is not a message (a step, a note, an exchange) offers nothing; `pin` is the rule for exactly that.
  const notAMessage = messageActionProblem("pin", message);
  const waiting = message.status === "streaming" ? "Wait until the answer has finished." : null;
  const inQueue =
    message.delivery && ["queued", "starting", "running"].includes(message.delivery.status)
      ? "This message is still in the queue. Change it from the queue."
      : null;
  const history = (action: "retry" | "edit" | "delete"): string | null =>
    messageActionProblem(action, message) ??
    (facts.threadShown ? null : MESSAGE_MENU_HISTORY_THREAD_PROBLEM) ??
    facts.historyProblem;
  const make = (
    id: MessageMenuActionId,
    reason: string | null,
    extra: { needsConfirmation?: boolean; active?: boolean } = {},
  ): MessageMenuAction => {
    const blocked = notAMessage ?? reason;
    return {
      id,
      enabled: blocked === null,
      reason: blocked,
      needsConfirmation: extra.needsConfirmation ?? false,
      active: extra.active ?? false,
    };
  };
  const pinFull = !facts.pinned && facts.pinCount >= MESSAGE_ACTION_LIMITS.pinsPerThread;
  return {
    ...target,
    pinned: facts.pinned,
    actions: [
      make("copy", null),
      make("react", null),
      make(
        "pin",
        pinFull ? `At most ${MESSAGE_ACTION_LIMITS.pinsPerThread} messages can be pinned in a thread.` : null,
        {
          active: facts.pinned,
        },
      ),
      make(
        "branch",
        waiting ??
          inQueue ??
          (facts.branchRoom ? null : `An agent has at most ${THREAD_LIMITS.threadsPerAgent} threads.`),
      ),
      make("retry", history("retry")),
      make("edit", history("edit"), { needsConfirmation: editNeedsConfirmation(facts.laterMessages) }),
      make("delete", history("delete"), { needsConfirmation: true }),
    ],
    reactions: {
      quick: [...MESSAGE_REACTIONS],
      more: [...MORE_MESSAGE_REACTIONS],
      current: message.reaction ?? null,
    },
  };
}

// -- guards ------------------------------------------------------------------------------------------------------------------

function isAction(value: unknown): value is MessageMenuAction {
  return (
    isDynamicRecord(value) &&
    isOneOf(MESSAGE_MENU_ACTION_IDS, value.id) &&
    isBoolean(value.enabled) &&
    (value.reason === null || isString(value.reason)) &&
    (value.enabled ? value.reason === null : isString(value.reason)) &&
    isBoolean(value.needsConfirmation) &&
    isBoolean(value.active)
  );
}

export function isMessageMenu(value: unknown): value is MessageMenu {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    isString(value.threadId) &&
    isString(value.messageId) &&
    isBoolean(value.pinned) &&
    Array.isArray(value.actions) &&
    value.actions.every(isAction) &&
    value.actions.map((action) => action.id).join() === MESSAGE_MENU_ACTION_IDS.join() &&
    isDynamicRecord(value.reactions) &&
    Array.isArray(value.reactions.quick) &&
    value.reactions.quick.every((emoji) => isOneOf(ALL_MESSAGE_REACTIONS, emoji)) &&
    Array.isArray(value.reactions.more) &&
    value.reactions.more.every((emoji) => isOneOf(ALL_MESSAGE_REACTIONS, emoji)) &&
    (value.reactions.current === null || isOneOf(ALL_MESSAGE_REACTIONS, value.reactions.current))
  );
}
