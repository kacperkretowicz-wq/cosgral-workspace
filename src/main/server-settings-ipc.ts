// COSGRAL W12 (BE-D): the `server-settings:*` IPC (this computer only). The order of every call: the server is checked first, then the
// engine is asked (an update is parsed by the contract inside the engine, before anything is written).

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { ServerSettingsService } from "../backend/server-settings";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerServerSettingsIpc(service: () => ServerSettingsService | null): void {
  const handle = <R>(channel: string, work: (engine: ServerSettingsService, payload: unknown) => R): void =>
    handleTrusted(channel, (input: unknown) => {
      const request = parseAgentRequest(input);
      if (request.serverId !== "local") throw new Error("This is available on this computer only.");
      const engine = service();
      if (!engine) throw new Error("COSGRAL Workspace is still starting.");
      return work(engine, request.payload);
    });
  handle(IPC_CHANNELS.serverSettingsSections, (engine) => engine.sections());
  handle(IPC_CHANNELS.serverSettingsGet, (engine) => engine.get());
  handle(IPC_CHANNELS.serverSettingsUpdate, (engine, payload) => engine.update(payload));
  handle(IPC_CHANNELS.serverSettingsMeasureStorage, (engine) => engine.measureStorage());
  handle(IPC_CHANNELS.serverSettingsClearLogs, (engine) => engine.clearLogs());
}
