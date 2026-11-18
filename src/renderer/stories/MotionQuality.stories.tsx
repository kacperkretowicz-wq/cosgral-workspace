import { For } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Button, Heading, Text } from "../src/components/ui";
import { contrastRatio } from "./contrast";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

/** UI-AE: card arrive, skeleton, button press — own CSS, inspired by openbot.run rhythm (no site code). */
function Scene(props: { theme: StoryTheme }) {
  const labels = ["Memories", "Files", "Folders", "Usage", "Skills", "Tools"];
  return (
    <ThemeFrame theme={props.theme} style="min-height: 100vh; padding: 24px; box-sizing: border-box;">
      <div style="max-width: 420px; display: grid; gap: 20px;">
        <Heading as="h1" size="lg">
          Motion quality
        </Heading>
        <section class="agent-cards" aria-label="Arrive demo">
          <Text as="p" tone="muted">
            Cards arrive one after another (transform only).
          </Text>
          <ul class="agent-cards-list" style="list-style: none; margin: 0; padding: 0; display: grid; gap: 8px;">
            <For each={labels}>
              {(label) => (
                <li
                  class="agent-card-row"
                  style="display: flex; gap: 10px; padding: 10px 12px; border-radius: var(--cosgral-radius-md); background: var(--cosgral-bg-surface); border: 1px solid var(--cosgral-border);"
                >
                  <strong>{label}</strong>
                </li>
              )}
            </For>
          </ul>
        </section>
        <section aria-label="Skeleton demo">
          <Text as="p" tone="muted">
            Loading skeleton (pulse), not bare text.
          </Text>
          <div class="agent-cards-skeleton" role="status" aria-label="Loading cards…">
            <span class="cosgral-skeleton cosgral-skeleton-wide" />
            <span class="cosgral-skeleton cosgral-skeleton-mid" />
            <span class="cosgral-skeleton cosgral-skeleton-wide" />
          </div>
        </section>
        <section aria-label="Press demo">
          <Text as="p" tone="muted">
            Press a button (120 ms scale).
          </Text>
          <Button type="button" variant="primary">
            Press me
          </Button>
        </section>
      </div>
    </ThemeFrame>
  );
}

const meta = {
  title: "COSGRAL/Motion quality",
  component: Scene,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof Scene>;
export default meta;
type Story = StoryObj<typeof meta>;

async function assertContrast(canvas: HTMLElement, theme: StoryTheme) {
  const sample = within(canvas).getByText("Memories");
  const styles = getComputedStyle(sample);
  const bg = theme === "dark" ? "rgb(26, 26, 26)" : "rgb(246, 246, 248)";
  expect(contrastRatio(styles.color, bg)).toBeGreaterThanOrEqual(4.5);
  expect(within(canvas).getByRole("status", { name: "Loading cards…" })).toBeInTheDocument();
  expect(canvas.querySelectorAll(".cosgral-skeleton")).toHaveLength(3);
  await userEvent.click(within(canvas).getByRole("button", { name: "Press me" }));
}

export const Dark: Story = {
  args: { theme: "dark" },
  play: async ({ canvasElement }) => {
    await assertContrast(canvasElement, "dark");
  },
};

export const Light: Story = {
  args: { theme: "light" },
  play: async ({ canvasElement }) => {
    await assertContrast(canvasElement, "light");
  },
};
