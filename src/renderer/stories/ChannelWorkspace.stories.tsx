import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { onCleanup } from "solid-js";
import { ChannelWorkspace } from "../src/components/ChannelWorkspace";
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
    <ThemeFrame theme={props.theme} style="width: 100%; height: 100vh; display: flex;">
      <ChannelWorkspace
        bots={[
          { id: "chief", name: "Chief" },
          { id: "research", name: "Research" },
        ]}
      />
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/Channel workspace", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { args: { theme: "dark" } };
export const Light: Story = { args: { theme: "light" } };
