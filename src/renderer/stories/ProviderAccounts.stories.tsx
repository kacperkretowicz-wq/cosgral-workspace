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
              message: props.variant === "error" ? "Nie udało się zalogować. Spróbuj ponownie." : null,
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
    await expect(await within(canvasElement).findAllByText(/Nie ma kont/)).toHaveLength(2);
  },
};
export const SystemOnly: Story = {
  args: { variant: "system" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await c.findByText("Codex (this computer)");
    await expect(c.queryByRole("button", { name: "Usuń" })).not.toBeInTheDocument();
  },
};
export const PoolLimit: Story = {
  args: { variant: "limit" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await c.findAllByText(/Osiągnięto maksymalną liczbę/);
    for (const b of c.getAllByRole("button", { name: "Dodaj konto" })) await expect(b).toBeDisabled();
  },
};
export const LoginError: Story = {
  args: { variant: "error" },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("button", { name: "Ponów logowanie" })).toBeEnabled();
  },
};
export const CodeRequired: Story = {
  args: { variant: "code" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByLabelText("Kod logowania")).toHaveAttribute("type", "password");
  },
};
export const WaitingForBrowser: Story = { args: { variant: "waiting" } };
export const Light: Story = { args: { variant: "system", light: true } };
export const AddAndLogin: Story = {
  args: { variant: "live" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const label = await c.findByLabelText("Etykieta konta Codex");
    await userEvent.type(label, "Praca");
    const provider = within(c.getByRole("region", { name: "Konta codex" }));
    await userEvent.click(provider.getByRole("button", { name: "Dodaj konto" }));
    const card = within(await c.findByRole("group", { name: "Praca" }));
    await userEvent.click(card.getByRole("button", { name: "Zaloguj" }));
    await card.findByText(/Zalogowane/, {}, { timeout: 4000 });
    const up = card.getByRole("button", { name: "Przesuń Praca w górę" });
    up.focus();
    await userEvent.keyboard("{Enter}");
    await card.findByText("Kolejność puli: 1");
  },
};
