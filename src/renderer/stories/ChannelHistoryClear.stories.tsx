import { expect } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ChannelHistoryClear } from "../src/components/ChannelHistoryClear";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

const REFUSAL = "This channel has 1 task in progress or paused. Stop or archive it first.";

function Scene(props: { theme: StoryTheme; refuse: boolean }) {
  const onClear = async () => {
    if (props.refuse) throw new Error(REFUSAL);
    return { channelId: "demo-channel", removedMessages: 12, removedTasks: 3 };
  };
  return (
    <ThemeFrame theme={props.theme} style="min-height: 100vh; padding: 24px; box-sizing: border-box;">
      <div style="max-width: 560px;">
        <ChannelHistoryClear onClear={onClear} />
      </div>
    </ThemeFrame>
  );
}

const meta = { title: "COSGRAL/Channel history clear", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {
  args: { theme: "dark", refuse: false },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Clear history" })).toBeInTheDocument();
  },
};
export const Light: Story = {
  args: { theme: "light", refuse: false },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Clear history" })).toBeInTheDocument();
  },
};

/** The question is open: the contrast of the two buttons and the sentence is watched in both themes. */
export const AskingDark: Story = {
  args: { theme: "dark", refuse: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Clear history" }));
    await expect(await canvas.findByRole("button", { name: "Yes, clear" })).toBeInTheDocument();
  },
};
export const AskingLight: Story = {
  args: { theme: "light", refuse: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Clear history" }));
    await expect(await canvas.findByRole("button", { name: "Yes, clear" })).toBeInTheDocument();
  },
};

/** The program refuses while a task runs: its sentence is shown as it comes. */
export const RefusedDark: Story = {
  args: { theme: "dark", refuse: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Clear history" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Yes, clear" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(REFUSAL);
  },
};
