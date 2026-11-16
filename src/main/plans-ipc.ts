// COSGRAL W6-BE3: IPC for the plan card (Approve / Reject, the plans of a thread). This computer only: a plan acts in the
// user's name on this computer, so a remote server or a phone does not answer it here. Every call checks its input with
// the contract parsers before any work.

import { IPC_CHANNELS, parseListPlansInput, parseRespondToPlanInput } from "@openbot/contracts/ipc";
import type { AgentService } from "../backend/agent-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerPlansIpc(service: () => AgentService | null): void {
  const handle = <T, R>(
    channel: string,
    parse: (payload: unknown) => T,
    work: (agents: AgentService, input: T) => Promise<R>,
  ) =>
    handleTrusted(channel, (input: unknown) => {
      const scoped = parseAgentRequest(input);
      if (scoped.serverId !== "local") throw new Error("Plans are answered only on this computer for now.");
      const parsed = parse(scoped.payload);
      const agents = service();
      if (!agents) throw new Error("The agent is still starting.");
      return work(agents, parsed);
    });
  handle(IPC_CHANNELS.plansRespond, parseRespondToPlanInput, (agents, input) => agents.respondToPlan(input));
  handle(IPC_CHANNELS.plansList, parseListPlansInput, (agents, input) => agents.listPlans(input));
}
