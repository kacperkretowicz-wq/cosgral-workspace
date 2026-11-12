import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { MOCK_CHANNEL_TASKS } from "../channel-tasks";
import { ChannelTasksPanel } from "./ChannelTasksPanel";
import { ChatTasksSwitch } from "./ChatTasksSwitch";
import { createSignal } from "solid-js";

describe("Chat | Zadania", () => {
  it("switches mode without losing the channel label", async () => {
    const [mode, setMode] = createSignal<"chat" | "tasks">("chat");
    render(() => (
      <ChatTasksSwitch mode={mode()} onChange={setMode} channelLabel="# projekt-cosgral" />
    ));
    expect(screen.getByText("# projekt-cosgral")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("tab", { name: "Zadania" }));
    expect(mode()).toBe("tasks");
    expect(screen.getByRole("tab", { name: "Zadania" })).toHaveAttribute("aria-selected", "true");
  });

  it("lists mock channel tasks with owners and states", () => {
    render(() => <ChannelTasksPanel tasks={MOCK_CHANNEL_TASKS} />);
    expect(screen.getByLabelText("Zadania kanału")).toBeInTheDocument();
    expect(screen.getByText("Zebrać kryteria Needs you")).toBeInTheDocument();
    expect(screen.getAllByText(/Research/).length).toBeGreaterThan(0);
  });

  it("calls stop for a running task", async () => {
    const onStop = vi.fn();
    render(() => <ChannelTasksPanel tasks={MOCK_CHANNEL_TASKS} onStop={onStop} />);
    const running = screen.getByText("Scalenie gałęzi B4").closest("li");
    expect(running).toBeTruthy();
    await fireEvent.click(running!.querySelector("button")!);
    expect(onStop).toHaveBeenCalledWith("task-2");
  });
});
