import type { ProviderAccount } from "@openbot/contracts/ipc";
import { onCleanup } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AgentAccountPicker } from "../src/components/AgentAccountPicker";
import { ProviderAccounts } from "../src/components/ProviderAccounts";
import { createMockOpenBot } from "./mock-openbot";
import { ThemeFrame } from "./theme-frame";

const own: ProviderAccount = {
  id: "acc-demo0001",
  provider: "codex",
  label: "Praca",
  stateDir: "acc-demo0001",
  system: false,
  loggedIn: false,
  account: null,
  plan: null,
  isDefault: false,
  inPool: false,
  poolOrder: 2,
  enabled: true,
  limitedUntil: null,
  login: { phase: "idle", message: null, url: null, userCode: null },
  checkedAt: null,
};
function Scene(props: {
  variant: "empty" | "system" | "limit" | "error" | "code" | "waiting" | "live";
  light?: boolean;
}) {
  const mock = createMockOpenBot();
  const previous = window.openbot;
  const api = mock.api.subscriptions;
  if (api && props.variant !== "live") {
    const original = api.listAccounts;
    api.listAccounts = async () => {
      const s = await original();
      let accounts = s.accounts;
      if (props.variant === "empty") accounts = [];
      if (["error", "code", "waiting"].includes(props.variant))
        accounts = [
          {
            ...own,
            login: {
              phase:
                props.variant === "error"
                  ? "error"
                  : props.variant === "code"
                    ? "code-required"
                    : "waiting-for-browser",
              message: props.variant === "error" ? "Sign-in failed. Try again." : null,
              url: "https://example.invalid/login",
              userCode: null,
            },
          },
        ];
      return { ...s, accounts, pool: { ...s.pool, maxAccountsPerProvider: props.variant === "limit" ? 1 : 3 } };
    };
  }
  window.openbot = mock.api;
  onCleanup(() => {
    mock.dispose();
    window.openbot = previous;
  });
  return (
    <ThemeFrame theme={props.light ? "light" : "dark"}>
      <div class="w2-library providers-page">
        <ProviderAccounts />
        <AgentAccountPicker botId="chief" provider="codex" />
      </div>
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/Provider accounts", component: Scene, args: { variant: "system" } } satisfies Meta<
  typeof Scene
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {
  args: { variant: "empty" },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findAllByText(/No accounts yet\. Add the first account for this provider\./),
    ).toHaveLength(2);
  },
};
export const SystemOnly: Story = {
  args: { variant: "system" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await c.findByText("Codex (this computer)");
    await expect(c.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  },
};
export const PoolLimit: Story = {
  args: { variant: "limit" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await c.findAllByText(/Maximum number of accounts reached/);
    for (const b of c.getAllByRole("button", { name: "Add account" })) await expect(b).toBeDisabled();
  },
};
export const LoginError: Story = {
  args: { variant: "error" },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("button", { name: "Retry sign-in" })).toBeEnabled();
  },
};
export const CodeRequired: Story = {
  args: { variant: "code" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByLabelText("Sign-in code")).toHaveAttribute("type", "password");
  },
};
export const WaitingForBrowser: Story = { args: { variant: "waiting" } };
export const Light: Story = { args: { variant: "system", light: true } };
export const AddAndLogin: Story = {
  args: { variant: "live" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const label = await c.findByLabelText("Account label for Codex");
    await userEvent.type(label, "Praca");
    const provider = within(c.getByRole("region", { name: "Accounts for codex" }));
    await userEvent.click(provider.getByRole("button", { name: "Add account" }));
    const card = within(await c.findByRole("group", { name: "Praca" }));
    await userEvent.click(card.getByRole("button", { name: "Sign in" }));
    await expect(await card.findAllByText("Signed in", {}, { timeout: 4000 })).not.toHaveLength(0);
    await userEvent.click(card.getByRole("button", { name: "Move Praca up" }));
    await card.findByText("Pool order: 1");
  },
};
