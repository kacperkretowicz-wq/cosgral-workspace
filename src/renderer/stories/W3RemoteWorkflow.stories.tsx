import type { WorkflowGraph } from "@openbot/contracts/ipc";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { RemoteDesktopSafetyBanner, RemoteDesktopToken } from "../src/components/RemoteDesktopPage";
import { WorkflowCanvas } from "../src/components/WorkflowsPage";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

function Preview(props: { theme: StoryTheme }) {
  const [graph, setGraph] = createSignal<WorkflowGraph>({
    nodes: [
      { id: "start", type: "trigger", title: "Start", x: 20, y: 20, trigger: { kind: "manual" } },
      { id: "draft", type: "agent", title: "Draft", x: 280, y: 20, botId: "writer", prompt: "Prepare a draft" },
    ],
    edges: [{ id: "path", from: "start", to: "draft", on: "next" }],
  });
  return (
    <ThemeFrame theme={props.theme} style="padding: 24px; min-height: 100vh">
      <RemoteDesktopSafetyBanner count={1} onStop={() => undefined} />
      <RemoteDesktopToken token="demo-token-not-a-credential" onClose={() => undefined} />
      <WorkflowCanvas
        nodes={graph().nodes}
        edges={graph().edges}
        onChange={setGraph}
        bots={[{ id: "writer", name: "Writer" }]}
        channels={[{ id: "team", name: "Team" }]}
        routines={[{ id: "daily", name: "Daily" }]}
      />
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/Remote and workflow" } satisfies Meta;
export default meta;
type Story = StoryObj;
export const Dark: Story = { render: () => <Preview theme="dark" /> };
export const Light: Story = { render: () => <Preview theme="light" /> };
