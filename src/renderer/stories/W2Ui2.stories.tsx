import { onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { LibraryPanel } from "../src/components/LibraryPanel";
import { RoutinePanel } from "../src/components/RoutinePanel";
import { TablesPanel } from "../src/components/TablesPanel";
import { VaultPanel } from "../src/components/VaultPanel";
import { createMockOpenBot } from "./mock-openbot";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

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
      style="padding: 24px; width: 600px; height: 100vh; overflow: auto; display: grid; gap: 16px;"
    >
      <VaultPanel />
      <RoutinePanel bots={[{ id: "chief", name: "Chief" }]} />
      <TablesPanel />
      <LibraryPanel />
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/W2 workspace", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { args: { theme: "dark" } };
export const Light: Story = { args: { theme: "light" } };
