import { createSignal, onCleanup } from "solid-js";
import { expect, fn, waitFor, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { App } from "../src/App";
import { ComingSoon } from "../src/components/ComingSoon";
import { type PageId, PageRail } from "../src/components/PageRail";
import { createMockOpenBot } from "./mock-openbot";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

function RailShell(props: { theme: StoryTheme; initial?: PageId; height?: string; initialPins?: PageId[] }) {
  const [pins, setPins] = createSignal<PageId[] | undefined>(props.initialPins);
  const [page, setPage] = createSignal<PageId>(props.initial ?? "agents");
  return (
    <ThemeFrame
      theme={props.theme}
      style={`height: ${props.height ?? "100vh"}; --page-rail-width: 54px; --left-header-height: 38px;`}
    >
      <div style="display: flex; width: 100%; height: 100%;">
        <div style="width: 54px; display: flex;">
          <PageRail
            active={page()}
            pinnedPageIds={pins()}
            onTogglePin={
              props.initialPins
                ? (id) =>
                    setPins((current) =>
                      (current ?? []).includes(id)
                        ? (current ?? []).filter((page) => page !== id)
                        : [...(current ?? []), id],
                    )
                : undefined
            }
            onSelect={setPage}
            onOpenSettings={fn()}
          />
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
  name: "In the app (Schedule opens the routines page, Agents keeps its list)",
  render: () => <MockedApp />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Chief" });
    await expect(canvas.getByRole("navigation", { name: "Pages" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /^More( \(|$)/ }));
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Schedule" }));
    await expect(canvas.findByRole("heading", { name: "Schedule" })).resolves.toBeInTheDocument();
    await expect(canvas.getByRole("navigation", { name: "Chat list" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Agents" }));
    await expect(canvas.findByRole("heading", { name: "Chief" })).resolves.toBeInTheDocument();
  },
};

export const Overflow: Story = {
  render: () => <RailShell theme="dark" initial="phone" height="300px" />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const more = await canvas.findByRole("button", { name: "More (current: Phone)" });
    await expect(canvas.getByRole("button", { name: "Settings" })).toBeVisible();
    await userEvent.click(more);
    const menu = await within(canvasElement.ownerDocument.body).findByRole("menu", { name: "More" });
    await expect(within(menu).getByRole("menuitem", { name: "Phone" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Library" }));
    // The page is drawn after the menu closes; wait for it instead of checking the first frame.
    await waitFor(() => expect(canvas.getByRole("heading", { name: "Library" })).toBeVisible());
  },
};
export const OverflowLight: Story = {
  ...Overflow,
  render: () => <RailShell theme="light" initial="phone" height="300px" />,
};

export const PinnedPages: Story = {
  render: () => <RailShell theme="dark" initial="phone" initialPins={["library", "providers"]} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("button", { name: "Library" })).toBeVisible();
    await expect(c.getByRole("button", { name: "Providers" })).toBeVisible();
    await expect(c.queryByRole("button", { name: "Phone" })).not.toBeInTheDocument();
  },
};
