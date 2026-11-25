import { onCleanup } from "solid-js";
import { expect, userEvent } from "storybook/test";
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
  render: () => <Mocked>{() => <LibraryPage bots={STORY_BOTS} />}</Mocked>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    const sections = canvas.getByRole("navigation", { name: "Library sections" });
    await expect(sections.querySelectorAll("button")).toHaveLength(9);
  },
};

/** Library › Built-in skills: three sets, switch one on for every agent, see the answer and the missing program. */
export const LibraryBuiltinSkills: Story = {
  render: () => <Mocked>{() => <LibraryPage bots={STORY_BOTS} />}</Mocked>,
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /Built-in skills/ }));
    await expect(await canvas.findByText("Superpowers")).toBeInTheDocument();
    await expect(canvas.getByText(/Agents with this set: 0 of/)).toBeInTheDocument();
    await expect(canvas.getByText(/The program “graphify” was not found/)).toBeInTheDocument();
    const [turnOn] = canvas.getAllByRole("button", { name: "Turn on for all agents" });
    if (!turnOn) throw new Error("The set has no Turn on button.");
    await userEvent.click(turnOn);
    await expect(await canvas.findByText(/Superpowers is on\. Agents changed:/)).toBeInTheDocument();
  },
};

/** Library › Files › This computer: a shared folder, a subfolder and the copy bar (mock folders, no disk). */
export const LibraryThisComputer: Story = {
  render: () => <Mocked>{() => <LibraryPage />}</Mocked>,
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /This computer/ }));
    await expect(await canvas.findByText("notatki.md")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Select notatki.md" }));
    await expect(canvas.getByRole("button", { name: /Copy to library/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Open folder Faktury" }));
    await expect(await canvas.findByText("2026-10.pdf")).toBeInTheDocument();
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
