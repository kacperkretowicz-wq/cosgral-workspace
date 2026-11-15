import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ChannelEditor } from "../src/components/ChannelEditor";

const meta = {
  title: "COSGRAL/Channel editor",
  component: ChannelEditor,
  args: {
    bots: [
      { id: "planner", name: "Planner" },
      { id: "writer", name: "Writer" },
    ],
    onClose: () => {},
    onSave: async () => {},
  },
} satisfies Meta<typeof ChannelEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NewChannel: Story = {};
export const SaveError: Story = {
  args: {
    onSave: async () => {
      throw new Error("Channel name already exists. Choose another name.");
    },
  },
};

export const EditChannel: Story = {
  args: {
    channel: {
      id: "demo-channel",
      name: "launch",
      title: "Launch team",
      instructions: "Review the launch together.",
      memberBotIds: ["planner", "writer"],
      leadBotId: "planner",
      isolated: true,
      archived: false,
      createdAt: "2026-11-15T00:00:00Z",
      updatedAt: "2026-11-15T00:00:00Z",
    },
  },
};
