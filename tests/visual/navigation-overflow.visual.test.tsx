import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import "../../src/renderer/src/styles.css";
import { type PageId, PageRail } from "../../src/renderer/src/components/PageRail";

afterEach(() => cleanup());
test("overflow navigation keeps pages and settings reachable by keyboard and restores buttons on growth", async () => {
  const [active, setActive] = createSignal<PageId>("phone");
  const { container } = render(() => (
    <div style="height:300px;width:54px;display:flex;--page-rail-width:54px;--left-header-height:38px">
      <PageRail active={active()} onSelect={setActive} onOpenSettings={() => {}} />
    </div>
  ));
  await expect.element(page.getByRole("button", { name: "More pages (current: Phone)" })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "More pages (current: Phone)" }).click();
  await expect.element(page.getByRole("menu", { name: "More pages" })).toBeVisible();
  await userEvent.keyboard("{End}");
  await expect.poll(() => document.activeElement?.textContent?.trim()).toBe("Phone");
  await userEvent.keyboard("{Home}");
  await expect.poll(() => document.activeElement?.textContent?.trim()).toBe("Workflows");
  await page.getByRole("menuitem", { name: "Library" }).click();
  expect(active()).toBe("library");
  await expect.element(page.getByRole("button", { name: "More pages (current: Library)" })).toBeVisible();
  const frame = container.firstElementChild;
  if (!(frame instanceof HTMLElement)) throw new Error("Rail frame missing");
  frame.style.height = "720px";
  await expect.element(page.getByRole("button", { name: "Phone" })).toBeVisible();
  expect(active()).toBe("library");
});
