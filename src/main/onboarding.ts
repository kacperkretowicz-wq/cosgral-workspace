// COSGRAL W3: onboarding (parity row 40): language, first provider, first agent from a proposal, and what Computer Use
// can do on this computer. It writes the same setup file as the original first-run setup, so both stay compatible,
// and it creates the first agent only once.

import type {
  AgentProviderId,
  AgentTemplate,
  AppLanguage,
  AppSettings,
  CompleteOnboardingInput,
  CreateAgentInput,
  OnboardingState,
} from "@openbot/contracts/ipc";
import { readSetupRecord, writeSetupState } from "./setup-store";

export interface OnboardingDeps {
  setupFile: string;
  templates: () => AgentTemplate[];
  appSettings: () => AppSettings;
  updateLanguage: (language: AppLanguage) => Promise<void>;
  computerUse: () => { available: boolean; reason: string | null };
  /** Saves the provider as preferred and starts it (as the original setup does). */
  applyProvider: (provider: AgentProviderId) => Promise<void>;
  createAgent: (input: CreateAgentInput) => Promise<{ bot: { id: string } }>;
  botExists: (botId: string) => boolean;
}

export class Onboarding {
  readonly #deps: OnboardingDeps;

  constructor(deps: OnboardingDeps) {
    this.#deps = deps;
  }

  async state(): Promise<OnboardingState> {
    const record = await readSetupRecord(this.#deps.setupFile);
    const settings = this.#deps.appSettings();
    return {
      completed: record.completed,
      language: settings.languageChosen ? settings.language : null,
      preferredProvider: record.preferredProvider,
      firstAgentId: record.firstAgentId && this.#deps.botExists(record.firstAgentId) ? record.firstAgentId : null,
      proposals: this.#deps.templates().filter((template) => template.suggested),
      computerUse: this.#deps.computerUse(),
    };
  }

  /**
   * Language, then provider (saved and started), then the first agent: the provider must be ready before the agent
   * is created, so the agent gets the provider's model. When the agent cannot be created, the setup stays saved.
   */
  async complete(input: CompleteOnboardingInput): Promise<OnboardingState> {
    if (input.firstAgent && !this.#deps.templates().some((template) => template.id === input.firstAgent?.templateId)) {
      throw new Error(`Template "${input.firstAgent.templateId}" no longer exists.`);
    }
    await this.#deps.updateLanguage(input.language);
    await writeSetupState(this.#deps.setupFile, input.preferredProvider);
    await this.#deps.applyProvider(input.preferredProvider);
    const current = await this.state();
    if (input.firstAgent && !current.firstAgentId) {
      const { bot } = await this.#deps.createAgent({
        templateId: input.firstAgent.templateId,
        ...(input.firstAgent.name ? { name: input.firstAgent.name } : {}),
      });
      await writeSetupState(this.#deps.setupFile, input.preferredProvider, bot.id);
    }
    return this.state();
  }
}
