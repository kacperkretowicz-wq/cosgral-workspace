// COSGRAL W3: IPC for ACP agents, fallback models, usage and limits. This computer only, like routines and MCP.

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { ProviderRegistry } from "../backend/provider-registry";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { parseAcpAgentId, parseFallbackBotId, parseFallbackModels, parseSaveAcpAgent } from "./ipc/provider-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerProviderIpc(registry: ProviderRegistry): void {
  handleTrusted(IPC_CHANNELS.providersListAcpAgents, (input: unknown) =>
    isLocal(input) ? registry.listAcpAgents() : [],
  );
  handleTrusted(IPC_CHANNELS.providersSaveAcpAgent, (input: unknown) =>
    registry.saveAcpAgent(localInput(input, parseSaveAcpAgent)),
  );
  handleTrusted(IPC_CHANNELS.providersRemoveAcpAgent, (input: unknown) => {
    registry.removeAcpAgent(localInput(input, parseAcpAgentId));
  });
  handleTrusted(IPC_CHANNELS.providersListUsage, (input: unknown) => (isLocal(input) ? registry.listUsage() : []));
  handleTrusted(IPC_CHANNELS.providersGetFallbackModels, (input: unknown) =>
    registry.getFallbackModels(localInput(input, parseFallbackBotId)),
  );
  handleTrusted(IPC_CHANNELS.providersSetFallbackModels, (input: unknown) =>
    registry.setFallbackModels(localInput(input, parseFallbackModels)),
  );
}

function isLocal(input: unknown): boolean {
  return parseAgentRequest(input).serverId === "local";
}

function localInput<T>(input: unknown, parse: (payload: unknown) => T): T {
  const scoped = parseAgentRequest(input);
  if (scoped.serverId !== "local") throw new Error("Providers are set up only on this computer for now.");
  return parse(scoped.payload);
}
