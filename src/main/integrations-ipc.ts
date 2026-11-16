// COSGRAL W10-KK1: the `integrations:*` IPC (this computer only): list, describe, status, configure, connect, cancel and
// disconnect the account sign-ins of the apps. Every request is parsed by the contract first. The sign-in address is opened by
// the manager through `openBrowser`, never by this file; nothing here ever sees a token or a code.

import {
  IPC_CHANNELS,
  parseConfigureIntegrationInput,
  parseDisconnectIntegrationInput,
  parseIntegrationServiceInput,
} from "@openbot/contracts/ipc";
import type { IntegrationManager } from "../backend/integration-manager";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerIntegrationsIpc(manager: () => IntegrationManager | null): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Account sign-ins are managed on this computer only.");
    return request.payload;
  };
  const current = (): IntegrationManager => {
    const value = manager();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  handleTrusted(IPC_CHANNELS.integrationsList, (input: unknown) => {
    local(input);
    return current().list();
  });
  handleTrusted(IPC_CHANNELS.integrationsDescribe, (input: unknown) => {
    const request = parseIntegrationServiceInput(local(input));
    return current().describe(request.service);
  });
  handleTrusted(IPC_CHANNELS.integrationsStatus, (input: unknown) => {
    const request = parseIntegrationServiceInput(local(input));
    return current().status(request.service);
  });
  handleTrusted(IPC_CHANNELS.integrationsConfigure, (input: unknown) => {
    const request = parseConfigureIntegrationInput(local(input));
    return current().configure(request);
  });
  handleTrusted(IPC_CHANNELS.integrationsConnect, (input: unknown) => {
    const request = parseIntegrationServiceInput(local(input));
    return current().connect(request.service);
  });
  handleTrusted(IPC_CHANNELS.integrationsCancel, (input: unknown) => {
    const request = parseIntegrationServiceInput(local(input));
    return current().cancel(request.service);
  });
  handleTrusted(IPC_CHANNELS.integrationsDisconnect, (input: unknown) => {
    const request = parseDisconnectIntegrationInput(local(input));
    return current().disconnect(request);
  });
}
