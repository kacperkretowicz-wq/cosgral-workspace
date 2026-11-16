import type { AgentModelId } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORY_BOT_SUMMARIES, STORY_MODELS } from "../../stories/fixtures";
import { createMockFallbackModelsApi } from "../../stories/mock-fallback-models-api";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { AgentSettingsW3, AgentTemplateCreator } from "./AgentSettingsW3";

describe("agent creator", () => {
  it("shows warnings returned after creating an agent", async () => {
    const create = vi.fn().mockResolvedValue({ bot: { id: "new" }, warnings: ["Skill unavailable"] });
    render(() => <AgentTemplateCreator templates={[]} create={create} />);
    await fireEvent.input(screen.getByLabelText("Agent name"), { target: { value: "Writer" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect(await screen.findByText("Skill unavailable")).toBeInTheDocument();
  });
});

afterEach(() => vi.unstubAllGlobals());
it("requires saving a model change before choosing the account, then unlocks it", async () => {
  const mock = createMockOpenBot();
  const value = { bot: STORY_BOT_SUMMARIES[0], provider: "codex", models: STORY_MODELS, tools: [] };
  vi.stubGlobal("openbot", {
    ...mock.api,
    providers: { getFallbackModels: async () => [], setFallbackModels: async () => [] },
    agentSettings: {
      get: async () => value,
      listTemplates: async () => [],
      update: async (input: { model: string }) => ({ ...value, bot: { ...value.bot, model: input.model } }),
    },
  });
  render(() => <AgentSettingsW3 botId="chief" />);
  const model = await screen.findByLabelText("Model");
  await waitFor(() => expect(screen.getByLabelText("Konto")).toBeEnabled());
  if (!(model instanceof HTMLSelectElement)) throw new Error("Expected a model selector.");
  const choices = Array.from(model.options);
  const alternate = choices.find((option) => option.value !== model.value);
  expect(alternate).toBeDefined();
  await fireEvent.change(model, { target: { value: alternate?.value } });
  await waitFor(() => expect(screen.getByLabelText("Konto")).toBeDisabled());
  await fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await screen.findByText("Settings saved.");
  await waitFor(() => expect(screen.getByLabelText("Konto")).toBeEnabled());
  mock.dispose();
});

async function fallbackPanel(count: number, inherited = false) {
  const mock = createMockOpenBot();
  const providers = createMockFallbackModelsApi(["acp:demo0"]);
  const models = Array.from({ length: 9 }, (_, i) => ({
    ...STORY_MODELS[0],
    id: `acp:demo${i}` as const,
    name: `Demo ${i}`,
  }));
  const ids: AgentModelId[] = models.slice(0, count).map((model) => model.id);
  await providers.setFallbackModels({ botId: inherited ? "*" : "chief", fallbackModels: ids });
  const set = vi.spyOn(providers, "setFallbackModels");
  const value = { bot: STORY_BOT_SUMMARIES[0], provider: "codex", models, tools: [] };
  vi.stubGlobal("openbot", {
    ...mock.api,
    providers,
    agentSettings: { get: async () => value, listTemplates: async () => [], update: async () => value },
  });
  render(() => <AgentSettingsW3 botId="chief" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add fallback" })).toBeInTheDocument());
  return { mock, providers, set };
}
it("allows adding the eighth fallback then blocks the ninth with the contract limit", async () => {
  const { mock } = await fallbackPanel(7);
  await fireEvent.change(screen.getByLabelText("Add fallback model"), { target: { value: "acp:demo7" } });
  expect(screen.getByRole("button", { name: "Add fallback" })).toBeEnabled();
  await fireEvent.click(screen.getByRole("button", { name: "Add fallback" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add fallback" })).toBeDisabled());
  expect(screen.getByText("At most 8 models. Duplicate models cannot be added.")).toBeInTheDocument();
  mock.dispose();
});
it("starts blocked at eight models", async () => {
  const { mock } = await fallbackPanel(8);
  expect(screen.getByLabelText("Add fallback model")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add fallback" })).toBeDisabled();
  mock.dispose();
});
it("preserves inheritance on profile save and resets an edited override", async () => {
  const { mock, providers, set } = await fallbackPanel(1, true);
  expect(screen.getByText("Using provider and all-provider lists")).toBeInTheDocument();
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await screen.findByText("Settings saved.");
  expect(set).not.toHaveBeenCalled();
  await fireEvent.change(screen.getByLabelText("Add fallback model"), { target: { value: "acp:demo1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Add fallback" }));
  await fireEvent.click(screen.getByRole("button", { name: "Save order" }));
  await waitFor(() => expect(screen.getByText("Agent's own list")).toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("button", { name: "Reset to provider list" })).toBeEnabled());
  await fireEvent.click(screen.getByRole("button", { name: "Reset to provider list" }));
  await waitFor(() => expect(screen.getByText("Using provider and all-provider lists")).toBeInTheDocument());
  expect((await providers.getFallbackInfo("chief")).own).toBeNull();
  mock.dispose();
});
