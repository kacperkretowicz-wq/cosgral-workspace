// COSGRAL W6-BE5: IPC for the ready ACP agent settings (list, add). This computer only: the commands are programs on this
// computer. Every call checks its input with the contract parsers before any work. Nothing is installed or started.

import { IPC_CHANNELS, parseAddAcpPresetInput } from "@openbot/contracts/ipc";
import { AcpPresets } from "../backend/acp-presets";
import type { ProviderRegistry } from "../backend/provider-registry";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerAcpPresetsIpc(registry: () => ProviderRegistry | null): void {
  const handle = <T, R>(channel: string, parse: (payload: unknown) => T, work: (presets: AcpPresets, input: T) => R) =>
    handleTrusted(channel, (input: unknown) => {
      const scoped = parseAgentRequest(input);
      if (scoped.serverId !== "local") throw new Error("Ready settings are added only on this computer for now.");
      const parsed = parse(scoped.payload);
      const providers = registry();
      if (!providers) throw new Error("The agent is still starting.");
      return work(new AcpPresets({ registry: providers }), parsed);
    });
  handle(
    IPC_CHANNELS.acpPresetsList,
    () => null,
    (presets) => presets.list(),
  );
  handle(IPC_CHANNELS.acpPresetsAdd, parseAddAcpPresetInput, (presets, input) => presets.add(input));
}
