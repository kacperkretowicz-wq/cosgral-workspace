// COSGRAL W12 (BE-D): the server settings for Storybook and the preview. Demo data only; nothing is contacted. The same rules as the
// program: a change is checked by the contract, fields left out stay, one event carries the whole settings, the storage numbers are
// measured again on request and cleaning the logs frees exactly what the report said was reclaimable.

import {
  type AgentEvent,
  applyServerSettingsChanges,
  defaultServerSettings,
  parseUpdateServerSettingsInput,
  type ServerSettings,
  type ServerSettingsDesktopApi,
  type StorageReport,
  serverSettingsSections,
} from "@openbot/contracts/ipc";

export interface MockServerSettings extends Required<ServerSettingsDesktopApi> {
  simulate: { setStorage: (items: { chatHistory: number; providers: number; appData: number; logs: number }) => void };
}

export function createMockServerSettings(emit: (event: AgentEvent) => void): MockServerSettings {
  let settings: ServerSettings = defaultServerSettings();
  let sizes = { chatHistory: 1_572_864, providers: 488_112_128, appData: 20_480, logs: 20_480 };
  let tick = 0;
  const report = (): StorageReport => {
    tick += 1;
    return {
      totalBytes: sizes.chatHistory + sizes.providers + sizes.appData,
      freeBytes: 1_400_000_000_000,
      items: [
        { id: "chat-history", bytes: sizes.chatHistory },
        { id: "provider-environments", bytes: sizes.providers },
        { id: "app-data", bytes: sizes.appData },
      ],
      reclaimableBytes: sizes.logs,
      measuredAt: new Date(Date.parse("2026-11-17T12:00:00.000Z") + tick * 1000).toISOString(),
    };
  };
  return {
    sections: async () => serverSettingsSections(),
    get: async () => structuredClone(settings),
    update: async (raw) => {
      const next = applyServerSettingsChanges(settings, parseUpdateServerSettingsInput(raw));
      if (JSON.stringify(next) !== JSON.stringify(settings)) {
        settings = next;
        emit({ type: "server-settings-changed", settings: structuredClone(settings) });
      }
      return structuredClone(settings);
    },
    measureStorage: async () => report(),
    clearLogs: async () => {
      sizes = { ...sizes, appData: Math.max(0, sizes.appData - sizes.logs), logs: 0 };
      return report();
    },
    simulate: {
      setStorage: (items) => {
        sizes = { ...items };
      },
    },
  };
}
