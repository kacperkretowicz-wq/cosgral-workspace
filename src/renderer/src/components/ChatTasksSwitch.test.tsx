import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { describe, expect, it } from "vitest";
import { ChatTasksSwitch } from "./ChatTasksSwitch";
import { ViewTabPanel } from "./ui";

describe("Chat | Tasks", () => {
  it("switches mode without losing the channel label", async () => {
    const [mode, setMode] = createSignal<"chat" | "tasks">("chat");
    render(() => (
      <>
        <ChatTasksSwitch idPrefix="switch" onChange={setMode} mode={mode()} channelLabel="# project-cosgral" />
        <Show
          when={mode() === "chat"}
          fallback={
            <ViewTabPanel value="tasks" idPrefix="switch">
              Task panel
            </ViewTabPanel>
          }
        >
          <ViewTabPanel value="chat" idPrefix="switch">
            Chat panel
          </ViewTabPanel>
        </Show>
      </>
    ));
    expect(screen.getByText("# project-cosgral")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(mode()).toBe("tasks");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent("Task panel");
    expect(screen.getByRole("tab", { name: "Tasks" })).toHaveAttribute("aria-controls", panel.id);
    expect(screen.getByRole("tab", { name: "Tasks" })).toHaveAttribute("aria-selected", "true");
    const tasks = screen.getByRole("tab", { name: "Tasks" });
    tasks.focus();
    await fireEvent.keyDown(tasks, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Chat" })).toHaveFocus());
    expect(mode()).toBe("chat");
  });
});
