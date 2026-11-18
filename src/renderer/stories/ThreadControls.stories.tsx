import type { ThreadSummary } from "@openbot/contracts/ipc";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ThreadPanel } from "../src/components/ThreadPanel";
import { createMockOpenBot } from "./mock-openbot";
import { createMockThreads } from "./mock-threads";
import { ThemeFrame } from "./theme-frame";

const seed: ThreadSummary[] = [
  {
    id: "first",
    botId: "chief",
    title: "Planning",
    titled: true,
    state: "running",
    active: true,
    unread: 0,
    queued: 1,
    needsYou: 0,
    createdAt: "2026-11-16T12:00:00Z",
    updatedAt: "2026-11-16T12:00:00Z",
    archivedAt: null,
    preview: "Prepare the next milestone.",
    parentThreadId: null,
    parentTitle: null,
    branchedFromMessageId: null,
  },
  {
    id: "second",
    botId: "chief",
    title: "Research",
    titled: true,
    state: "waiting",
    active: false,
    unread: 2,
    queued: 2,
    needsYou: 1,
    createdAt: "2026-11-16T11:00:00Z",
    updatedAt: "2026-11-16T11:00:00Z",
    archivedAt: null,
    preview: "A question is waiting.",
    parentThreadId: null,
    parentTitle: null,
    branchedFromMessageId: null,
  },
];
function Scene(props: { light?: boolean }) {
  return (
    <ThemeFrame theme={props.light ? "light" : "dark"}>
      <div class="w2-library providers-page">
        <ThreadPanel botId="chief" />
      </div>
    </ThemeFrame>
  );
}
const meta = {
  title: "COSGRAL/Agent threads",
  component: Scene,
  args: { light: false },
  beforeEach: () => {
    const previous = window.openbot;
    const mock = createMockOpenBot();
    window.openbot = { ...mock.api, threads: createMockThreads(mock.emitAgentEvent, { chief: seed }) };
    return () => {
      mock.dispose();
      window.openbot = previous;
    };
  },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
const open = async (canvasElement: HTMLElement) => {
  const c = within(canvasElement);
  await userEvent.click(c.getByText(/^Threads:/));
  await c.findByRole("heading", { name: "Planning" });
  return c;
};
export const Activity: Story = {
  play: async ({ canvasElement }) => {
    const c = await open(canvasElement);
    await expect(c.getByText(/2 unread; 2 queued; 1 Needs you/)).toBeInTheDocument();
    await userEvent.click(c.getByRole("button", { name: "Research: 1 Needs you" }));
    await waitFor(() => expect(c.getByRole("button", { name: "Open Research" })).toBeDisabled());
  },
};
export const Rename: Story = {
  play: async ({ canvasElement }) => {
    const c = await open(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Rename Planning" }));
    const input = c.getByLabelText("Thread title");
    await userEvent.clear(input);
    await userEvent.type(input, "New milestone");
    await userEvent.click(c.getByRole("button", { name: "Save title" }));
    await expect(await c.findByRole("heading", { name: "New milestone" })).toBeInTheDocument();
  },
};
export const Background: Story = {
  play: async ({ canvasElement }) => {
    const c = await open(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Open Research" }));
    await expect(await c.findByText("Working in background")).toBeInTheDocument();
  },
};
export const ArchiveRestore: Story = {
  play: async ({ canvasElement }) => {
    const c = await open(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Archive Research" }));
    await userEvent.click(c.getByRole("switch", { name: "Show archived threads" }));
    const restore = await c.findByRole("button", { name: "Restore Research" });
    await waitFor(() => expect(restore).toBeEnabled());
    await userEvent.click(restore);
    await expect(await c.findByRole("button", { name: "Open Research" })).toBeInTheDocument();
  },
};
export const DeleteConfirmation: Story = {
  play: async ({ canvasElement }) => {
    const c = await open(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Delete Research" }));
    await expect(c.getByRole("group", { name: "Confirm deleting Research" })).toHaveTextContent(
      "You can bring it back for 10 minutes.",
    );
    await userEvent.click(c.getByRole("button", { name: "Keep thread" }));
    await expect(c.queryByRole("button", { name: "Delete permanently" })).not.toBeInTheDocument();
  },
};
export const Light: Story = {
  args: { light: true },
  play: async ({ canvasElement }) => {
    const c = await open(canvasElement);
    await expect(c.getByRole("region", { name: "Needs you by thread" })).toBeInTheDocument();
  },
};
