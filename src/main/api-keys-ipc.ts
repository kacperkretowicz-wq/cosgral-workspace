// COSGRAL W5-BE3: the `api-keys:*` IPC (this computer only). Keys come in once (`set`) and never go out: every answer
// is an ApiKeyEntry with a mask and a state.

import { IPC_CHANNELS, parseApiKeyProviderInput, parseSetApiKeyInput } from "@openbot/contracts/ipc";
import type { ApiKeyStore } from "../backend/api-key-store";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerApiKeysIpc(store: () => ApiKeyStore | null): void {
  const current = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("API keys are kept on this computer only.");
    const value = store();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return { store: value, payload: request.payload };
  };
  handleTrusted(IPC_CHANNELS.apiKeysList, (input: unknown) => current(input).store.list());
  handleTrusted(IPC_CHANNELS.apiKeysSet, (input: unknown) => {
    const { store: keys, payload } = current(input);
    const request = parseSetApiKeyInput(payload);
    return keys.set(request.provider, request.key);
  });
  handleTrusted(IPC_CHANNELS.apiKeysRemove, (input: unknown) => {
    const { store: keys, payload } = current(input);
    return keys.remove(parseApiKeyProviderInput(payload).provider);
  });
  handleTrusted(IPC_CHANNELS.apiKeysCheck, (input: unknown) => {
    const { store: keys, payload } = current(input);
    return keys.check(parseApiKeyProviderInput(payload).provider);
  });
}
