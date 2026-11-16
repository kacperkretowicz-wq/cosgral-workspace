// COSGRAL W6-BE4: IPC for the subagents (list, Stop). This computer only: a subagent works on this computer in the
// agent's name, so a remote server or a phone may not list or stop it here. Only the agent starts a subagent (Q11); the
// window can watch and stop. Every call checks its input with the contract parsers before any work.

import { IPC_CHANNELS, parseListSubagentsInput, parseStopSubagentInput } from "@openbot/contracts/ipc";
import type { AgentService } from "../backend/agent-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerSubagentsIpc(service: () => AgentService | null): void {
  const handle = <T, R>(
    channel: string,
    parse: (payload: unknown) => T,
    work: (agents: AgentService, input: T) => Promise<R>,
  ) =>
    handleTrusted(channel, (input: unknown) => {
      const scoped = parseAgentRequest(input);
      if (scoped.serverId !== "local") throw new Error("Subagents are managed only on this computer for now.");
      const parsed = parse(scoped.payload);
      const agents = service();
      if (!agents) throw new Error("The agent is still starting.");
      return work(agents, parsed);
    });
  handle(IPC_CHANNELS.subagentsList, parseListSubagentsInput, (agents, input) => agents.listSubagents(input));
  handle(IPC_CHANNELS.subagentsStop, parseStopSubagentInput, (agents, input) => agents.stopSubagent(input));
}
