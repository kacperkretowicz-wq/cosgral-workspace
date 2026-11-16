import { createSignal, onCleanup } from "solid-js";
import { expect, waitFor, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { SettingsModal } from "../src/components/SettingsModal";
import { Button, Heading, Text } from "../src/components/ui";
import { createMockOpenBot } from "./mock-openbot";

function SettingsModalStory(props: { initialOpen: boolean; theme?: "dark" | "light" }) {
  const previousTheme = document.documentElement.getAttribute("data-theme");
  document.documentElement.setAttribute("data-theme", props.theme ?? "dark");
  onCleanup(() => {
    if (previousTheme) document.documentElement.setAttribute("data-theme", previousTheme);
    else document.documentElement.removeAttribute("data-theme");
  });
  const previousApi = window.openbot;
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  onCleanup(() => {
    mock.dispose();
    window.openbot = previousApi;
  });
  const [open, setOpen] = createSignal(props.initialOpen);

  return (
    <main class="foundation-story foundation-interaction-stage">
      <Heading as="h1" size="lg">
        Workspace settings
      </Heading>
      <Text tone="secondary">Preview the standalone settings surface before it is connected to the app.</Text>
      <Button type="button" onClick={() => setOpen(true)}>
        Open settings
      </Button>
      <SettingsModal open={open()} onOpenChange={setOpen} />
    </main>
  );
}

const meta = {
  title: "Settings/SettingsModal",
  component: SettingsModal,
  args: { open: false, onOpenChange: () => undefined },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof SettingsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  render: () => <SettingsModalStory initialOpen />,
};

export const Interactive: Story = {
  render: () => <SettingsModalStory initialOpen={false} />,
  play: async ({ canvas, userEvent }) => {
    const body = within(document.body);
    const trigger = canvas.getByRole("button", { name: "Open settings" });

    await userEvent.click(trigger);
    let dialog = await body.findByRole("dialog", { name: "General" });
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(body.getByTestId("settings-modal-scroll-frame")).toHaveAttribute("data-scroll-down");
    await expect(body.getByRole("button", { name: "Appearance" })).toBeEnabled();
    await expect(body.getByRole("button", { name: "Notifications" })).toBeDisabled();
    await expect(body.getByRole("button", { name: "Advanced" })).toBeDisabled();

    await userEvent.click(body.getByRole("button", { name: "Appearance" }));
    await body.findByRole("dialog", { name: "Appearance" });
    const theme = await body.findByLabelText("Theme");
    await waitFor(() => expect(theme).toBeEnabled());
    await userEvent.selectOptions(theme, "light");
    await waitFor(() => expect(theme).toHaveValue("light"));
    await waitFor(() => expect(theme).toBeEnabled());
    await expect((await window.openbot.appSettings?.get())?.theme).toBe("light");
    await userEvent.click(body.getByRole("button", { name: "General" }));
    dialog = await body.findByRole("dialog", { name: "General" });

    const launchSwitch = body.getByRole("switch", { name: "Launch COSGRAL Workspace at login" });
    await expect(launchSwitch).toBeChecked();
    await userEvent.click(launchSwitch);
    await waitFor(() => expect(launchSwitch).not.toBeChecked());

    await userEvent.click(body.getByRole("button", { name: "Close settings" }));
    // The Solid effect and the 120 ms exit animation are scheduled separately from userEvent.
    // Assert removal of the captured dialog, including hidden nodes, rather than a transient frame.
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    dialog = await body.findByRole("dialog", { name: "General" });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    dialog = await body.findByRole("dialog", { name: "General" });
    await userEvent.click(body.getByTestId("settings-modal-backdrop"));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const OpenLight: Story = { render: () => <SettingsModalStory initialOpen theme="light" /> };
