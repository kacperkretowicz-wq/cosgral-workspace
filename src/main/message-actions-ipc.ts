// COSGRAL W6-BE3: IPC for the actions on a message (retry, edit, delete, pin). This computer only: they change the
// conversation of an agent that lives here. Every call checks its input with the contract parsers before any work.
// Delete needs `confirm: true` and edit needs it when messages follow (the window asks the person first).

import {
  IPC_CHANNELS,
  parseDeleteMessageInput,
  parseEditMessageInput,
  parseListPinsInput,
  parseRetryMessageInput as parseMessageMenuInput,
  parsePinMessageInput,
  parseRetryMessageInput,
} from "@openbot/contracts/ipc";
import type { AgentService } from "../backend/agent-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerMessageActionsIpc(service: () => AgentService | null): void {
  const handle = <T, R>(
    channel: string,
    parse: (payload: unknown) => T,
    work: (agents: AgentService, input: T) => Promise<R>,
  ) =>
    handleTrusted(channel, (input: unknown) => {
      const scoped = parseAgentRequest(input);
      if (scoped.serverId !== "local") throw new Error("Messages are changed only on this computer for now.");
      const parsed = parse(scoped.payload);
      const agents = service();
      if (!agents) throw new Error("The agent is still starting.");
      return work(agents, parsed);
    });
  handle(IPC_CHANNELS.messageActionsRetry, parseRetryMessageInput, (agents, input) => agents.retryMessage(input));
  handle(IPC_CHANNELS.messageActionsEdit, parseEditMessageInput, (agents, input) => agents.editMessage(input));
  handle(IPC_CHANNELS.messageActionsDelete, parseDeleteMessageInput, (agents, input) => agents.deleteMessage(input));
  handle(IPC_CHANNELS.messageActionsPin, parsePinMessageInput, (agents, input) => agents.pinMessage(input));
  // COSGRAL W12 (BE-J): the menu of one message (the same target as the actions).
  handle(IPC_CHANNELS.messageMenuGet, parseMessageMenuInput, (agents, input) => agents.messageMenu(input));
  handle(IPC_CHANNELS.messageActionsListPins, parseListPinsInput, (agents, input) => agents.listMessagePins(input));
}
