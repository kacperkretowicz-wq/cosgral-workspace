// COSGRAL W12-KK (2, step 0): Telegram as a messenger driver (the Bot API client stays in telegram-client.ts, unchanged).

import type { InboundMessage, MessengerDriver } from "./messenger-driver";
import { TelegramClient, type TelegramClientOptions } from "./telegram-client";

export function createTelegramDriver(options: TelegramClientOptions): MessengerDriver {
  const client = new TelegramClient(options);
  return {
    connect: async (signal) => {
      const name = await client.getMe(signal);
      // A bot with a webhook gets no long polling; the owner connects it here, so the webhook is removed (pending messages stay).
      await client.deleteWebhook(signal).catch(() => undefined);
      return name;
    },
    identify: (signal) => client.getMe(signal),
    receive: async (from, waitSeconds, signal) => {
      const updates = await client.getUpdates(from, waitSeconds, signal);
      return updates.map(
        (update): InboundMessage => ({
          next: update.updateId + 1,
          chat:
            update.chat === null
              ? null
              : {
                  id: String(update.chat.id),
                  kind: update.chat.type === "private" ? "private" : "other",
                  title: update.chat.title,
                },
          text: update.text,
        }),
      );
    },
    send: (chatId, text, signal) => client.sendMessage(chatId, text, signal),
    close: () => undefined,
  };
}
