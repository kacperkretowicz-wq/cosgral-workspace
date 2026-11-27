import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import "../../src/renderer/src/styles.css";
import "../../.storybook/preview.css";
import { Button } from "../../src/renderer/src/components/ui";
import { contrastRatio } from "../../src/renderer/stories/contrast";
import { type StoryTheme, ThemeFrame } from "../../src/renderer/stories/theme-frame";

afterEach(() => cleanup());
async function check(theme: StoryTheme) {
  const { getByRole } = render(() => (
    <ThemeFrame theme={theme}>
      <main class="foundation-story">
        <div class="bot-delete-actions">
          <Button variant="danger-solid" class="bot-delete-confirm">
            Delete item
          </Button>
          <Button variant="danger-solid" class="bot-delete-confirm" disabled>
            Delete unavailable
          </Button>
        </div>
        <Button variant="danger">Soft danger</Button>
      </main>
    </ThemeFrame>
  ));
  const button = getByRole("button", { name: "Delete item" }),
    disabled = getByRole("button", { name: "Delete unavailable" });
  await userEvent.unhover(button);
  const assertContrast = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  };
  const disabledBackground = getComputedStyle(disabled).backgroundColor;
  assertContrast(button);
  assertContrast(disabled);
  const evidence = import.meta.env.VITE_COSGRAL_UI_EVIDENCE_DIR;
  if (evidence) await page.screenshot({ path: `${evidence}/danger-${theme}.png` });
  expect(getComputedStyle(disabled).opacity).toBe("1");
  expect(disabled.hasAttribute("disabled")).toBe(true);
  await userEvent.hover(button);
  await expect
    .poll(() => getComputedStyle(button).backgroundColor)
    .not.toBe(getComputedStyle(disabled).backgroundColor);
  assertContrast(button);
  await userEvent.unhover(button);
  button.focus();
  expect(document.activeElement).toBe(button);
  await userEvent.keyboard("[Space>]");
  await expect.poll(() => button.matches(":active")).toBe(true);
  assertContrast(button);
  await userEvent.keyboard("[/Space]");
  await userEvent.hover(disabled);
  expect(getComputedStyle(disabled).backgroundColor).toBe(disabledBackground);
  assertContrast(disabled);
  const soft = getByRole("button", { name: "Soft danger" });
  await userEvent.hover(soft);
  assertContrast(soft);
  await expect.poll(() => getComputedStyle(soft).backgroundColor).not.toContain("rgba");
  assertContrast(soft);
}
test("solid danger and soft hover keep contrast in the dark theme", () => check("dark"));
