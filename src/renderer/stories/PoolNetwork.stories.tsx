import type { AccountError } from "@openbot/contracts/ipc";
import { createSignal, Show } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AccountErrorCard } from "../src/components/AccountErrorCard";
import { ProviderAccounts } from "../src/components/ProviderAccounts";
import { createMockOpenBot } from "./mock-openbot";
import { ThemeFrame } from "./theme-frame";

const event: AccountError = {
  botId: "chief",
  provider: "codex",
  accountId: "demo",
  accountLabel: "Work",
  reason: "network-error",
  message: "Network error. The account was not counted as at its limit; nothing was switched.",
};
function Scene(props: { network?: boolean }) {
  const [dismissed, setDismissed] = createSignal(false);
  return (
    <ThemeFrame theme="dark">
      <div class="w2-library providers-page">
        <Show when={props.network} fallback={<ProviderAccounts />}>
          <Show when={!dismissed()}>
            <AccountErrorCard view={event} onDismiss={() => setDismissed(true)} />
          </Show>
        </Show>
      </div>
    </ThemeFrame>
  );
}
const meta = {
  title: "COSGRAL/Pool return and network",
  component: Scene,
  args: { network: false },
  beforeEach: () => {
    const previous = window.openbot;
    const mock = createMockOpenBot();
    window.openbot = mock.api;
    return () => {
      mock.dispose();
      window.openbot = previous;
    };
  },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
const toggle = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const c = within(canvasElement);
  const control = await c.findByRole("switch", { name: "Return to the first account after the limit resets" });
  await expect(control).toHaveAttribute("aria-checked", "true");
  const before = await window.openbot.subscriptions?.getPoolSettings();
  await userEvent.click(control);
  await waitFor(() => expect(control).toHaveAttribute("aria-checked", "false"));
  const after = await window.openbot.subscriptions?.getPoolSettings();
  await expect(after?.returnAfterReset).toBe(false);
  await expect(after?.maxAccountsPerProvider).toBe(before?.maxAccountsPerProvider);
};
export const PoolReturn: Story = { play: toggle };
export const NetworkDismiss: Story = {
  args: { network: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const card = c.getByRole("status", { name: "Network error for Work" });
    await expect(card).not.toHaveTextContent(/limit|continue/i);
    await userEvent.click(c.getByRole("button", { name: "Dismiss" }));
    await expect(c.queryByRole("status")).not.toBeInTheDocument();
  },
};
