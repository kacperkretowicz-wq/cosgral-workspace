// COSGRAL W10-KK2: the `messengers:*` IPC (this computer only): list, status, connect (token write-only), disconnect and the allow
// list of chats of the Telegram bridge. Every request is parsed by the contract first; the token is only handed to the bridge and
// is never echoed: an error is the parser's sentence or the bridge's fixed one.

import {
  IPC_CHANNELS,
  parseAllowChatInput,
  parseConnectMessengerInput,
  parseMessengerKindInput,
  parseRemoveChatInput,
} from "@openbot/contracts/ipc";
import type { MessengerBridge } from "../backend/messenger-bridge";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerMessengersIpc(bridge: () => MessengerBridge | null): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Messengers are managed on this computer only.");
    return request.payload;
  };
  const current = (): MessengerBridge => {
    const value = bridge();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.messengersList, (input: unknown) => {
    local(input);
    return current().list();
  });
  handleTrusted(IPC_CHANNELS.messengersStatus, (input: unknown) => {
    const request = parseMessengerKindInput(local(input));
    return current().status(request.kind);
  });
  handleTrusted(IPC_CHANNELS.messengersConnect, (input: unknown) => {
    const request = parseConnectMessengerInput(local(input));
    return current().connect(request.kind, request.token);
  });
  handleTrusted(IPC_CHANNELS.messengersDisconnect, (input: unknown) => {
    const request = parseMessengerKindInput(local(input));
    return current().disconnect(request.kind);
  });
  handleTrusted(IPC_CHANNELS.messengersAllowChat, (input: unknown) => {
    const request = parseAllowChatInput(local(input));
    return current().allowChat(request);
  });
  handleTrusted(IPC_CHANNELS.messengersRemoveChat, (input: unknown) => {
    const request = parseRemoveChatInput(local(input));
    return current().removeChat(request);
  });
}
