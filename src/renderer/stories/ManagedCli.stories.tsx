import type { ManagedCliState } from "@openbot/contracts/ipc";
import { expect, fn, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ManagedCliCard } from "../src/components/ManagedCliSection";
import { ThemeFrame } from "./theme-frame";

const empty: ManagedCliState = {
  id: "codex",
  source: "none",
  executable: null,
  version: null,
  managedVersion: null,
  pinnedVersion: null,
  latestVersion: "1.0.0",
  autoUpdate: true,
  customPath: null,
  phase: "idle",
  progress: null,
  error: null,
  checkedAt: null,
};
const meta = {
  title: "COSGRAL/Managed CLI",
  component: ManagedCliCard,
  args: { state: empty, onAction: fn() },
  decorators: [
    (Story) => (
      <ThemeFrame theme="dark">
        <Story />
      </ThemeFrame>
    ),
  ],
} satisfies Meta<typeof ManagedCliCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Missing: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Download" }));
    await expect(args.onAction).toHaveBeenCalledWith("installCli", { id: "codex" });
    await expect(c.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  },
};
export const Downloading: Story = {
  args: { state: { ...empty, phase: "downloading", progress: { receivedBytes: 512, totalBytes: 1024 } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    await expect(c.getByRole("button", { name: "Download" })).toBeDisabled();
  },
};
export const Failed: Story = {
  args: { state: { ...empty, phase: "error", error: "Brak połączenia. Spróbuj ponownie." } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Retry" })).toBeEnabled();
  },
};
export const AutoUpdateOff: Story = {
  args: { state: { ...empty, source: "managed", managedVersion: "1.0.0", version: "1.0.0", autoUpdate: false } },
};
export const CustomPath: Story = {
  args: { state: { ...empty, source: "custom", customPath: "C:\\Tools\\codex.exe", version: "1.0.0" } },
};
export const AwaitingApproval: Story = { args: { state: { ...empty, phase: "awaiting-approval" } } };
export const Verifying: Story = { args: { state: { ...empty, phase: "verifying" } } };
export const Installing: Story = { args: { state: { ...empty, phase: "installing" } } };
export const Light: Story = {
  decorators: [
    (Story) => (
      <ThemeFrame theme="light">
        <Story />
      </ThemeFrame>
    ),
  ],
};
