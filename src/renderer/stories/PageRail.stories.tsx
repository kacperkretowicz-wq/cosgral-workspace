import { createSignal, onCleanup } from "solid-js";
import { expect, fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { App } from "../src/App";
import { ComingSoon } from "../src/components/ComingSoon";
import { type PageId, PageRail } from "../src/components/PageRail";
import { createMockOpenBot } from "./mock-openbot";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

function RailShell(props: { theme: StoryTheme; initial?: PageId }) {
  const [page, setPage] = createSignal<PageId>(props.initial ?? "agents");
  return (
    <ThemeFrame theme={props.theme} style="height: 100vh; --page-rail-width: 54px; --left-header-height: 38px;">
      <div style="display: flex; width: 100%; height: 100%;">
        <div style="width: 54px; display: flex;">
          <PageRail active={page()} onSelect={setPage} onOpenSettings={fn()} />
        </div>
        <div style="flex: 1; display: grid; min-width: 0;">
          <ComingSoon title={page() === "agents" ? "Agents" : page().charAt(0).toUpperCase() + page().slice(1)} />
        </div>
      </div>
    </ThemeFrame>
  );
}

function MockedApp() {
  const previousApi = window.openbot;
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  onCleanup(() => {
    mock.dispose();
    window.openbot = previousApi;
  });
  return <App />;
}

const meta = {
  title: "Navigation/PageRail",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Dark: Story = {
  name: "Rail · dark",
  render: () => <RailShell theme="dark" />,
};

export const Light: Story = {
  name: "Rail · light",
  render: () => <RailShell theme="light" />,
};

export const ComingSoonDark: Story = {
  name: "Coming soon · dark",
  render: () => <RailShell theme="dark" initial="workflows" />,
};

export const ComingSoonLight: Story = {
  name: "Coming soon · light",
  render: () => <RailShell theme="light" initial="workflows" />,
};

export const InTheApp: Story = {
  name: "In the app (Schedule shows Coming soon, Agents keeps its list)",
  render: () => <MockedApp />,
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "Chief" });
    await expect(canvas.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Schedule" }));
    await expect(canvas.findByText("Coming soon")).resolves.toBeInTheDocument();
    await expect(canvas.getByRole("navigation", { name: "Chat list" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Agents" }));
    await expect(canvas.findByRole("heading", { name: "Chief" })).resolves.toBeInTheDocument();
  },
};
