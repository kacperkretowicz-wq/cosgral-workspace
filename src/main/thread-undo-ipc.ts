// COSGRAL W12 (BE-K): the `thread-undo:*` IPC (this computer only): delete a thread with a few minutes to bring it back. The server is
// checked first, then the service is asked (it parses the request with the contract before it touches anything).

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { AgentService } from "../backend/agent-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerThreadUndoIpc(service: () => AgentService | null): void {
  const handle = <R>(channel: string, work: (agents: AgentService, payload: unknown) => R): void =>
    handleTrusted(channel, (input: unknown) => {
      const request = parseAgentRequest(input);
      if (request.serverId !== "local") throw new Error("Threads are managed only on this computer for now.");
      const agents = service();
      if (!agents) throw new Error("The agent is still starting.");
      return work(agents, request.payload);
    });
  handle(IPC_CHANNELS.threadUndoDelete, (agents, payload) => agents.threadUndo.delete(payload));
  handle(IPC_CHANNELS.threadUndoUndo, (agents, payload) => agents.threadUndo.undo(payload));
  handle(IPC_CHANNELS.threadUndoList, (agents, payload) => agents.threadUndo.list(payload));
}
