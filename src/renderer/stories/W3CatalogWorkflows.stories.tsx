import type { MarketplaceItemDetails, WorkflowGraph } from "@openbot/contracts/ipc";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { MarketplaceDetail } from "../src/components/MarketplacePage";
import { WorkflowCanvas } from "../src/components/WorkflowsPage";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

const demo: MarketplaceItemDetails = {
  item: {
    id: "skill:notes",
    kind: "skill",
    title: "Notes",
    summary: "Organize notes",
    description: "Turn notes into a clear outline.",
    category: "productivity",
    tags: [],
    featured: true,
    version: 1,
    skillName: "notes",
    skills: [],
    libraryState: "outdated",
    installedBotIds: [],
  },
  skillMd: "Demo instructions",
  files: ["SKILL.md"],
  agent: null,
};
function Preview(props: { theme: StoryTheme }) {
  const [graph, setGraph] = createSignal<WorkflowGraph>({
    nodes: [
      { id: "start", type: "trigger", title: "Start", x: 20, y: 20, trigger: { kind: "manual" } },
      { id: "write", type: "agent", title: "Write", x: 280, y: 20, botId: "writer", prompt: "Draft an outline" },
    ],
    edges: [{ id: "next", from: "start", to: "write", on: "next" }],
  });
  return (
    <ThemeFrame theme={props.theme} style="padding: 24px; min-height: 100vh">
      <MarketplaceDetail
        details={demo}
        bots={[{ id: "writer", name: "Writer" }]}
        selectedBot="writer"
        onSelectBot={() => undefined}
        onInstall={() => undefined}
        onUninstall={() => undefined}
      />
      <WorkflowCanvas nodes={graph().nodes} edges={graph().edges} onChange={setGraph} />
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/Catalog and workflows" } satisfies Meta;
export default meta;
type Story = StoryObj;
export const Dark: Story = { render: () => <Preview theme="dark" /> };
export const Light: Story = { render: () => <Preview theme="light" /> };
