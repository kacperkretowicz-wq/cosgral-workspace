import type { AccountSwitched } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AccountSwitchedCard } from "../src/components/AccountLimitCards";
import { addAccountNotice } from "../src/components/account-usage-view";
import { providerError } from "../src/components/provider-error";
import { Text } from "../src/components/ui";
import { ThemeFrame } from "./theme-frame";

const returned: AccountSwitched = {
  botId: "demo",
  provider: "codex",
  fromAccountId: "backup",
  fromLabel: "Backup",
  toAccountId: "first",
  toLabel: "First",
  reason: "returned",
};
function Scene(props: { error?: boolean }) {
  const initial = addAccountNotice(
    addAccountNotice([], { type: "account-switched", ...returned }, "return"),
    {
      ...returned,
      type: "account-switched",
      fromAccountId: "first",
      fromLabel: "First",
      toAccountId: "other",
      toLabel: "Other",
      reason: "usage-limit",
    },
    "switch",
  );
  const [notices, setNotices] = createSignal(initial);
  return (
    <ThemeFrame theme="dark">
      <div class="w2-library providers-page">
        <Show
          when={props.error}
          fallback={
            <For each={notices()}>
              {(notice) =>
                notice.kind === "switched" ? (
                  <AccountSwitchedCard view={notice.view} onDismiss={() => setNotices([])} />
                ) : null
              }
            </For>
          }
        >
          <Text as="p" role="alert" tone="danger">
            {providerError(
              new Error("Error invoking remote method 'providers:set-fallback-models': Error: At most 8 models."),
              "Could not save.",
            )}
          </Text>
        </Show>
      </div>
    </ThemeFrame>
  );
}
const meta = {
  title: "COSGRAL/Provider feedback",
  component: Scene,
  args: { error: false },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;
const merged = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const c = within(canvasElement);
  await expect(c.getAllByRole("status")).toHaveLength(1);
  await expect(c.getByText(/Returned from Backup to First/)).toBeInTheDocument();
  await expect(c.getByText(/switched to Other/)).toBeInTheDocument();
};
export const MergedSwitch: Story = { play: merged };
export const Dismiss: Story = {
  play: async (context) => {
    await merged(context);
    const c = within(context.canvasElement);
    await userEvent.click(c.getByRole("button", { name: "Dismiss" }));
    await expect(c.queryByRole("status")).not.toBeInTheDocument();
  },
};
export const CleanError: Story = {
  args: { error: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("At most 8 models.");
  },
};
