import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { expect, it } from "vitest";
import { ViewTabList } from "./view-tabs";

it("wraps arrow navigation, supports Home/End and has one tab stop", async () => {
  const [value, setValue] = createSignal("a");
  render(() => (
    <ViewTabList
      idPrefix="demo"
      label="Views"
      value={value()}
      onChange={setValue}
      tabs={[
        { value: "a", label: "First" },
        { value: "b", label: "Middle" },
        { value: "c", label: "Last" },
      ]}
    />
  ));
  const first = screen.getByRole("tab", { name: "First" }),
    last = screen.getByRole("tab", { name: "Last" });
  expect(first).toHaveAttribute("tabindex", "0");
  expect(last).toHaveAttribute("tabindex", "-1");
  first.focus();
  await fireEvent.keyDown(first, { key: "ArrowLeft" });
  expect(last).toHaveFocus();
  expect(value()).toBe("c");
  await fireEvent.keyDown(last, { key: "Home" });
  expect(first).toHaveFocus();
  expect(value()).toBe("a");
  await fireEvent.keyDown(first, { key: "End" });
  expect(last).toHaveFocus();
  await fireEvent.keyDown(last, { key: "ArrowRight" });
  expect(first).toHaveFocus();
  expect(screen.getAllByRole("tab").filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
});
