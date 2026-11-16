// COSGRAL W8-BE1: IPC of the access levels. This computer only: the level of an agent says what it may do on THIS disk, so a
// remote server or a phone may not read or change it here. Every call checks its input with the contract parsers first.
// Raising a level is a card of "Needs you": the call only asks for it (the answer says so), it never changes the level.

import {
  IPC_CHANNELS,
  parseAccessAgentInput,
  parseSetAccessFoldersInput,
  parseSetAccessLevelInput,
} from "@openbot/contracts/ipc";
import type { AccessService } from "../backend/access-service";
import type { AgentService } from "../backend/agent-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerAccessIpc(service: () => AgentService | null): void {
  const handle = <T, R>(
    channel: string,
    parse: (payload: unknown) => T,
    work: (access: AccessService, input: T, agents: AgentService) => R,
    remote?: () => R,
  ) =>
    handleTrusted(channel, (input: unknown) => {
      const scoped = parseAgentRequest(input);
      if (scoped.serverId !== "local") {
        // A list of another server is empty (never data); a change or a read of one agent is an error.
        if (remote) return remote();
        throw new Error("Access levels are kept only on this computer.");
      }
      const parsed = parse(scoped.payload);
      const agents = service();
      if (!agents?.access) throw new Error("The agent is still starting.");
      return work(agents.access, parsed, agents);
    });
  handle(IPC_CHANNELS.accessGet, parseAccessAgentInput, (access, input) => access.get(input.botId));
  handle(
    IPC_CHANNELS.accessList,
    () => null,
    (access, _input, agents) => access.list(agents.listBots().map((bot) => bot.id)),
    () => [],
  );
  handle(IPC_CHANNELS.accessSetFolders, parseSetAccessFoldersInput, (access, input) => access.setFolders(input));
  handle(IPC_CHANNELS.accessSetLevel, parseSetAccessLevelInput, (access, input) => access.setLevel(input));
}
