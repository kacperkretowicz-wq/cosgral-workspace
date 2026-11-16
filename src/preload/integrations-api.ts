// COSGRAL W10-KK1: the window API of the account integrations. Answers are checked with the contract guards.

import {
  type IntegrationDescription,
  type IntegrationList,
  type IntegrationStatus,
  type IntegrationsDesktopApi,
  IPC_CHANNELS,
  isIntegrationDescription,
  isIntegrationList,
  isIntegrationStatus,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createIntegrationsApi(invoke: Invoke): IntegrationsDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.integrationsList, null, decodeList),
    describe: (input) => invoke(IPC_CHANNELS.integrationsDescribe, input, decodeDescription),
    status: (input) => invoke(IPC_CHANNELS.integrationsStatus, input, decodeStatus),
    configure: (input) => invoke(IPC_CHANNELS.integrationsConfigure, input, decodeList),
    connect: (input) => invoke(IPC_CHANNELS.integrationsConnect, input, decodeStatus),
    cancel: (input) => invoke(IPC_CHANNELS.integrationsCancel, input, decodeStatus),
    disconnect: (input) => invoke(IPC_CHANNELS.integrationsDisconnect, input, decodeList),
  };
}

function decodeList(value: unknown): IntegrationList {
  if (!isIntegrationList(value)) throw new Error("Invalid integration list.");
  return value;
}

function decodeStatus(value: unknown): IntegrationStatus {
  if (!isIntegrationStatus(value)) throw new Error("Invalid integration status.");
  return value;
}

function decodeDescription(value: unknown): IntegrationDescription {
  if (!isIntegrationDescription(value)) throw new Error("Invalid integration description.");
  return value;
}
