// COSGRAL W12-KK (g2): the `update-preferences:*` IPC (this computer only).

import { IPC_CHANNELS, parseSetUpdatePreferencesInput } from "@openbot/contracts/ipc";
import type { UpdatePreferencesService } from "../backend/update-preferences";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerUpdatePreferencesIpc(service: () => UpdatePreferencesService | null): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Update preferences are managed on this computer only.");
    return request.payload;
  };
  const current = (): UpdatePreferencesService => {
    const value = service();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.updatePreferencesGet, (input: unknown) => {
    local(input);
    return current().get();
  });
  handleTrusted(IPC_CHANNELS.updatePreferencesSet, (input: unknown) => {
    const request = parseSetUpdatePreferencesInput(local(input));
    return current().set(request);
  });
}
