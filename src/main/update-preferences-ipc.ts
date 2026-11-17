// COSGRAL W12-KK (g2): the `update-preferences:*` IPC (this computer only).

import { buildUpdatesOverview, IPC_CHANNELS, parseSetUpdatePreferencesInput } from "@openbot/contracts/ipc";
import type { UpdatePreferencesService } from "../backend/update-preferences";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";
import type { UpdateService } from "./update-service";

/** `updater` is the update engine, `isIdle` says that no agent is working (for "Restart when idle"). */
export function registerUpdatePreferencesIpc(
  service: () => UpdatePreferencesService | null,
  updater: () => UpdateService | null = () => null,
  isIdle: () => boolean = () => true,
): void {
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
  const overview = () => {
    const engine = updater();
    if (!engine) throw new Error("COSGRAL Workspace is still starting.");
    return buildUpdatesOverview({
      preferences: current().get(),
      status: engine.getStatus(),
      restartPending: engine.restartPending,
    });
  };
  handleTrusted(IPC_CHANNELS.updatePreferencesGetOverview, (input: unknown) => {
    local(input);
    return overview();
  });
  handleTrusted(IPC_CHANNELS.updatePreferencesRestartWhenIdle, (input: unknown) => {
    local(input);
    updater()?.restartWhenIdle(isIdle);
    return overview();
  });
  handleTrusted(IPC_CHANNELS.updatePreferencesCancelRestart, (input: unknown) => {
    local(input);
    updater()?.cancelRestartWhenIdle();
    return overview();
  });
  handleTrusted(IPC_CHANNELS.updatePreferencesSet, (input: unknown) => {
    const request = parseSetUpdatePreferencesInput(local(input));
    return current().set(request);
  });
}
