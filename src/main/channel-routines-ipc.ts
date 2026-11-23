// COSGRAL W12 (BE-R): the `channel-routines:*` IPC (this computer only). The server is checked first, then the service is asked (it parses the
// request with the contract before it reads or changes anything).

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { ChannelRoutineService } from "../backend/channel-routines";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerChannelRoutinesIpc(service: () => ChannelRoutineService | null): void {
  const handle = <R>(channel: string, work: (engine: ChannelRoutineService, payload: unknown) => R): void =>
    handleTrusted(channel, (input: unknown) => {
      const request = parseAgentRequest(input);
      if (request.serverId !== "local") throw new Error("This is available on this computer only.");
      const engine = service();
      if (!engine) throw new Error("COSGRAL Workspace is still starting.");
      return work(engine, request.payload);
    });
  handle(IPC_CHANNELS.channelRoutinesList, (engine, payload) => engine.list(payload));
  handle(IPC_CHANNELS.channelRoutinesCreate, (engine, payload) => engine.create(payload));
  handle(IPC_CHANNELS.channelRoutinesUpdate, (engine, payload) => engine.update(payload));
  handle(IPC_CHANNELS.channelRoutinesDelete, (engine, payload) => engine.delete(payload));
  handle(IPC_CHANNELS.channelRoutinesRunNow, (engine, payload) => engine.runNow(payload));
  handle(IPC_CHANNELS.channelRoutinesListRuns, (engine, payload) => engine.listRuns(payload));
  handle(IPC_CHANNELS.channelRoutinesEnableWebhook, (engine, payload) => engine.enableWebhook(payload));
  handle(IPC_CHANNELS.channelRoutinesDisableWebhook, (engine, payload) => engine.disableWebhook(payload));
}
