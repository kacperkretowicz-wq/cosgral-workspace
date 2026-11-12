import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { MOCK_CHANNEL_TASKS } from "../channel-tasks";
import { ChannelTasksPanel } from "./ChannelTasksPanel";
import { ChatTasksSwitch } from "./ChatTasksSwitch";
import { createSignal } from "solid-js";

describe("Chat | Tasks", () => {
  it("switches mode without losing the channel label", async () => {
    const [mode, setMode] = createSignal<"chat" | "tasks">("chat");
    render(() => (
      <ChatTasksSwitch mode={mode()} onChange={setMode} channelLabel="# project-cosgral" />
    ));
    expect(screen.getByText("# project-cosgral")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(mode()).toBe("tasks");
    expect(screen.getByRole("tab", { name: "Tasks" })).toHaveAttribute("aria-selected", "true");
  });

  it("lists mock channel tasks with owners and states", () => {
    render(() => <ChannelTasksPanel tasks={MOCK_CHANNEL_TASKS} />);
    expect(screen.getByLabelText("Channel tasks")).toBeInTheDocument();
    expect(screen.getByText("Collect Needs you criteria")).toBeInTheDocument();
    expect(screen.getAllByText(/Research/).length).toBeGreaterThan(0);
  });

  it("calls stop for a running task", async () => {
    const onStop = vi.fn();
    render(() => <ChannelTasksPanel tasks={MOCK_CHANNEL_TASKS} onStop={onStop} />);
    const running = screen.getByText("Merge the B4 branch").closest("li");
    expect(running).toBeTruthy();
    await fireEvent.click(running!.querySelector("button")!);
    expect(onStop).toHaveBeenCalledWith("task-2");
  });
});
