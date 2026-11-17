// COSGRAL W12 (BE-D): the `agent-cards:*` IPC (this computer only). The order of every call: the server is checked first, then the
// request is parsed by the contract, and only then the engine is asked.

import { IPC_CHANNELS, parseAgentCardsBotInput } from "@openbot/contracts/ipc";
import type { AgentCardsService } from "../backend/agent-cards";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerAgentCardsIpc(service: () => AgentCardsService | null): void {
  const handle = <R>(channel: string, work: (engine: AgentCardsService, payload: unknown) => R): void =>
    handleTrusted(channel, (input: unknown) => {
      const request = parseAgentRequest(input);
      if (request.serverId !== "local") throw new Error("This is available on this computer only.");
      const engine = service();
      if (!engine) throw new Error("COSGRAL Workspace is still starting.");
      return work(engine, request.payload);
    });
  handle(IPC_CHANNELS.agentCardsOverview, (engine, payload) => engine.overview(parseAgentCardsBotInput(payload)));
  handle(IPC_CHANNELS.agentCardsGetPreferences, (engine, payload) =>
    engine.getPreferences(parseAgentCardsBotInput(payload)),
  );
  handle(IPC_CHANNELS.agentCardsUpdatePreferences, (engine, payload) => engine.updatePreferences(payload));
  handle(IPC_CHANNELS.agentCardsResetSession, (engine, payload) =>
    engine.resetSession(parseAgentCardsBotInput(payload)),
  );
  handle(IPC_CHANNELS.agentCardsDetails, (engine, payload) => engine.details(payload));
  handle(IPC_CHANNELS.agentCardsPublishTemplate, (engine, payload) => engine.publishTemplate(payload));
  handle(IPC_CHANNELS.agentCardsUnpublishTemplate, (engine, payload) => engine.unpublishTemplate(payload));
}
