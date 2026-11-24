import { fireEvent, render, screen } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import { CONVERSATION_PANEL_MIN } from "./model";
import { SidePanelResizer } from "./SidePanelResizer";

const SIZES = { default: 300, min: 200, max: 900 } as const;

function setup(availableWidth: number, width = 300) {
  const onResize = vi.fn();
  const onResizeEnd = vi.fn();
  render(() => (
    <SidePanelResizer
      controls="files-side-panel"
      width={width}
      sizes={SIZES}
      availableWidth={() => availableWidth}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
    />
  ));
  return { separator: screen.getByRole("separator", { name: "Resize right panel" }), onResize, onResizeEnd };
}

it("describes the handle for the panel it controls", () => {
  const { separator } = setup(1400);
  expect(separator).toHaveAttribute("aria-controls", "files-side-panel");
  expect(separator).toHaveAttribute("aria-valuenow", "300");
  expect(separator).toHaveAttribute("aria-valuemin", String(SIZES.min));
});

it("allows the panel up to its own maximum when the conversation is wide", () => {
  const { separator } = setup(2000);
  expect(separator).toHaveAttribute("aria-valuemax", String(SIZES.max));
});

it("keeps room for the chat when the conversation is narrow", () => {
  const { separator } = setup(600);
  expect(separator).toHaveAttribute("aria-valuemax", String(600 - CONVERSATION_PANEL_MIN));
});

it("never goes below its own minimum even in a very narrow conversation", () => {
  const { separator } = setup(150);
  expect(separator).toHaveAttribute("aria-valuemax", String(SIZES.min));
});

it("widens with the keyboard and reports it", () => {
  const { separator, onResize } = setup(1400);
  fireEvent.keyDown(separator, { key: "ArrowLeft" });
  expect(onResize).toHaveBeenCalledWith(312);
});
