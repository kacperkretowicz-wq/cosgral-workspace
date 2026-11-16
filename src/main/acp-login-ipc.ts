// COSGRAL W6-BE5: IPC for signing in to ACP agents (list, start, code, cancel). This computer only: the sign-in belongs to the
// person at this computer, so a remote server or a phone may not start it or pass a code. Every call checks its input with the
// contract parsers before any work. The window opens the sign-in link itself (`openUrl`) when the person clicks.

import {
  IPC_CHANNELS,
  parseAcpLoginAgentInput,
  parseStartAcpLoginInput,
  parseSubmitAcpLoginCodeInput,
} from "@openbot/contracts/ipc";
import type { AgentService } from "../backend/agent-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerAcpLoginIpc(service: () => AgentService | null): void {
  const handle = <T, R>(
    channel: string,
    parse: (payload: unknown) => T,
    work: (agents: AgentService, input: T) => R | Promise<R>,
  ) =>
    handleTrusted(channel, (input: unknown) => {
      const scoped = parseAgentRequest(input);
      if (scoped.serverId !== "local") throw new Error("Agents are signed in only on this computer for now.");
      const parsed = parse(scoped.payload);
      const agents = service();
      if (!agents) throw new Error("The agent is still starting.");
      return work(agents, parsed);
    });
  handle(
    IPC_CHANNELS.acpLoginList,
    () => null,
    (agents) => agents.listAcpLogins(),
  );
  handle(IPC_CHANNELS.acpLoginStart, parseStartAcpLoginInput, (agents, input) => agents.startAcpLogin(input));
  handle(IPC_CHANNELS.acpLoginSubmitCode, parseSubmitAcpLoginCodeInput, (agents, input) =>
    agents.submitAcpLoginCode(input),
  );
  handle(IPC_CHANNELS.acpLoginCancel, parseAcpLoginAgentInput, (agents, input) => agents.cancelAcpLogin(input));
}
