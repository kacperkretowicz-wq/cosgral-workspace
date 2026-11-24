import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import type { BotProfile } from "../../data";
import { AgentRecipientPicker } from "./AgentRecipientPicker";

const bot = (id: string, name: string): BotProfile => ({
  id,
  name,
  role: "Assistant",
  description: "",
  notifications: false,
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  threadId: null,
  avatarSeed: id,
  avatarHue: null,
  avatarUrl: null,
  time: "",
  preview: "",
});

function setup(creating = false) {
  const handlers = { onCreate: vi.fn(), onSelect: vi.fn(), onClose: vi.fn() };
  render(() => (
    <AgentRecipientPicker
      bots={[bot("a", "Alice"), bot("b", "Boris")]}
      open
      creating={creating}
      inputRef={() => {}}
      {...handlers}
    />
  ));
  return handlers;
}

it("lists the agents with the create option and reports the one that is picked", () => {
  const handlers = setup();
  expect(screen.getByRole("option", { name: "Create new agent" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "Boris" }));
  expect(handlers.onSelect).toHaveBeenCalledWith("b");
  fireEvent.click(screen.getByRole("option", { name: "Create new agent" }));
  expect(handlers.onCreate).toHaveBeenCalledOnce();
});

it("filters the agents by what is typed and closes on Escape", async () => {
  const handlers = setup();
  const input = screen.getByPlaceholderText("Search or create agents");
  fireEvent.input(input, { target: { value: "ali" } });
  await waitFor(() => expect(screen.queryByRole("option", { name: "Boris" })).toBeNull());
  expect(screen.getByRole("option", { name: "Alice" })).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(handlers.onClose).toHaveBeenCalledOnce();
});

it("shows that an agent is being created", () => {
  setup(true);
  expect(screen.getByText("Creating agent…")).toBeInTheDocument();
});
