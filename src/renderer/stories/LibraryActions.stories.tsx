import { expect, fn, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { LibraryItems } from "../src/components/LibraryPanel";
import { ThemeFrame } from "./theme-frame";

const meta = {
  title: "COSGRAL/Library actions",
  component: LibraryItems,
  decorators: [
    (Story) => (
      <ThemeFrame theme="dark">
        <section class="w2-panel">
          <Story />
        </section>
      </ThemeFrame>
    ),
  ],
  args: {
    items: [
      {
        id: "file-demo",
        name: "brief.txt",
        size: 120,
        kind: "file",
        mimeType: "text/plain",
        previewKind: "text",
        previewUrl: null,
        origin: "agent",
        createdAt: "",
        createdByBotId: null,
        messageId: null,
      },
    ],
    onOpen: fn(),
    onDelete: fn(),
    onAttach: fn(),
  },
} satisfies Meta<typeof LibraryItems>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DownloadAndReveal: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Download" }));
    await expect(args.onOpen).toHaveBeenCalledWith("file-demo", "download");
    await userEvent.click(c.getByRole("button", { name: "Show in folder" }));
    await expect(args.onOpen).toHaveBeenCalledWith("file-demo", "reveal");
  },
};
