// COSGRAL W3: IPC of agent settings, templates, the agent creator, app settings and onboarding. Agent settings and
// templates are on this computer only (like skills and the Vault); app settings and onboarding are always local.

import { type AgentProviderId, IPC_CHANNELS } from "@openbot/contracts/ipc";
import { app } from "electron";
import type { AgentService } from "../backend/agent-service";
import { parseAgentRequest } from "./ipc/agent-inputs";
import {
  parseAgentTemplateId,
  parseCompleteOnboarding,
  parseCreateAgent,
  parseDuplicateAgent,
  parseSaveAgentTemplate,
  parseSettingsBotId,
  parseUpdateAgentSettings,
  parseUpdateAppSettings,
} from "./ipc/agent-settings-inputs";
import { Onboarding } from "./onboarding";
import { handleTrusted } from "./trusted-ipc";

/** Windows / macOS: register or clear the OS login item for this program. */
function applyLaunchAtLogin(enabled: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
  } catch {
    /* Sandbox or locked OS settings: the store still keeps the person's choice. */
  }
}

export interface AgentSettingsIpcOptions {
  service: () => Pick<AgentService, "agentSettings" | "agentTemplates" | "computerUse" | "listBots">;
  setupFile: string;
  /** Saves the provider as preferred and starts it, as the original setup does. */
  applyProvider: (provider: AgentProviderId) => Promise<void>;
}

export function registerAgentSettingsIpc(options: AgentSettingsIpcOptions): Onboarding {
  const settings = () => options.service().agentSettings;
  const templates = () => options.service().agentTemplates;
  const onboarding = new Onboarding({
    setupFile: options.setupFile,
    templates: () => templates().list(),
    appSettings: () => settings().appSettings(),
    updateLanguage: async (language) => {
      await settings().updateAppSettings({ language });
    },
    computerUse: () => {
      const state = options.service().computerUse.getState();
      return { available: state.available, reason: state.unavailableReason };
    },
    applyProvider: options.applyProvider,
    createAgent: (input) => templates().createAgent(input),
    botExists: (botId) =>
      options
        .service()
        .listBots()
        .some((bot) => bot.id === botId),
  });

  handleTrusted(IPC_CHANNELS.agentSettingsGet, (input: unknown) => settings().get(local(input, parseSettingsBotId)));
  handleTrusted(IPC_CHANNELS.agentSettingsUpdate, (input: unknown) =>
    settings().update(local(input, parseUpdateAgentSettings)),
  );
  handleTrusted(IPC_CHANNELS.agentSettingsCreateAgent, (input: unknown) =>
    templates().createAgent(local(input, parseCreateAgent)),
  );
  handleTrusted(IPC_CHANNELS.agentDuplicateBot, (input: unknown) =>
    templates().duplicateAgent(local(input, parseDuplicateAgent)),
  );
  handleTrusted(IPC_CHANNELS.agentTemplatesList, (input: unknown) =>
    parseAgentRequest(input).serverId === "local" ? templates().list() : [],
  );
  handleTrusted(IPC_CHANNELS.agentTemplatesSave, (input: unknown) =>
    templates().saveFromAgent(local(input, parseSaveAgentTemplate)),
  );
  handleTrusted(IPC_CHANNELS.agentTemplatesDelete, (input: unknown) => {
    templates().delete(local(input, parseAgentTemplateId).templateId);
  });
  handleTrusted(IPC_CHANNELS.appSettingsGet, () => {
    const current = settings().appSettings();
    applyLaunchAtLogin(current.behavior.launchAtLogin);
    return current;
  });
  handleTrusted(IPC_CHANNELS.appSettingsUpdate, async (input: unknown) => {
    const next = await settings().updateAppSettings(parseUpdateAppSettings(parseAgentRequest(input).payload));
    applyLaunchAtLogin(next.behavior.launchAtLogin);
    return next;
  });
  handleTrusted(IPC_CHANNELS.onboardingGetState, () => onboarding.state());
  handleTrusted(IPC_CHANNELS.onboardingComplete, (input: unknown) =>
    onboarding.complete(parseCompleteOnboarding(parseAgentRequest(input).payload)),
  );
  return onboarding;
}

function local<T>(input: unknown, parse: (payload: unknown) => T): T {
  const scoped = parseAgentRequest(input);
  if (scoped.serverId !== "local") throw new Error("Agent settings and templates are on this computer only for now.");
  return parse(scoped.payload);
}
