import { expect } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ChannelHistoryWindowSetting } from "../src/components/ChannelHistoryWindow";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

const REFUSAL = "historyWindow is 20, 50, 100 or 200.";

function Scene(props: { theme: StoryTheme; refuse: boolean; value?: 20 | 50 | 100 | 200 }) {
  const onChange = async () => {
    if (props.refuse) throw new Error(REFUSAL);
  };
  return (
    <ThemeFrame theme={props.theme} style="min-height: 100vh; padding: 24px; box-sizing: border-box;">
      <div style="max-width: 560px;">
        <ChannelHistoryWindowSetting value={props.value} onChange={onChange} />
      </div>
    </ThemeFrame>
  );
}

const meta = { title: "COSGRAL/Channel history window", component: Scene } satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {
  args: { theme: "dark", refuse: false },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("combobox", { name: "History window" })).toHaveValue("200");
  },
};

/** After a save the note "History window saved." is on screen: its contrast is watched in both themes. */
export const SavedDark: Story = {
  args: { theme: "dark", refuse: false },
  play: async ({ canvas, userEvent }) => {
    await userEvent.selectOptions(await canvas.findByRole("combobox", { name: "History window" }), "20");
    await expect(await canvas.findByRole("status")).toHaveTextContent("History window saved.");
  },
};

/** The program says no: its sentence is shown as it comes, with no "saved" note. */
export const RefusedDark: Story = {
  args: { theme: "dark", refuse: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.selectOptions(await canvas.findByRole("combobox", { name: "History window" }), "20");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(REFUSAL);
  },
};
