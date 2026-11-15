import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { ChatTasksSwitch } from "./ChatTasksSwitch";

describe("Chat | Tasks", () => {
  it("switches mode without losing the channel label", async () => {
    const [mode, setMode] = createSignal<"chat" | "tasks">("chat");
    render(() => <ChatTasksSwitch mode={mode()} onChange={setMode} channelLabel="# project-cosgral" />);
    expect(screen.getByText("# project-cosgral")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(mode()).toBe("tasks");
    expect(screen.getByRole("tab", { name: "Tasks" })).toHaveAttribute("aria-selected", "true");
  });
});
