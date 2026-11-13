import type { AcpAgentConfig, AgentModelId, BotSummary, ProviderUsage } from "@openbot/contracts/ipc";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  AcpAgentsSection,
  FallbackInUse,
  type FallbackModelOption,
  FallbackOrder,
  ProviderUsageList,
} from "../src/components/ProvidersPage";
import { Card, Heading } from "../src/components/ui";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

// Demo data only.
const OPTIONS: FallbackModelOption[] = [
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "claude-opus-5", name: "Claude Opus 5" },
  { id: "acp:demo-agent", name: "Demo agent (ACP)" },
];

const soon = Math.floor(Date.now() / 1000) + 2 * 3600;
const USAGE: ProviderUsage[] = [
  { provider: "codex", model: null, state: "ok", resetsAt: null, usedPercent: 41, reason: null },
  {
    provider: "claude",
    model: null,
    state: "limited",
    resetsAt: soon,
    usedPercent: 100,
    reason: "5-hour limit reached",
  },
  {
    provider: "acp",
    model: "acp:demo-agent",
    state: "unavailable",
    resetsAt: null,
    usedPercent: null,
    reason: "The program exited.",
  },
];

const ACP: AcpAgentConfig[] = [
  {
    id: "demo-agent",
    name: "Demo agent",
    command: "demo-acp",
    args: ["--stdio"],
    createdAt: "2026-11-13T10:00:00.000Z",
    updatedAt: "2026-11-13T10:00:00.000Z",
  },
];

const BOT: BotSummary = {
  id: "chief",
  name: "Chief",
  role: "Lead",
  description: "",
  notifications: true,
  model: "claude-opus-5",
  reasoningEffort: "medium",
  threadId: null,
  workspacePath: "",
  preview: "",
  updatedAt: null,
  avatarSeed: "chief",
  avatarHue: null,
  avatarUrl: null,
  activeModel: "gpt-5.6-terra",
};

function Scene(props: { theme: StoryTheme }) {
  const [agents, setAgents] = createSignal(ACP);
  const [items, setItems] = createSignal<AgentModelId[]>(["gpt-5.6-terra", "claude-sonnet-5"]);
  return (
    <ThemeFrame
      theme={props.theme}
      style="padding: 24px; width: 760px; max-width: 100%; min-height: 100vh; display: grid; align-content: start; gap: 16px;"
    >
      <ProviderUsageList usage={USAGE} acpAgents={agents()} now={Date.now()} onRefresh={() => undefined} />
      <AcpAgentsSection
        agents={agents()}
        onSave={async (input) => {
          const stamp = new Date().toISOString();
          setAgents((list) => [...list, { ...input, args: input.args ?? [], createdAt: stamp, updatedAt: stamp }]);
        }}
        onRemove={async (id) => {
          setAgents((list) => list.filter((agent) => agent.id !== id));
        }}
      />
      <Card class="providers-section">
        <Heading as="h2" size="md">
          Fallback models
        </Heading>
        <FallbackInUse bots={[BOT]} options={OPTIONS} />
        <FallbackOrder
          botName={BOT.name}
          ownModel={BOT.model}
          items={items()}
          options={OPTIONS}
          dirty
          saving={false}
          onChange={setItems}
          onSave={() => undefined}
        />
      </Card>
    </ThemeFrame>
  );
}

const meta = { title: "COSGRAL/W3 providers and limits", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { args: { theme: "dark" } };
export const Light: Story = { args: { theme: "light" } };
