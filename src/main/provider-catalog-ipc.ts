// COSGRAL W12 (BE-E): the `provider-catalog:*` IPC (this computer only). The order of every call: the server is checked first, then the
// engine is asked (a key is parsed by the contract inside the engine, before anything is saved).

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { ProviderCatalogService } from "../backend/provider-catalog";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerProviderCatalogIpc(service: () => ProviderCatalogService | null): void {
  const handle = <R>(channel: string, work: (engine: ProviderCatalogService, payload: unknown) => R): void =>
    handleTrusted(channel, (input: unknown) => {
      const request = parseAgentRequest(input);
      if (request.serverId !== "local") throw new Error("This is available on this computer only.");
      const engine = service();
      if (!engine) throw new Error("COSGRAL Workspace is still starting.");
      return work(engine, request.payload);
    });
  handle(IPC_CHANNELS.providerCatalogList, (engine) => engine.list());
  handle(IPC_CHANNELS.providerCatalogSetKey, (engine, payload) => engine.setKey(payload));
  handle(IPC_CHANNELS.providerCatalogClearKey, (engine, payload) => engine.clearKey(payload));
}
