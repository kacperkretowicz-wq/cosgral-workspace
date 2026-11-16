// COSGRAL W8-BE2: IPC of the isolation of processes. This computer only: what the computer can isolate, and what is in force for
// an agent, belongs to THIS computer. Every call checks its input with the contract parsers first. Turning isolation off is a
// card of "Needs you": the call only asks for it (the answer says so) and never changes it.

import { IPC_CHANNELS, parseIsolationAgentInput, parseSetIsolationEnabledInput } from "@openbot/contracts/ipc";
import type { AgentService } from "../backend/agent-service";
import type { IsolationService } from "../backend/isolation-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerIsolationIpc(service: () => AgentService | null): void {
  const handle = <T, R>(
    channel: string,
    parse: (payload: unknown) => T,
    work: (isolation: IsolationService, input: T) => R,
    remote?: () => R,
  ) =>
    handleTrusted(channel, (input: unknown) => {
      const scoped = parseAgentRequest(input);
      if (scoped.serverId !== "local") {
        // The list of another server is empty (never data); anything else is an error.
        if (remote) return remote();
        throw new Error("Isolation is kept only on this computer.");
      }
      const parsed = parse(scoped.payload);
      const isolation = service()?.isolation;
      if (!isolation) throw new Error("The agent is still starting.");
      return work(isolation, parsed);
    });
  const nothing = () => null;
  handle(IPC_CHANNELS.isolationAvailability, nothing, (isolation) => isolation.availability());
  handle(
    IPC_CHANNELS.isolationList,
    nothing,
    (isolation) => isolation.list(),
    () => [],
  );
  handle(IPC_CHANNELS.isolationGet, parseIsolationAgentInput, (isolation, input) => isolation.get(input.botId));
  handle(IPC_CHANNELS.isolationSetEnabled, parseSetIsolationEnabledInput, (isolation, input) =>
    isolation.setEnabled(input),
  );
  handle(IPC_CHANNELS.isolationRecheck, nothing, (isolation) => isolation.recheck());
}
