import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { ChannelEditor } from "./ChannelEditor";

const bots = [
  { id: "a", name: "Planner" },
  { id: "b", name: "Writer" },
];
describe("ChannelEditor", () => {
  it("validates name and membership before creating a channel", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(() => <ChannelEditor bots={bots} onSave={save} onClose={close} />);
    await fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("lowercase");
    await fireEvent.input(screen.getByLabelText("Channel name"), { target: { value: "launch" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
    expect(screen.getByRole("alert")).toHaveTextContent("lead");
    await fireEvent.click(screen.getByRole("button", { name: "Planner" }));
    await fireEvent.change(screen.getByLabelText("Lead agent"), { target: { value: "a" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ name: "launch", leadBotId: "a", memberBotIds: ["a"] }),
      ),
    );
    expect(close).toHaveBeenCalledOnce();
  });
  it("keeps the draft and explains a rejected save", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Name already exists"));
    render(() => <ChannelEditor bots={bots} onSave={save} onClose={() => {}} />);
    await fireEvent.input(screen.getByLabelText("Channel name"), { target: { value: "launch" } });
    await fireEvent.click(screen.getByRole("button", { name: "Planner" }));
    await fireEvent.change(screen.getByLabelText("Lead agent"), { target: { value: "a" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create channel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name already exists");
    expect(screen.getByLabelText("Channel name")).toHaveValue("launch");
  });
});
