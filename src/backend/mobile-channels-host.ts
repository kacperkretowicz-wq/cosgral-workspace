// COSGRAL W12 (BE-AB): the phone's view of the channels, on the same store and engine as the window.
import type { ChannelEngine } from "./channel-engine";
import type { ChannelStore } from "./channel-store";
import type { MobilePhoneChannels } from "./mobile-phone-api";

export function mobilePhoneChannels(store: ChannelStore, engine: ChannelEngine): MobilePhoneChannels {
  return {
    list: () => store.list(),
    tasks: (channelId) => store.listTasks(channelId),
    messages: (channelId, page) =>
      store.listMessages(channelId, {
        limit: page.limit,
        ...(page.before === null ? {} : { beforeMessageId: page.before }),
      }),
    send: (input) => engine.sendMessage(input),
    act: (input) => engine.actOnTask(input),
  };
}
