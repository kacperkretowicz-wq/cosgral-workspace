// COSGRAL W6-BE2: the `context:*` IPC (this computer only): the context state of a conversation, asking for a compaction
// and the settings of the automatic one. The numbers are only ever what the provider reported; nothing is made up here.

import {
  type ContextSettings,
  type ContextState,
  type ContextThreadInput,
  IPC_CHANNELS,
  isContextThreadInput,
  isUpdateContextSettingsInput,
  type UpdateContextSettingsInput,
} from "@openbot/contracts/ipc";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

/** What the handlers need of the engine (AgentService has all of it). */
export interface ContextPort {
  contextState(botId: string, threadId?: string | null): ContextState;
  compactContext(botId: string, threadId?: string | null): Promise<ContextState>;
  contextSettings(): ContextSettings;
  updateContextSettings(input: UpdateContextSettingsInput): ContextSettings;
}

export function registerContextIpc(engine: () => ContextPort | null): void {
  const current = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("The conversation context is kept on this computer only.");
    const value = engine();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return { engine: value, payload: request.payload };
  };
  const thread = (payload: unknown): ContextThreadInput => {
    if (!isContextThreadInput(payload)) throw new Error("A context request needs an agent id.");
    return payload;
  };
  handleTrusted(IPC_CHANNELS.contextGetState, (input: unknown) => {
    const { engine: context, payload } = current(input);
    const request = thread(payload);
    return context.contextState(request.botId, request.threadId);
  });
  handleTrusted(IPC_CHANNELS.contextCompact, (input: unknown) => {
    const { engine: context, payload } = current(input);
    const request = thread(payload);
    return context.compactContext(request.botId, request.threadId);
  });
  handleTrusted(IPC_CHANNELS.contextGetSettings, (input: unknown) => current(input).engine.contextSettings());
  handleTrusted(IPC_CHANNELS.contextUpdateSettings, (input: unknown) => {
    const { engine: context, payload } = current(input);
    if (!isUpdateContextSettingsInput(payload)) throw new Error("The context settings request is malformed.");
    return context.updateContextSettings(payload);
  });
}
