// COSGRAL W5-K2: the `endpoints:*` IPC (this computer only). The key comes in once (`save`) and never goes out: every
// answer is a ModelEndpoint with a mask and a state. The model list is fetched only by `check` and `detect-local`,
// which the person starts.

import { IPC_CHANNELS, parseEndpointIdInput, parseSaveEndpointInput } from "@openbot/contracts/ipc";
import type { EndpointStore } from "../backend/endpoint-store";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerEndpointsIpc(store: () => EndpointStore | null): void {
  const current = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Model endpoints are kept on this computer only.");
    const value = store();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return { store: value, payload: request.payload };
  };
  handleTrusted(IPC_CHANNELS.endpointsList, (input: unknown) => current(input).store.list());
  handleTrusted(IPC_CHANNELS.endpointsSave, (input: unknown) => {
    const { store: endpoints, payload } = current(input);
    return endpoints.save(parseSaveEndpointInput(payload));
  });
  handleTrusted(IPC_CHANNELS.endpointsRemove, (input: unknown) => {
    const { store: endpoints, payload } = current(input);
    endpoints.remove(parseEndpointIdInput(payload).id);
  });
  handleTrusted(IPC_CHANNELS.endpointsCheck, (input: unknown) => {
    const { store: endpoints, payload } = current(input);
    return endpoints.check(parseEndpointIdInput(payload).id);
  });
  handleTrusted(IPC_CHANNELS.endpointsDetectLocal, (input: unknown) => current(input).store.detectLocal());
}
