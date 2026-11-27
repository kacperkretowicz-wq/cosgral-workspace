import type { AgentSettings } from "@openbot/contracts/ipc";
import { Show } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AgentSettingsW3 } from "../src/components/AgentSettingsW3";
import { ProviderFallbackLists } from "../src/components/ProviderFallbackLists";
import { STORY_BOT_SUMMARIES, STORY_MODELS } from "./fixtures";
import { createMockFallbackModelsApi } from "./mock-fallback-models-api";
import { createMockOpenBot } from "./mock-openbot";
import { ThemeFrame } from "./theme-frame";

const groups = [
  { scope: "provider:codex", label: "Codex" },
  { scope: "provider:claude", label: "Claude" },
  { scope: "provider:acp:demo", label: "ACP demo" },
  { scope: "provider:endpoint:local", label: "Local server" },
  { scope: "*", label: "All providers" },
];
function Scene(props: { agent?: boolean }) {
  return (
    <ThemeFrame theme="dark">
      <div class="w2-library providers-page">
        <Show when={props.agent} fallback={<ProviderFallbackLists groups={groups} options={STORY_MODELS} />}>
          <AgentSettingsW3 botId="chief" />
        </Show>
      </div>
    </ThemeFrame>
  );
}
const meta = {
  title: "COSGRAL/Provider fallback lists",
  component: Scene,
  args: { agent: false },
  beforeEach: async () => {
    const previous = window.openbot;
    const mock = createMockOpenBot();
    const fallback = createMockFallbackModelsApi(["acp:removed"], { agentModels: { chief: "gpt-5.6-luna" } });
    await fallback.setFallbackModels({ botId: "provider:codex", fallbackModels: ["claude-sonnet-5", "acp:removed"] });
    await fallback.setFallbackModels({ botId: "*", fallbackModels: ["claude-opus-5"] });
    await fallback.setFallbackModels({ botId: "chief", fallbackModels: ["gpt-5.6-terra"] });
    let value: AgentSettings = {
      bot: STORY_BOT_SUMMARIES[0],
      provider: "codex",
      models: STORY_MODELS,
      tools: [],
      skills: [],
      mcp: [],
      memory: {
        botId: "chief",
        maxMemories: 512,
        customLimit: false,
        essentialCount: 0,
        searchableCount: 0,
        essentialInPrompt: 0,
        essentialPromptBytes: 0,
      },
    };
    window.openbot = {
      ...mock.api,
      providers: {
        ...mock.api.providers,
        ...fallback,
        listAcpAgents: async () => [],
        listUsage: async () => [],
        saveAcpAgent: async () => {
          throw new Error("Demo only");
        },
        removeAcpAgent: async () => {},
      },
      agentSettings: {
        get: async () => value,
        update: async (input) => {
          value = {
            ...value,
            bot: {
              ...value.bot,
              ...(input.name ? { name: input.name } : {}),
              ...(input.model ? { model: input.model } : {}),
            },
          };
          return value;
        },
        listTemplates: async () => [],
        saveTemplate: async () => {
          throw new Error("Demo only");
        },
        deleteTemplate: async () => {},
        createAgent: async () => {
          throw new Error("Demo only");
        },
      },
    };
    return () => {
      mock.dispose();
      window.openbot = previous;
    };
  },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ProviderGroups: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const group = within(await c.findByRole("region", { name: "Codex fallback list" }));
    await expect(await group.findByText("Unavailable")).toBeInTheDocument();
    await userEvent.click(group.getByRole("button", { name: "Move acp:removed up" }));
    await userEvent.click(group.getByRole("button", { name: "Save order" }));
    await expect(await group.findByText("Fallback order saved.")).toBeInTheDocument();
    await expect(c.getAllByRole("heading").map((el) => el.textContent)).toEqual(groups.map((group) => group.label));
  },
};
export const AgentChainAndReset: Story = {
  args: { agent: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const chain = within(await c.findByRole("region", { name: "Effective fallback chain" }));
    await expect(await chain.findByText("Agent")).toBeInTheDocument();
    await expect(chain.getAllByText("Provider")).toHaveLength(2);
    await expect(chain.getByText("All")).toBeInTheDocument();
    await userEvent.click(c.getByRole("button", { name: "Reset to provider list" }));
    await expect(await c.findByText("Using provider and all-provider lists")).toBeInTheDocument();
    await expect(chain.queryByText("Agent")).not.toBeInTheDocument();
  },
};
export const EmptyProvider: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const group = within(await c.findByRole("region", { name: "Claude fallback list" }));
    await expect(
      await group.findByText("This list is empty. Later fallback layers may still apply."),
    ).toBeInTheDocument();
    await expect(group.getByRole("button", { name: "Save order" })).toBeDisabled();
  },
};
