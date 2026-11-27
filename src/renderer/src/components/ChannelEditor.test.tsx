import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { ChannelEditor, saveProblemText } from "./ChannelEditor";

const bots = [
  { id: "a", name: "Planner" },
  { id: "b", name: "Writer" },
];
describe("ChannelEditor", () => {
  it("validates name and membership before creating a channel", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(() => <ChannelEditor bots={bots} onSave={save} onClose={close} />);
    await fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("lowercase");
    await fireEvent.input(screen.getByLabelText("Project name"), { target: { value: "launch" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(screen.getByRole("alert")).toHaveTextContent("lead");
    await fireEvent.click(screen.getByRole("button", { name: "Planner" }));
    await fireEvent.change(screen.getByLabelText("Lead agent"), { target: { value: "a" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create project" }));
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
    await fireEvent.input(screen.getByLabelText("Project name"), { target: { value: "launch" } });
    await fireEvent.click(screen.getByRole("button", { name: "Planner" }));
    await fireEvent.change(screen.getByLabelText("Lead agent"), { target: { value: "a" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name already exists");
    expect(screen.getByLabelText("Project name")).toHaveValue("launch");
  });
  it("says in plain Polish that a project name is taken, without the word channel", () => {
    setLanguage("pl");
    flush();
    try {
      const taken = new Error("Error invoking remote method 'x': Error: A channel named pokaz-projekt already exists.");
      expect(saveProblemText(taken)).toBe("Projekt o nazwie pokaz-projekt już istnieje. Wybierz inną nazwę.");
      expect(saveProblemText(new Error("The lead must be a member of the channel."))).toBe(
        "Wybierz lidera spośród członków projektu.",
      );
      expect(saveProblemText("nope")).toBe("Nie udało się zapisać projektu. Spróbuj ponownie.");
    } finally {
      setLanguage("en");
      flush();
    }
  });
});
