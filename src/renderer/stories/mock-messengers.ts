// COSGRAL W10-KK2: the Telegram bridge for Storybook and the preview. Demo data only; nothing is contacted. The same rules as
// the program: the token is write-only (never in any answer), nobody is allowed by default, a message from a chat that is not on
// the list is ignored (the settings only learn its number and name), the list is limited, disconnecting removes the token but keeps
// the list. `simulate` plays a message coming in, a refused token and a network failure.

import {
  type AgentEvent,
  emptyMessengerStatus,
  MESSENGER_FAILURE_SENTENCES,
  MESSENGER_KINDS,
  MESSENGER_LIMITS,
  type MessengerKind,
  type MessengerList,
  type MessengerStatus,
  type MessengersDesktopApi,
  normalizeChatLabel,
  parseAllowChatInput,
  parseConnectMessengerInput,
  parseMessengerKindInput,
  parseRemoveChatInput,
} from "@openbot/contracts/ipc";

export interface MockMessengers extends Required<MessengersDesktopApi> {
  simulate: {
    /** A person wrote a text to the bot. Answers `forwarded` (an allowed chat) or `ignored` (nobody is told). */
    incoming: (input: {
      kind?: MessengerKind;
      chatId: string;
      label?: string;
      text: string;
    }) => "forwarded" | "ignored";
    /** The agent answered a forwarded message; the answer goes back to the chat. */
    replied: (kind?: MessengerKind) => void;
    /** Telegram refused the token (it was revoked): the program stops and says so. */
    tokenRefused: (kind?: MessengerKind) => void;
    /** The network is down: the program keeps the token and tries again. */
    networkDown: (kind?: MessengerKind) => void;
    /** The network is back. */
    networkUp: (kind?: MessengerKind) => void;
  };
}

/** The public name the demo bot of each messenger shows. */
function demoBotName(kind: MessengerKind): "@cosgral_demo" | "@demo_helper_bot" | "@cosgral_discord" {
  if (kind === "discord") return "@cosgral_discord";
  return kind === "slack" ? "@cosgral_demo" : "@demo_helper_bot";
}

export function createMockMessengers(emit: (event: AgentEvent) => void, spaceId = "main"): MockMessengers {
  let clock = Date.parse("2026-11-17T08:00:00.000Z");
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const statuses = new Map<MessengerKind, MessengerStatus>(
    MESSENGER_KINDS.map((kind) => [kind, emptyMessengerStatus(kind)]),
  );
  const current = (kind: MessengerKind): MessengerStatus => {
    const status = statuses.get(kind);
    if (status === undefined) throw new Error("Unknown messenger.");
    return status;
  };
  const snapshot = (): MessengerList => ({
    spaceId,
    messengers: MESSENGER_KINDS.map((kind) => structuredClone(current(kind))),
  });
  const changed = () => emit({ type: "messengers-changed", ...snapshot() });
  const update = (kind: MessengerKind, change: (status: MessengerStatus) => void) => {
    change(current(kind));
    changed();
  };

  return {
    list: async () => snapshot(),
    status: async (input) => structuredClone(current(parseMessengerKindInput(input).kind)),
    connect: async (input) => {
      // The token is checked for its shape and then dropped: the mock does not keep it.
      const { kind } = parseConnectMessengerInput(input);
      update(kind, (status) => {
        status.phase = "connected";
        status.tokenSaved = true;
        status.reason = null;
        status.botUsername = demoBotName(kind);
        status.connectedAt = now();
      });
      return structuredClone(current(kind));
    },
    disconnect: async (input) => {
      const { kind } = parseMessengerKindInput(input);
      update(kind, (status) => {
        status.phase = "disconnected";
        status.tokenSaved = false;
        status.reason = null;
        status.botUsername = null;
        status.connectedAt = null;
      });
      return snapshot();
    },
    allowChat: async (input) => {
      const parsed = parseAllowChatInput(input);
      const status = current(parsed.kind);
      const existing = status.allowedChats.find((chat) => chat.chatId === parsed.chatId);
      if (existing === undefined && status.allowedChats.length >= MESSENGER_LIMITS.allowedChats) {
        throw new Error(`At most ${MESSENGER_LIMITS.allowedChats} chats can be allowed.`);
      }
      const unknown = status.unknownChats.find((chat) => chat.chatId === parsed.chatId);
      const label = parsed.label ?? existing?.label ?? unknown?.label ?? parsed.chatId;
      update(parsed.kind, (target) => {
        target.allowedChats = [
          ...target.allowedChats.filter((chat) => chat.chatId !== parsed.chatId),
          { chatId: parsed.chatId, label, botId: parsed.botId, addedAt: existing?.addedAt ?? now() },
        ];
        target.unknownChats = target.unknownChats.filter((chat) => chat.chatId !== parsed.chatId);
      });
      return snapshot();
    },
    removeChat: async (input) => {
      const parsed = parseRemoveChatInput(input);
      update(parsed.kind, (target) => {
        target.allowedChats = target.allowedChats.filter((chat) => chat.chatId !== parsed.chatId);
      });
      return snapshot();
    },
    simulate: {
      incoming: ({ kind = "telegram", chatId, label, text }) => {
        const status = current(kind);
        if (status.phase !== "connected") return "ignored";
        const allowed = status.allowedChats.some((chat) => chat.chatId === chatId);
        if (allowed && text.length <= MESSENGER_LIMITS.incomingText) {
          update(kind, (target) => {
            target.counts.forwarded += 1;
          });
          return "forwarded";
        }
        update(kind, (target) => {
          target.counts.ignored += 1;
          if (allowed) return;
          // An unknown chat is remembered by number and name only, never by its text.
          const seen = target.unknownChats.find((chat) => chat.chatId === chatId);
          const tidy = normalizeChatLabel(label ?? chatId) || chatId;
          const rest = target.unknownChats.filter((chat) => chat.chatId !== chatId);
          target.unknownChats = [
            ...rest,
            { chatId, label: tidy, lastSeenAt: now(), count: (seen?.count ?? 0) + 1 },
          ].slice(-MESSENGER_LIMITS.unknownChats);
        });
        return "ignored";
      },
      replied: (kind = "telegram") =>
        update(kind, (target) => {
          target.counts.replied += 1;
        }),
      tokenRefused: (kind = "telegram") =>
        update(kind, (target) => {
          target.phase = "failed";
          target.reason = MESSENGER_FAILURE_SENTENCES[kind].tokenRefused;
          target.botUsername = null;
          target.connectedAt = null;
        }),
      networkDown: (kind = "telegram") =>
        update(kind, (target) => {
          target.phase = "failed";
          target.reason = MESSENGER_FAILURE_SENTENCES[kind].network;
        }),
      networkUp: (kind = "telegram") =>
        update(kind, (target) => {
          target.phase = "connected";
          target.reason = null;
          target.botUsername = target.botUsername ?? demoBotName(kind);
          target.connectedAt = target.connectedAt ?? now();
        }),
    },
  };
}
