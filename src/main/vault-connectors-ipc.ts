// COSGRAL W11-KK (d): the `vault-connectors:*` and person's Vault tool IPC (this computer only). Every request is parsed by the
// contract first; a token or key is only handed to the connector and is never echoed: an error is the parser's sentence or a
// connector's fixed one.

import {
  IPC_CHANNELS,
  parseConnectVaultConnectorInput,
  parseImportVaultCsvInput,
  parseVaultConnectorIdInput,
  parseVaultItemFieldInput,
  type VaultConnectorId,
} from "@openbot/contracts/ipc";
import type { VaultConnectorHub } from "../backend/vault-connectors/vault-connector-hub";
import type { VaultSecretsService } from "../backend/vault-connectors/vault-secrets-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerVaultConnectorsIpc(
  hub: () => VaultConnectorHub | null,
  secrets: () => VaultSecretsService | null,
): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("The Vault is managed on this computer only.");
    return request.payload;
  };
  const connectors = (): VaultConnectorHub => {
    const value = hub();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  const tools = (): VaultSecretsService => {
    const value = secrets();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  // The request is parsed BEFORE the program is asked, so a wrong request is refused with the parser's sentence.
  const byId = (channel: string, run: (hub: VaultConnectorHub, connector: VaultConnectorId) => unknown) =>
    handleTrusted(channel, (input: unknown) => {
      const { connector } = parseVaultConnectorIdInput(local(input));
      return run(connectors(), connector);
    });
  handleTrusted(IPC_CHANNELS.vaultConnectorsList, (input: unknown) => {
    local(input);
    return connectors().list();
  });
  byId(IPC_CHANNELS.vaultConnectorsStatus, (hub, connector) => hub.status(connector));
  byId(IPC_CHANNELS.vaultConnectorsCheckSetup, (hub, connector) => hub.checkSetup(connector));
  byId(IPC_CHANNELS.vaultConnectorsInstallCli, (hub, connector) => hub.installCli(connector));
  byId(IPC_CHANNELS.vaultConnectorsOpenApp, (hub, connector) => hub.openApp(connector));
  byId(IPC_CHANNELS.vaultConnectorsListLogins, (hub, connector) => hub.listLogins(connector));
  byId(IPC_CHANNELS.vaultConnectorsCancel, (hub, connector) => hub.cancel(connector));
  byId(IPC_CHANNELS.vaultConnectorsDisconnect, (hub, connector) => hub.disconnect(connector));
  handleTrusted(IPC_CHANNELS.vaultConnectorsConnect, (input: unknown) => {
    const request = parseConnectVaultConnectorInput(local(input));
    return connectors().connect(request);
  });
  handleTrusted(IPC_CHANNELS.vaultReveal, (input: unknown) => {
    const request = parseVaultItemFieldInput(local(input));
    return tools().reveal(request);
  });
  handleTrusted(IPC_CHANNELS.vaultCopy, (input: unknown) => {
    const request = parseVaultItemFieldInput(local(input));
    return tools().copy(request);
  });
  handleTrusted(IPC_CHANNELS.vaultImportCsv, (input: unknown) => {
    const request = parseImportVaultCsvInput(local(input));
    return tools().importCsv(request.csv);
  });
  handleTrusted(IPC_CHANNELS.vaultCodes, (input: unknown) => {
    local(input);
    return tools().codes();
  });
  handleTrusted(IPC_CHANNELS.vaultReset, (input: unknown) => {
    local(input);
    tools().reset();
  });
}
