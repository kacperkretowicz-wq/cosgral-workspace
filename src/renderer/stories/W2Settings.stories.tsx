import { onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AgentMemorySettingsView, ChannelMemorySettingsView } from "../src/components/MemorySettings";
import { SkillsSettings } from "../src/components/SkillsSettings";
import { McpSettings } from "../src/components/McpSettings";
import { createMockOpenBot } from "./mock-openbot";
import { ThemeFrame, type StoryTheme } from "./theme-frame";

function Scene(props: { theme: StoryTheme }) {
  const mock = createMockOpenBot();
  const previous = window.openbot;
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  onCleanup(() => {
    mock.dispose();
    Object.defineProperty(window, "openbot", { configurable: true, value: previous });
  });
  return (
    <ThemeFrame
      theme={props.theme}
      style="padding: 24px; width: 560px; height: 100vh; overflow: auto; display: grid; gap: 16px;"
    >
      <AgentMemorySettingsView botId="chief" />
      <ChannelMemorySettingsView channelId="demo-channel" />
      <SkillsSettings botId="chief" />
      <McpSettings botId="chief" />
      <McpSettings />
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/W2 settings", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { args: { theme: "dark" } };
export const Light: Story = { args: { theme: "light" } };
