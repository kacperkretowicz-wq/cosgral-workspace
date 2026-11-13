// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentProviderId,
  type AppSettings,
  type CreateAgentInput,
  defaultNotificationPreferences,
  isOnboardingState,
} from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_AGENT_TEMPLATES } from "../backend/agent-templates";
import { Onboarding } from "./onboarding";
import { readSetupState } from "./setup-store";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(options: { failAgent?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "onboarding-"));
  roots.push(root);
  const setupFile = join(root, "openbot-setup-v2.json");
  let settings: AppSettings = {
    language: "en",
    languageChosen: false,
    notifications: defaultNotificationPreferences(),
    tabs: [],
  };
  const steps: string[] = [];
  const created: CreateAgentInput[] = [];
  const bots = new Set<string>();
  const onboarding = new Onboarding({
    setupFile,
    templates: () => BUILT_IN_AGENT_TEMPLATES,
    appSettings: () => settings,
    updateLanguage: async (language) => {
      steps.push(`language:${language}`);
      settings = { ...settings, language, languageChosen: true };
    },
    computerUse: () => ({ available: true, reason: null }),
    applyProvider: async (provider: AgentProviderId) => {
      steps.push(`provider:${provider}`);
    },
    createAgent: async (input) => {
      if (options.failAgent) throw new Error("The provider is not signed in.");
      steps.push(`agent:${input.templateId}`);
      created.push(input);
      const id = `bot-${created.length}`;
      bots.add(id);
      return { bot: { id }, warnings: [] };
    },
    botExists: (botId) => bots.has(botId),
  });
  return { setupFile, onboarding, steps, created, bots };
}

describe("Onboarding", () => {
  it("starts empty with the suggested templates as first-agent proposals", async () => {
    const { onboarding } = await setup();
    const state = await onboarding.state();
    expect(isOnboardingState(state)).toBe(true);
    expect(state).toMatchObject({ completed: false, language: null, preferredProvider: null, firstAgentId: null });
    expect(state.proposals.map((template) => template.id)).toEqual(
      BUILT_IN_AGENT_TEMPLATES.filter((template) => template.suggested).map((template) => template.id),
    );
    expect(state.computerUse).toEqual({ available: true, reason: null });
  });

  it("saves the language, starts the provider and then creates the first agent from the proposal", async () => {
    const { onboarding, steps, created, setupFile } = await setup();
    const state = await onboarding.complete({
      language: "pl",
      preferredProvider: "claude",
      firstAgent: { templateId: "builtin:writer", name: "Pisarz" },
    });
    expect(steps).toEqual(["language:pl", "provider:claude", "agent:builtin:writer"]);
    expect(created).toEqual([{ templateId: "builtin:writer", name: "Pisarz" }]);
    expect(state).toMatchObject({
      completed: true,
      language: "pl",
      preferredProvider: "claude",
      firstAgentId: "bot-1",
    });
    await expect(readSetupState(setupFile)).resolves.toEqual({ completed: true, preferredProvider: "claude" });
  });

  it("does not create a second first agent when onboarding runs again", async () => {
    const { onboarding, created } = await setup();
    await onboarding.complete({
      language: "en",
      preferredProvider: "codex",
      firstAgent: { templateId: "builtin:assistant" },
    });
    const again = await onboarding.complete({
      language: "en",
      preferredProvider: "codex",
      firstAgent: { templateId: "builtin:assistant" },
    });
    expect(created).toHaveLength(1);
    expect(again.firstAgentId).toBe("bot-1");
  });

  it("finishes without a first agent and refuses an unknown template before changing anything", async () => {
    const { onboarding, steps } = await setup();
    await expect(
      onboarding.complete({ language: "en", preferredProvider: "codex", firstAgent: { templateId: "builtin:nope" } }),
    ).rejects.toThrow(/no longer exists/);
    expect(steps).toEqual([]);
    const state = await onboarding.complete({ language: "en", preferredProvider: "codex", firstAgent: null });
    expect(state).toMatchObject({ completed: true, firstAgentId: null });
  });

  it("keeps the saved setup when the first agent cannot be created", async () => {
    const { onboarding } = await setup({ failAgent: true });
    await expect(
      onboarding.complete({
        language: "en",
        preferredProvider: "codex",
        firstAgent: { templateId: "builtin:assistant" },
      }),
    ).rejects.toThrow(/not signed in/);
    expect(await onboarding.state()).toMatchObject({ completed: true, preferredProvider: "codex", firstAgentId: null });
  });
});
