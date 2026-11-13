// COSGRAL W3: the window API of agent settings, templates, the agent creator, app settings and onboarding.
// Answers are checked with the contract guards.

import {
  type AgentSettings,
  type AgentSettingsDesktopApi,
  type AgentTemplate,
  type AppSettings,
  type AppSettingsDesktopApi,
  type BotSummary,
  type CreateAgentResult,
  IPC_CHANNELS,
  isAgentSettings,
  isAgentTemplate,
  isAppSettings,
  isOnboardingState,
  type OnboardingDesktopApi,
  type OnboardingState,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createAgentSettingsApi(
  invoke: Invoke,
  decodeBot: (value: unknown) => BotSummary,
): AgentSettingsDesktopApi {
  return {
    get: (botId) => invoke(IPC_CHANNELS.agentSettingsGet, botId, decodeSettings),
    update: (input) => invoke(IPC_CHANNELS.agentSettingsUpdate, input, decodeSettings),
    listTemplates: () => invoke(IPC_CHANNELS.agentTemplatesList, null, decodeTemplates),
    saveTemplate: (input) => invoke(IPC_CHANNELS.agentTemplatesSave, input, decodeTemplate),
    deleteTemplate: (input) => invoke(IPC_CHANNELS.agentTemplatesDelete, input, () => undefined),
    createAgent: (input) =>
      invoke(IPC_CHANNELS.agentSettingsCreateAgent, input, (value): CreateAgentResult => {
        if (!isDynamicRecord(value) || !Array.isArray(value.warnings)) throw new Error("Invalid new agent response.");
        return { bot: decodeBot(value.bot), warnings: value.warnings.filter(isString) };
      }),
  };
}

export function createAppSettingsApi(invoke: Invoke): AppSettingsDesktopApi {
  return {
    get: () => invoke(IPC_CHANNELS.appSettingsGet, null, decodeAppSettings),
    update: (input) => invoke(IPC_CHANNELS.appSettingsUpdate, input, decodeAppSettings),
  };
}

export function createOnboardingApi(invoke: Invoke): OnboardingDesktopApi {
  return {
    getState: () => invoke(IPC_CHANNELS.onboardingGetState, null, decodeOnboarding),
    complete: (input) => invoke(IPC_CHANNELS.onboardingComplete, input, decodeOnboarding),
  };
}

function decodeSettings(value: unknown): AgentSettings {
  if (!isAgentSettings(value)) throw new Error("Invalid agent settings response.");
  return value;
}

function decodeTemplates(value: unknown): AgentTemplate[] {
  if (!Array.isArray(value)) throw new Error("Invalid template list response.");
  return value.filter(isAgentTemplate);
}

function decodeTemplate(value: unknown): AgentTemplate {
  if (!isAgentTemplate(value)) throw new Error("Invalid template response.");
  return value;
}

function decodeAppSettings(value: unknown): AppSettings {
  if (!isAppSettings(value)) throw new Error("Invalid app settings response.");
  return value;
}

function decodeOnboarding(value: unknown): OnboardingState {
  if (!isOnboardingState(value)) throw new Error("Invalid onboarding response.");
  return value;
}
