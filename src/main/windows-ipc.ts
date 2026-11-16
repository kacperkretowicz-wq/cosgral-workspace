// COSGRAL W6-KK3: the `windows:*` IPC (this computer only): open, list and close the separate conversation windows, and
// ask "which conversation am I?". Every request is checked with the contract parsers first. Opening gives no new access
// to anything: the window is the same program with the same preload.

import {
  type ConversationWindowInfo,
  IPC_CHANNELS,
  parseConversationWindowHash,
  parseConversationWindowInput,
  parseOpenConversationInput,
} from "@openbot/contracts/ipc";
import type { ConversationWindows } from "./conversation-windows";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted, handleTrustedFrame } from "./trusted-ipc";

export function registerWindowsIpc(windows: () => ConversationWindows | null): void {
  const current = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Conversation windows are opened on this computer only.");
    return request.payload;
  };
  const keeper = () => {
    const value = windows();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.windowsOpenConversation, (input: unknown) => {
    const request = parseOpenConversationInput(current(input));
    return keeper().open(request);
  });
  handleTrusted(IPC_CHANNELS.windowsListOpen, (input: unknown) => {
    current(input);
    return keeper().list();
  });
  handleTrusted(IPC_CHANNELS.windowsClose, (input: unknown) => {
    const request = parseConversationWindowInput(current(input));
    keeper().close(request);
  });
  // The page names itself by its own address (`#conversation/<agent>/<thread>`); the main window and the dock have none.
  handleTrustedFrame(IPC_CHANNELS.windowsCurrent, (frameUrl, input: unknown): ConversationWindowInfo | null => {
    current(input);
    const target = frameUrl ? parseConversationWindowHash(new URL(frameUrl).hash) : null;
    return target ? keeper().get(target.botId, target.threadId) : null;
  });
}
