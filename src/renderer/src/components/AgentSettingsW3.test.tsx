import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORY_BOT_SUMMARIES, STORY_MODELS } from "../../stories/fixtures";
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
