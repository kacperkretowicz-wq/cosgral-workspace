import type { ProjectPlan, WorkspaceChannel } from "@openbot/contracts/ipc";
import { createSignal, onCleanup, Show } from "solid-js";
import { expect } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ProjectPlanPanel } from "../src/components/ProjectPlanPanel";
import { createMockOpenBot } from "./mock-openbot";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

const channel: WorkspaceChannel = {
  id: "demo-channel",
  name: "candle-shop",
  title: "Candle shop",
  instructions: "We are opening an online shop with handmade candles and need a launch plan.",
  leadBotId: "chief",
  memberBotIds: ["chief"],
  isolated: true,
  archived: false,
  createdAt: "2026-11-25T10:00:00.000Z",
  updatedAt: "2026-11-25T10:00:00.000Z",
};

/** How far the demo person gets before the story is shown: nothing, the proposed plan, or the approved plan with both questions. */
type Stage = "empty" | "proposed" | "accepted";

function Scene(props: { theme: StoryTheme; stage: Stage }) {
  const mock = createMockOpenBot();
  const previous = window.openbot;
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  onCleanup(() => {
    mock.dispose();
    Object.defineProperty(window, "openbot", { configurable: true, value: previous });
  });
  const [plan, setPlan] = createSignal<ProjectPlan | null>(null);
  const [ready, setReady] = createSignal(false);
  void (async () => {
    const api = mock.api.projectPlans;
    if (api && props.stage !== "empty") {
      await api.saveDescription({ channelId: channel.id, description: channel.instructions });
      await api.requestPlan({ channelId: channel.id });
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (props.stage === "accepted") await api.accept({ channelId: channel.id });
      setPlan(await api.get({ channelId: channel.id }));
    }
    setReady(true);
  })();
  return (
    <ThemeFrame theme={props.theme} style="min-height: 100vh; padding: 24px; box-sizing: border-box;">
      <div style="max-width: 680px;">
        <Show when={ready()}>
          <ProjectPlanPanel
            channel={channel}
            plan={plan()}
            onChange={setPlan}
            onRefresh={async () => {
              setPlan((await mock.api.projectPlans?.get({ channelId: channel.id })) ?? null);
            }}
          />
        </Show>
      </div>
    </ThemeFrame>
  );
}

const meta = { title: "COSGRAL/Project plan", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyDark: Story = {
  args: { theme: "dark", stage: "empty" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Ask the lead for a plan" })).toBeInTheDocument();
  },
};
export const ProposedDark: Story = {
  args: { theme: "dark", stage: "proposed" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Approve plan" })).toBeInTheDocument();
    await expect(canvas.queryByText("Skills for this project")).toBeNull();
  },
};
export const AcceptedDark: Story = {
  args: { theme: "dark", stage: "accepted" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Yes, create the skills" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Yes, review them" })).toBeInTheDocument();
  },
};
