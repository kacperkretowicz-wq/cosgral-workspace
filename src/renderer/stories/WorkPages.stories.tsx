import { onCleanup } from "solid-js";
import { expect } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { LibraryPage } from "../src/components/LibraryPage";
import { SchedulePage } from "../src/components/SchedulePage";
import { WorkflowsPage } from "../src/components/WorkflowsPage";
import { STORY_BOTS } from "./fixtures";
import { createMockOpenBot } from "./mock-openbot";
import { ThemeFrame } from "./theme-frame";

/** The rail pages in the shared work-page frame, each with the mock API (one frame, three layouts). */
function Mocked(props: { children: () => ReturnType<typeof LibraryPage> }) {
  const previousApi = window.openbot;
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  onCleanup(() => {
    mock.dispose();
    window.openbot = previousApi;
  });
  return <div style={{ display: "flex", height: "100vh" }}>{props.children()}</div>;
}

const meta = {
  title: "COSGRAL/Work pages",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Library: Story = {
  render: () => <Mocked>{() => <LibraryPage />}</Mocked>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    const sections = canvas.getByRole("navigation", { name: "Library sections" });
    await expect(sections.querySelectorAll("button")).toHaveLength(8);
  },
};

export const Workflows: Story = {
  render: () => <Mocked>{() => <WorkflowsPage />}</Mocked>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Workflows" })).toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "Start with a trigger" })).toBeInTheDocument();
  },
};

export const Schedule: Story = {
  render: () => <Mocked>{() => <SchedulePage bots={STORY_BOTS} />}</Mocked>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Schedule" })).toBeInTheDocument();
    await expect(canvas.getByRole("navigation", { name: "Schedule sections" })).toBeInTheDocument();
  },
};

/** The same pages in the light theme, so the accessibility check (axe) also covers the light contrast. */
export const LibraryLight: Story = {
  render: () => (
    <ThemeFrame theme="light">
      <Mocked>{() => <LibraryPage />}</Mocked>
    </ThemeFrame>
  ),
  play: Library.play,
};

export const WorkflowsLight: Story = {
  render: () => (
    <ThemeFrame theme="light">
      <Mocked>{() => <WorkflowsPage />}</Mocked>
    </ThemeFrame>
  ),
  play: Workflows.play,
};

export const ScheduleLight: Story = {
  render: () => (
    <ThemeFrame theme="light">
      <Mocked>{() => <SchedulePage bots={STORY_BOTS} />}</Mocked>
    </ThemeFrame>
  ),
  play: Schedule.play,
};
