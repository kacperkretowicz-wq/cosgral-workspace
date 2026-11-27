import { createSignal, onCleanup, Show } from "solid-js";
import { expect } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ChannelRoutinesPanel } from "../src/components/ChannelRoutinesPanel";
import { createMockOpenBot } from "./mock-openbot";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

const channel = { id: "demo-channel", archived: false, leadBotId: "chief" };

function Scene(props: { theme: StoryTheme }) {
  const mock = createMockOpenBot();
  const previous = window.openbot;
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  onCleanup(() => {
    mock.dispose();
    Object.defineProperty(window, "openbot", { configurable: true, value: previous });
  });
  const [ready, setReady] = createSignal(false);
  // Demo routines: one on chosen weekdays with a finished run, one every two hours, one paused cron.
  void (async () => {
    const api = mock.api.channelRoutines;
    if (!api) return;
    const base = { channelId: channel.id, timezone: "Europe/Warsaw" };
    const brief = await api.create({
      ...base,
      name: "Morning brief",
      prompt: "Summarize what changed overnight and list what needs a decision.",
      schedule: { type: "daily", time: "08:30", weekdays: [1, 2, 3, 4, 5] },
    });
    await api.runNow({ routineId: brief.id });
    await api.create({
      ...base,
      name: "Inbox sweep",
      prompt: "Check the inbox and answer the easy ones.",
      schedule: { type: "interval", everyMinutes: 120 },
    });
    const weekly = await api.create({
      ...base,
      name: "Weekly report",
      prompt: "Write the weekly report for the team.",
      schedule: { type: "cron", expression: "0 16 * * 5" },
    });
    await api.update({ routineId: weekly.id, paused: true });
    setReady(true);
  })();
  return (
    <ThemeFrame theme={props.theme} style="min-height: 100vh; padding: 24px; box-sizing: border-box;">
      <div style="max-width: 720px;">
        <Show when={ready()}>
          <ChannelRoutinesPanel channel={channel} onOpenTask={() => undefined} />
        </Show>
      </div>
    </ThemeFrame>
  );
}

const meta = { title: "COSGRAL/Channel routines", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {
  args: { theme: "dark" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Morning brief")).toBeInTheDocument();
    await expect(canvas.getByText("Weekly report")).toBeInTheDocument();
  },
};

/** The edit form opened on the first routine, in both themes (the contrast of fields, days and buttons is watched). */
export const EditingDark: Story = {
  args: { theme: "dark" },
  play: async ({ canvas, userEvent }) => {
    const buttons = await canvas.findAllByRole("button", { name: "Edit" });
    const first = buttons[0];
    if (!first) throw new Error("No routine to edit.");
    await userEvent.click(first);
    await expect(await canvas.findByRole("region", { name: "Edit routine" })).toBeInTheDocument();
  },
};
