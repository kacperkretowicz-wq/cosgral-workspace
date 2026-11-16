// COSGRAL W6-BE1: IPC for the threads of an agent. This computer only (a remote server or a phone may not manage the
// threads of an agent here). Every call checks its input with the contract parsers and answers the agent's whole list.

import {
  IPC_CHANNELS,
  parseBranchThreadInput,
  parseCreateThreadInput,
  parseDeleteThreadInput,
  parseListThreadsInput,
  parseRenameThreadInput,
  parseThreadInput,
  type ThreadList,
} from "@openbot/contracts/ipc";
import type { AgentService } from "../backend/agent-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerThreadsIpc(service: () => AgentService | null): void {
  const handle = <T>(
    channel: string,
    parse: (payload: unknown) => T,
    work: (agents: AgentService, input: T) => Promise<ThreadList>,
  ) =>
    handleTrusted(channel, (input: unknown) => {
      const scoped = parseAgentRequest(input);
      if (scoped.serverId !== "local") throw new Error("Threads are managed only on this computer for now.");
      // A wrong call is refused by the contract parser before anything else.
      const parsed = parse(scoped.payload);
      const agents = service();
      if (!agents) throw new Error("The agent is still starting.");
      return work(agents, parsed);
    });
  handle(IPC_CHANNELS.threadsList, parseListThreadsInput, (agents, input) => agents.listThreads(input.botId));
  handle(IPC_CHANNELS.threadsCreate, parseCreateThreadInput, (agents, input) => agents.createThread(input));
  handle(IPC_CHANNELS.threadsRename, parseRenameThreadInput, (agents, input) => agents.renameThread(input));
  handle(IPC_CHANNELS.threadsArchive, parseThreadInput, (agents, input) => agents.archiveThread(input));
  handle(IPC_CHANNELS.threadsRestore, parseThreadInput, (agents, input) => agents.restoreThread(input));
  handle(IPC_CHANNELS.threadsDelete, parseDeleteThreadInput, (agents, input) => agents.deleteThread(input));
  handle(IPC_CHANNELS.threadsSelect, parseThreadInput, (agents, input) => agents.selectThread(input));
  handle(IPC_CHANNELS.threadsBranch, parseBranchThreadInput, (agents, input) => agents.branchThread(input));
}
