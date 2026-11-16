// COSGRAL W6-BE5: the window API of the ready ACP agent settings. Answers are checked with the contract guards.

import {
  type AcpAgentConfig,
  type AcpPresetInfo,
  type AcpPresetsDesktopApi,
  IPC_CHANNELS,
  isAcpAgentConfig,
  isAcpPresetInfoList,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createAcpPresetsApi(invoke: Invoke): AcpPresetsDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.acpPresetsList, null, decodeList),
    add: (input) => invoke(IPC_CHANNELS.acpPresetsAdd, input, decodeAgent),
  };
}

function decodeList(value: unknown): AcpPresetInfo[] {
  if (!isAcpPresetInfoList(value)) throw new Error("Invalid preset list.");
  return value;
}

function decodeAgent(value: unknown): AcpAgentConfig {
  if (!isAcpAgentConfig(value)) throw new Error("Invalid ACP agent.");
  return value;
}
