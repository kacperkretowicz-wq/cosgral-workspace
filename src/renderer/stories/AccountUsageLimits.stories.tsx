import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { AccountLimitReachedCard, AccountSwitchedCard } from "../src/components/AccountLimitCards";
import { AccountUsageMeter } from "../src/components/AccountUsageMeter";
import { accountUsageFromSources } from "../src/components/account-usage-view";
import { ThemeFrame } from "./theme-frame";

const nowMs = Date.UTC(2026, 10, 16, 15, 30, 0);
const account: {
  id: string;
  label: string;
  provider: "codex" | "claude";
  limitedUntil: string | null;
} = {
  id: "acc-work",
  label: "Work Codex",
  provider: "codex",
  limitedUntil: null,
};

function Scene(props: { variant: "ok" | "exhausted" | "unknown" | "limit-switched" | "limit-all" | "switched" }) {
  const [dismissed, setDismissed] = createSignal(false);

  const ok = accountUsageFromSources({
    account,
    primary: { usedPercent: 38, windowDurationMins: 300, resetsAt: Math.floor(nowMs / 1000) + 4_200 },
    secondary: { usedPercent: 12, windowDurationMins: 10_080, resetsAt: Math.floor(nowMs / 1000) + 120_000 },
    nowMs,
  });
  const exhausted = accountUsageFromSources({
    account: { ...account, limitedUntil: new Date(nowMs + 3_600_000).toISOString() },
    primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: Math.floor(nowMs / 1000) + 3_600 },
    secondary: { usedPercent: 97, windowDurationMins: 10_080, resetsAt: Math.floor(nowMs / 1000) + 86_400 },
    nowMs,
    reason: "Weekly ChatGPT limit reached.",
  });
  const unknown = accountUsageFromSources({
    account: { ...account, label: "Home Claude", provider: "claude" },
    providerUsage: { state: "unavailable", usedPercent: null, resetsAt: null, reason: "CLI not installed." },
    nowMs,
  });

  return (
    <ThemeFrame theme="dark">
      <div class="w2-library account-usage-story">
        {props.variant === "ok" ? <AccountUsageMeter usage={ok} nowMs={nowMs} /> : null}
        {props.variant === "exhausted" ? <AccountUsageMeter usage={exhausted} nowMs={nowMs} /> : null}
        {props.variant === "unknown" ? <AccountUsageMeter usage={unknown} nowMs={nowMs} /> : null}
        {props.variant === "limit-switched" ? (
          <AccountLimitReachedCard
            view={{
              reason: "Work Codex reached its usage limit before this turn did anything.",
              exhaustedAccountLabel: "Work Codex",
              outcome: "switched",
              nextAccountLabel: "Home Codex",
              resetsAt: Math.floor(nowMs / 1000) + 7_200,
              resetsAtAssumed: false,
            }}
            nowMs={nowMs}
            onDismiss={() => setDismissed(true)}
          />
        ) : null}
        {props.variant === "limit-all" ? (
          <AccountLimitReachedCard
            view={{
              reason: "Home Codex reached its usage limit and no other account in the pool is free.",
              exhaustedAccountLabel: "Home Codex",
              outcome: "exhausted",
              nextAccountLabel: null,
              resetsAt: Math.floor(nowMs / 1000) + 7_200,
              resetsAtAssumed: true,
            }}
            nowMs={nowMs}
          />
        ) : null}
        {props.variant === "switched" && !dismissed() ? (
          <AccountSwitchedCard
            view={{
              toAccountLabel: "Home Codex",
              fromAccountLabel: "Work Codex",
              reason: "Switched because the previous account reached its usage limit.",
            }}
            onDismiss={() => setDismissed(true)}
          />
        ) : null}
        {dismissed() ? <p>Dismissed</p> : null}
      </div>
    </ThemeFrame>
  );
}

const meta = {
  title: "COSGRAL/Account usage limits",
  component: Scene,
  args: { variant: "ok" },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const UsageOk: Story = {
  args: { variant: "ok" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "Usage for Work Codex" })).toBeInTheDocument();
    await expect(canvas.getByRole("meter", { name: "5-hour window" })).toHaveValue(38);
  },
};

export const UsageExhausted: Story = {
  args: { variant: "exhausted" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "Usage for Work Codex" })).toHaveAttribute(
      "data-state",
      "exhausted",
    );
    await expect(canvas.getByText("Weekly ChatGPT limit reached.")).toBeInTheDocument();
  },
};

export const UsageUnknown: Story = {
  args: { variant: "unknown" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "Usage for Home Claude" })).toHaveAttribute(
      "data-state",
      "unknown",
    );
    await expect(canvas.getByText("Usage not reported")).toBeInTheDocument();
  },
};

export const LimitSwitched: Story = {
  args: { variant: "limit-switched" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByText(/goes back to its first account by itself/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /Return to/ })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(body.getByText("Dismissed")).toBeInTheDocument();
  },
};

export const LimitAllExhausted: Story = {
  args: { variant: "limit-all" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Every account in the pool is exhausted/)).toBeInTheDocument();
    await expect(canvas.getByText(/Assumed reset at/)).toBeInTheDocument();
  },
};

export const SwitchedNotice: Story = {
  args: { variant: "switched" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("status", { name: "Switched to account Home Codex" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(body.getByText("Dismissed")).toBeInTheDocument();
  },
};
