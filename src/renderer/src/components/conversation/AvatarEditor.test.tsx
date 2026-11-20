import { fireEvent, render, screen } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import { AvatarEditor } from "./AvatarEditor";

function setup(overrides: Partial<Parameters<typeof AvatarEditor>[0]> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onUploadFile: vi.fn(),
    onPickImage: vi.fn(),
    onRemoveImage: vi.fn(),
    onResetToId: vi.fn(),
    onNewSet: vi.fn(),
    onSelectFace: vi.fn(),
    onSelectHue: vi.fn(),
  };
  render(() => (
    <AvatarEditor
      open
      rootRef={() => {}}
      fileInputRef={() => {}}
      botId="bot-1"
      seed="seed-b"
      hue={null}
      url={null}
      uploadBusy={false}
      candidates={["seed-a", "seed-b", "seed-c"]}
      {...handlers}
      {...overrides}
    />
  ));
  return handlers;
}

it("reports a picked face, a colour, a new set and a reset to the agent id", () => {
  const handlers = setup();
  fireEvent.click(screen.getByRole("button", { name: "Avatar option 1" }));
  expect(handlers.onSelectFace).toHaveBeenCalledWith("seed-a");
  expect(screen.getByRole("button", { name: "Selected avatar" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Automatic avatar color" }));
  expect(handlers.onSelectHue).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByRole("button", { name: "New set" }));
  expect(handlers.onNewSet).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Reset to ID" }));
  expect(handlers.onResetToId).toHaveBeenCalledOnce();
});

it("offers to remove an uploaded image and hides the reset when the face is the agent id", () => {
  const handlers = setup({ url: "data:image/png;base64,AAAA", seed: "bot-1" });
  expect(screen.queryByRole("button", { name: "Reset to ID" })).toBeNull();
  expect(screen.getByText("Replace image")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(handlers.onRemoveImage).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Selected avatar" })).toBeNull();
});

it("blocks the image actions while an upload is running", () => {
  setup({ uploadBusy: true, url: "data:image/png;base64,AAAA" });
  expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
});
